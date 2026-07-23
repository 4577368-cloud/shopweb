import { resolveLocale, type Locale } from "./config";
import { messages } from "./messages";
import { en } from "./messages/en";

export type TranslateFn = (
  key: string,
  params?: Record<string, string | number>
) => string;

function resolveKey(
  dict: (typeof messages)[Locale],
  key: string
): string | undefined {
  const segments = key.split(".");
  let node: unknown = dict;
  for (const seg of segments) {
    if (node && typeof node === "object" && seg in (node as object)) {
      node = (node as Record<string, unknown>)[seg];
    } else {
      return undefined;
    }
  }
  return typeof node === "string" ? node : undefined;
}

function interpolate(
  template: string,
  params?: Record<string, string | number>
): string {
  if (!params) return template;
  return template
    .replace(/\{\{(\w+)\}\}/g, (_match, name: string) => {
      const val = params[name];
      return val === undefined ? `{{${name}}}` : String(val);
    })
    .replace(/\{(\w+)\}/g, (match, name: string) => {
      const val = params[name];
      return val === undefined ? match : String(val);
    });
}

export function createTranslator(locale?: string | null): TranslateFn {
  const resolved = resolveLocale(locale);
  const dict = messages[resolved];
  return (key: string, params?: Record<string, string | number>) => {
    const localized = resolveKey(dict, key);
    if (localized !== undefined) return interpolate(localized, params);
    const fallback = resolveKey(en, key);
    if (fallback !== undefined) return interpolate(fallback, params);
    return key;
  };
}
