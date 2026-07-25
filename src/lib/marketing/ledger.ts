// 运营中心 · 本会话用量审计日志（设计 §3.2）
// 重要：余额是 pipispy API 账户级别（对应你的 key），由后端 /api/plugin/marketing/credits-balance
// 持有，前端不重复持有余额。本 hook 只记录「本会话」的逐次消耗，作为可审计的调用日志，
// 不模拟任何账户余额/配额（那属于账户级 CreditsBalance，真实由后端下发）。

import { useCallback, useState } from "react";
import type { UsageEntry, UsageLedger } from "./types";

export function useMarketingLedger() {
  const [ledger, setLedger] = useState<UsageLedger>({ sessionUsed: 0, entries: [] });

  // 记录一次出站调用：consumed 为本次实际消耗（缓存命中为 0），remainingAfter 为调用后账户剩余。
  const record = useCallback(
    (endpoint: string, consumed: number, cacheHit: boolean, remainingAfter: number) => {
      setLedger((prev) => {
        const entry: UsageEntry = {
          id: `u_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          time: new Date().toLocaleString([], {
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
          }),
          endpoint,
          consumed,
          cacheHit,
          remainingAfter,
        };
        return {
          sessionUsed: prev.sessionUsed + consumed,
          entries: [entry, ...prev.entries].slice(0, 50),
        };
      });
    },
    []
  );

  const reset = useCallback(() => setLedger({ sessionUsed: 0, entries: [] }), []);

  return { ...ledger, record, reset };
}
