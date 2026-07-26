"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchCreditsBalance, USE_MOCK } from "@/lib/marketing/api";
import {
  readMarketingApiCache,
  writeMarketingApiCache,
} from "@/lib/marketing/session-cache";
import { billingApi } from "@/lib/billing/api";
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
 * 负责：账户余额获取、会话内缓存、积分消耗反馈（响应里的真实扣点 + 用量明细）。
 * 不在请求前弹确认；用户通过顶部余额与用量抽屉查看消耗。
 */
export function useMarketingRunner(record: MarketingLedgerRecord) {
  const [account, setAccount] = useState<CreditsBalance | null>(null);
  const accountRef = useRef<CreditsBalance | null>(null);

  useEffect(() => {
    let alive = true;
    fetchCreditsBalance().then((b) => {
      if (!alive) return;
      accountRef.current = b;
      setAccount(b);
    });
    return () => {
      alive = false;
    };
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
          const remaining = accountRef.current?.remainingApiCredits ?? 0;
          record(endpoint, 0, true, remaining);
          setCtx({ estimate: 0, lastActual: 0, cacheHit: true });
          setLastConsume({ estimate: 0, actual: 0, cacheHit: true });
          return cached as MarketingResponse<unknown>;
        }

        const res = await fn();
        cacheRef.current.set(cacheKey, res);
        writeMarketingApiCache(cacheKey, res);
        const actual = res.consumedCredits ?? 0;
        const remaining =
          res.remainingCredits ?? accountRef.current?.remainingApiCredits ?? 0;
        if (accountRef.current) {
          const next: CreditsBalance = {
            ...accountRef.current,
            remainingApiCredits: remaining,
            usedApiCredits: accountRef.current.totalApiCredits - remaining,
          };
          accountRef.current = next;
          setAccount(next);
        }
        record(endpoint, actual, false, remaining);
        setCtx({ estimate: actual, lastActual: actual, cacheHit: false });
        setLastConsume({ estimate: actual, actual, cacheHit: false, freeWindow: res.freeWindow });

        // 真实计费模式：把本次运营中心 API 消耗写进账户中心积分库（credit_transactions）。
        // 仅真实模式写库——mock 模式的 consumedCredits 是合成值，写入会污染用户真实 user_credits。
        // 不再纯 fire-and-forget：失败后暴露错误，让上层提示用户，并尝试一次重试。
        if (!USE_MOCK && actual > 0) {
          const sync = async () => {
            try {
              await billingApi.consumeCredits({
                endpoint,
                amount: actual,
                refType: "marketing_api",
                refId: cacheKey,
              });
              setConsumeError(null);
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              console.warn("[marketing-runner] consumeCredits failed (will retry once):", err);
              // 一次重试
              try {
                await billingApi.consumeCredits({
                  endpoint,
                  amount: actual,
                  refType: "marketing_api",
                  refId: cacheKey,
                });
                setConsumeError(null);
                console.info("[marketing-runner] consumeCredits retry succeeded");
              } catch (err2) {
                const msg2 = err2 instanceof Error ? err2.message : String(err2);
                console.error("[marketing-runner] consumeCredits retry failed:", err2);
                setConsumeError({ endpoint, amount: actual, message: msg2, at: Date.now() });
              }
            }
          };
          void sync();
        }
        return res;
      };

      return execute() as unknown as Promise<Awaited<ReturnType<typeof fn>>>;
    },
    [record]
  );

  return {
    account,
    ctx,
    lastConsume,
    consumeError,
    run,
  };
}
