"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchCreditsBalance, USE_MOCK } from "@/lib/marketing/api";
import {
  readMarketingApiCache,
  writeMarketingApiCache,
} from "@/lib/marketing/session-cache";
import { billingApi } from "@/lib/billing/api";
import type { CreditBucketBreakdown } from "@/lib/billing/api";
import { MarketingApiError } from "@/lib/marketing/marketing-proxy";
import { InsufficientCreditsError } from "@/lib/marketing/guard";
import type { CreditsBalance, MarketingResponse } from "@/lib/marketing/types";

export type MarketingLedgerRecord = (
  endpoint: string,
  consumedCredits: number,
  cacheHit: boolean,
  remainingCredits: number
) => void;

export type MarketingRunFn = <T extends MarketingResponse<unknown>>(
  endpoint: string,
  cacheKey: string,
  fn: () => Promise<T>
) => Promise<T>;

export interface MarketingContext {
  estimate: number | null;
  lastActual: number | null;
  cacheHit: boolean | null;
}

export interface ConsumeSyncError {
  endpoint: string;
  amount: number;
  message: string;
  at: number;
}

export interface LastConsume {
  estimate: number;
  actual: number;
  cacheHit: boolean;
  /** 命中 pipispy「3 天免费窗口」：本次详情不重复计费（仅标注，真实扣点以 actual 为准）。 */
  freeWindow?: boolean;
}

/**
 * 运营中心 · 统一出站调用 Hook。
 * 计费权威在服务端（§4.3）：/marketing/data 已按 U×2 完成扣减并返回 remainingUserCredits。
 * 本 Hook 不再二次扣减，仅把服务端返回的权威余额同步到「用户钱包」展示，并暴露 402 不足态。
 */
export function useMarketingRunner(record: MarketingLedgerRecord) {
  // mock 模式：沿用 pipispy 账户余额模型（本地模拟）；真实模式：用用户钱包（billing/credits/buckets）。
  const [account, setAccount] = useState<CreditsBalance | null>(null);
  const accountRef = useRef<CreditsBalance | null>(null);
  const [wallet, setWallet] = useState<CreditBucketBreakdown | null>(null);
  const [insufficient, setInsufficient] = useState(false);

  useEffect(() => {
    let alive = true;
    if (USE_MOCK) {
      fetchCreditsBalance().then((b) => {
        if (!alive) return;
        accountRef.current = b;
        setAccount(b);
      });
    } else {
      // 真实模式：拉用户钱包（双桶）。失败静默降级，不影响视图渲染。
      billingApi
        .creditBuckets()
        .then((w) => alive && setWallet(w))
        .catch(() => {});
    }
    return () => {
      alive = false;
    };
  }, []);

  const refreshWallet = useCallback(() => {
    if (USE_MOCK) return;
    billingApi.creditBuckets().then(setWallet).catch(() => {});
  }, []);

  const [ctx, setCtx] = useState<MarketingContext>({
    estimate: null,
    lastActual: null,
    cacheHit: null,
  });
  const [lastConsume, setLastConsume] = useState<LastConsume | null>(null);
  const [consumeError, setConsumeError] = useState<ConsumeSyncError | null>(null);
  const cacheRef = useRef<Map<string, unknown>>(new Map());

  const run = useCallback<MarketingRunFn>(
    (endpoint, cacheKey, fn) => {
      const execute = async (): Promise<MarketingResponse<unknown>> => {
        let cached = cacheRef.current.get(cacheKey);
        if (cached === undefined) {
          const fromSession = readMarketingApiCache(cacheKey);
          if (fromSession !== undefined) {
            cacheRef.current.set(cacheKey, fromSession);
            cached = fromSession;
          }
        }
        if (cached !== undefined) {
          const remaining = USE_MOCK
            ? accountRef.current?.remainingApiCredits ?? 0
            : wallet?.balanceCredits ?? 0;
          record(endpoint, 0, true, remaining);
          setCtx({ estimate: 0, lastActual: 0, cacheHit: true });
          setLastConsume({ estimate: 0, actual: 0, cacheHit: true });
          return cached as MarketingResponse<unknown>;
        }

        let res: MarketingResponse<unknown>;
        try {
          res = await fn();
        } catch (err) {
          // 服务端 402：余额不足 → 交给余额不足弹窗，视图不再显示通用错误红框。
          if (err instanceof MarketingApiError && err.status === 402) {
            setInsufficient(true);
            throw new InsufficientCreditsError();
          }
          throw err;
        }

        cacheRef.current.set(cacheKey, res);
        writeMarketingApiCache(cacheKey, res);

        // 真实模式：以服务端返回的权威余额为准（remainingUserCredits 即扣费后用户钱包剩余）。
        // 不再本地推算、不再二次扣减。免费/窗口命中时 chargedCredits 为 0。
        const actual = res.chargedCredits ?? res.consumedCredits ?? 0;
        const remaining = USE_MOCK
          ? res.remainingCredits ?? accountRef.current?.remainingApiCredits ?? 0
          : res.remainingUserCredits ?? wallet?.balanceCredits ?? 0;

        if (USE_MOCK && accountRef.current) {
          const next: CreditsBalance = {
            ...accountRef.current,
            remainingApiCredits: res.remainingCredits ?? accountRef.current.remainingApiCredits,
            usedApiCredits:
              accountRef.current.totalApiCredits -
              (res.remainingCredits ?? accountRef.current.remainingApiCredits),
          };
          accountRef.current = next;
          setAccount(next);
        } else if (!USE_MOCK && res.remainingUserCredits != null) {
          // 乐观更新钱包余额（随后由 refreshWallet 校正桶拆分）。
          setWallet((w) => (w ? { ...w, balanceCredits: res.remainingUserCredits! } : w));
        }

        record(endpoint, actual, false, remaining);
        setCtx({ estimate: actual, lastActual: actual, cacheHit: false });
        setLastConsume({ estimate: actual, actual, cacheHit: false, freeWindow: res.freeWindow });
        setConsumeError(null);
        return res;
      };

      return execute() as unknown as Promise<Awaited<ReturnType<typeof fn>>>;
    },
    [record, wallet]
  );

  return {
    account,
    wallet,
    insufficient,
    clearInsufficient: () => setInsufficient(false),
    refreshWallet,
    ctx,
    lastConsume,
    consumeError,
    run,
  };
}
