const STORAGE_KEY = "tangbuy:spec-match-feedback:v1";
const MAX_ENTRIES = 200;

export interface SpecMatchFeedbackEntry {
  variantLabel: string;
  sourceSpecLabel: string;
  at: number;
}

function normPair(a: string, b: string): string {
  return `${a.trim().toLowerCase()}|||${b.trim().toLowerCase()}`;
}

function readEntries(): SpecMatchFeedbackEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SpecMatchFeedbackEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeEntries(entries: SpecMatchFeedbackEntry[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(entries.slice(0, MAX_ENTRIES))
    );
  } catch {
    /* quota */
  }
}

/** User-confirmed variant ↔ source spec pair — boosts future spec-match for same labels. */
export function recordSpecMatchFeedback(
  variantLabel: string,
  sourceSpecLabel: string
): void {
  const variantLabelTrim = variantLabel?.trim();
  const sourceSpecLabelTrim = sourceSpecLabel?.trim();
  if (!variantLabelTrim || !sourceSpecLabelTrim) return;

  const key = normPair(variantLabelTrim, sourceSpecLabelTrim);
  const entries = readEntries().filter(
    (e) => normPair(e.variantLabel, e.sourceSpecLabel) !== key
  );
  entries.unshift({
    variantLabel: variantLabelTrim,
    sourceSpecLabel: sourceSpecLabelTrim,
    at: Date.now(),
  });
  writeEntries(entries);
}

/** 0–1 boost when this exact pair was manually confirmed before. */
export function feedbackBoostForPair(
  variantLabel: string,
  sourceSpecLabel: string
): number {
  const key = normPair(variantLabel, sourceSpecLabel);
  for (const e of readEntries()) {
    if (normPair(e.variantLabel, e.sourceSpecLabel) === key) return 1;
  }
  return 0;
}

export function listSpecMatchFeedback(): SpecMatchFeedbackEntry[] {
  return readEntries();
}
