export function resolveTitleCopyStyle(
  _copyAction: "translate" | "rewrite" | "optimize",
  copyStyle?: "amazon" | "literal"
): "amazon" | "literal" {
  if (copyStyle === "amazon" || copyStyle === "literal") return copyStyle;
  // rewrite / optimize polish listing copy in marketplace style (same or target lang).
  return "amazon";
}
