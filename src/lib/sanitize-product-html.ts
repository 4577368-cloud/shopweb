/**
 * Shopify product description preview — strip scripts/events; allow common formatting tags.
 * Used before dangerouslySetInnerHTML in shop product detail drawer (read-only view).
 */

const ALLOWED_TAGS = new Set([
  "p",
  "br",
  "div",
  "span",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "ul",
  "ol",
  "li",
  "h1",
  "h2",
  "h3",
  "h4",
  "a",
  "img",
]);

const GLOBAL_ATTRS = new Set(["class", "style"]);
const TAG_ATTRS: Record<string, Set<string>> = {
  a: new Set(["href", "title", "target", "rel"]),
  img: new Set(["src", "alt", "width", "height", "loading"]),
};

function isSafeUrl(value: string, forImage: boolean): boolean {
  const v = value.trim().toLowerCase();
  if (!v) return false;
  if (v.startsWith("javascript:") || v.startsWith("data:text/html")) return false;
  if (forImage) {
    return v.startsWith("https:") || v.startsWith("http:") || v.startsWith("//");
  }
  return (
    v.startsWith("https:") ||
    v.startsWith("http:") ||
    v.startsWith("//") ||
    v.startsWith("mailto:") ||
    v.startsWith("#") ||
    v.startsWith("/")
  );
}

function stripUnsafeInline(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
    .replace(/\s+on\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/javascript:/gi, "");
}

function sanitizeElement(el: Element): void {
  const tag = el.tagName.toLowerCase();
  if (!ALLOWED_TAGS.has(tag)) {
    const parent = el.parentNode;
    if (!parent) return;
    while (el.firstChild) parent.insertBefore(el.firstChild, el);
    parent.removeChild(el);
    return;
  }

  const allowed = TAG_ATTRS[tag] ?? new Set<string>();
  for (const attr of [...el.attributes]) {
    const name = attr.name.toLowerCase();
    if (name.startsWith("on")) {
      el.removeAttribute(attr.name);
      continue;
    }
    if (!allowed.has(name) && !GLOBAL_ATTRS.has(name)) {
      el.removeAttribute(attr.name);
      continue;
    }
    if (name === "href" || name === "src") {
      const ok = isSafeUrl(attr.value, name === "src");
      if (!ok) el.removeAttribute(attr.name);
    }
  }

  if (tag === "a") {
    el.setAttribute("rel", "noopener noreferrer");
  }

  for (const child of [...el.children]) {
    sanitizeElement(child);
  }
}

/** Returns HTML safe enough for read-only product description preview. */
export function sanitizeProductDescriptionHtml(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";

  const stripped = stripUnsafeInline(trimmed);

  if (typeof DOMParser === "undefined") {
    return stripped.replace(/<[^>]+>/g, "");
  }

  try {
    const doc = new DOMParser().parseFromString(stripped, "text/html");
    sanitizeElement(doc.body);
    return doc.body.innerHTML.trim();
  } catch {
    return stripped.replace(/<[^>]+>/g, "");
  }
}
