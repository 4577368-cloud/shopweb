"use client";

// 运营中心 · 参考数据字典 hook
// 启动拉一次（fetchReference 内部已做 localStorage 缓存 + 单飞），组件卸载/重挂不重复付费。
// 初始值用 MOCK_DICTS，保证筛选器首屏即有内容、无空白闪烁；真实数据到达后无缝替换。

import { useEffect, useState } from "react";
import { fetchReference, MOCK_DICTS, type ReferenceDictionaries } from "@/lib/marketing/reference";

export function useReferenceDictionaries() {
  const [dictionaries, setDictionaries] = useState<ReferenceDictionaries>(MOCK_DICTS);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetchReference()
      .then((d) => {
        if (active) setDictionaries(d);
      })
      .catch(() => {
        // 保持 MOCK_DICTS 兜底，不阻断筛选器
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return { dictionaries, loading };
}
