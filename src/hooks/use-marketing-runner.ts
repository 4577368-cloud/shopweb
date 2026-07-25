"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchCreditsBalance } from "@/lib/marketing/api";
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

export interface LastConsume {
  estimate: number;
  actual: number;
  cacheHit: boolean;
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
  const cacheRef = useRef<Map<string, unknown>>(new Map());

  const run = useCallback<MarketingRunFn>(
    (endpoint, cacheKey, fn) => {
      const execute = async (): Promise<MarketingResponse<unknown>> => {
        const cached = cacheRef.current.get(cacheKey);
        if (cached !== undefined) {
          const remaining = accountRef.current?.remainingApiCredits ?? 0;
          record(endpoint, 0, true, remaining);
          setCtx({ estimate: 0, lastActual: 0, cacheHit: true });
          setLastConsume({ estimate: 0, actual: 0, cacheHit: true });
          return cached as MarketingResponse<unknown>;
        }

        const res = await fn();
        cacheRef.current.set(cacheKey, res);
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
        setLastConsume({ estimate: actual, actual, cacheHit: false });
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
    run,
  };
}
