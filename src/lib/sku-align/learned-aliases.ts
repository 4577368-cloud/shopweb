/**
 * 学习别名沉淀（Phase 2 反馈闭环）
 *
 * 思路（不大而全、可回滚）：用户在抽屉里"人工确认的一次绑定"就是一次监督信号。
 * 我们从中**保守地**推导 token 级等价：仅当变体标签与货源标签在结构维度一致、
 * 且两侧各只剩「1 个」未解释的 custom token 时，学习 `A ≈ B`（大概率是别名/生僻色）。
 * 这样几乎无噪声，且随使用自动生长——即文档 learning loop 的 90% 价值，零后端。
 *
 * 学到的别名注入 `spec-match` 的 custom 兜底判等，下次匹配即受益。
 */
import { parseSpec, setLearnedAliasResolver } from "./spec-match";

export interface LearnedAlias {
  a: string;
  b: string;
  count: number;
  updatedAt: number;
}

const STORAGE_KEY = "tangbuy.skuAlign.learnedAliases.v1";

/**
 * 从一次人工确认的绑定推导可学习的别名对（纯函数，便于测试）。
 * 仅在"两侧各剩恰好 1 个未解释 custom token"时学习，最大限度避免噪声。
 */
export function deriveAliasPairs(
  variantLabel: string,
  specLabel: string
): Array<[string, string]> {
  const a = parseSpec(variantLabel);
  const b = parseSpec(specLabel);
  const aOnly = a.custom.filter((t) => !b.custom.includes(t));
  const bOnly = b.custom.filter((t) => !a.custom.includes(t));
  if (aOnly.length === 1 && bOnly.length === 1 && aOnly[0] !== bOnly[0]) {
    return [[aOnly[0], bOnly[0]]];
  }
  return [];
}

// ── 内存索引 + 解析器 ──────────────────────────────────────
const equivIndex = new Map<string, Set<string>>();

function indexPair(a: string, b: string): void {
  (equivIndex.get(a) ?? equivIndex.set(a, new Set()).get(a)!).add(b);
  (equivIndex.get(b) ?? equivIndex.set(b, new Set()).get(b)!).add(a);
}

let loaded = false;
function ensureLoaded(): void {
  if (loaded) return;
  loaded = true;
  for (const x of loadLearnedAliases()) indexPair(x.a, x.b);
}

/** 供 spec-match 注入的判等函数。 */
export function isLearnedEquivalent(a: string, b: string): boolean {
  ensureLoaded();
  return equivIndex.get(a)?.has(b) ?? false;
}

// ── 持久化（localStorage，参照 catalog-saved-searches 模式） ─
export function loadLearnedAliases(): LearnedAlias[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as LearnedAlias[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persist(list: LearnedAlias[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    /* 配额/隐私模式失败时静默降级 */
  }
}

/**
 * 记录一次人工绑定，沉淀可学习别名。返回本次新增/强化的别名条数。
 * 立即更新内存索引，后续匹配无需刷新即可受益。
 */
export function recordBinding(variantLabel: string, specLabel: string): number {
  const pairs = deriveAliasPairs(variantLabel, specLabel);
  if (!pairs.length) return 0;
  ensureLoaded();
  const list = loadLearnedAliases();
  const now = Date.now();
  for (const [a, b] of pairs) {
    const existing = list.find(
      (x) => (x.a === a && x.b === b) || (x.a === b && x.b === a)
    );
    if (existing) {
      existing.count += 1;
      existing.updatedAt = now;
    } else {
      list.push({ a, b, count: 1, updatedAt: now });
    }
    indexPair(a, b);
  }
  persist(list);
  return pairs.length;
}

// 导入本模块即把学习别名接入 spec-match 的 custom 兜底判等
setLearnedAliasResolver(isLearnedEquivalent);
