export function resolveTitleCopyStyle(
  copyAction: "translate" | "rewrite" | "optimize",
  copyStyle?: "amazon" | "literal"
): "amazon" | "literal" {
  if (copyStyle === "amazon" || copyStyle === "literal") return copyStyle;
  return copyAction === "translate" ? "amazon" : "literal";
}
