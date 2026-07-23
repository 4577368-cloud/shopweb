"use client";

import {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import type { Locale } from "./config";
import { defaultLocale } from "./config";
import { en } from "./messages/en";

type Messages = typeof en;

interface LocaleContextValue {
  locale: Locale;
  t: (key: string, params?: Record<string, string | number>) => string;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

function resolve(
  messages: Messages,
  key: string
): string | undefined {
  // Dot-path lookup: "home.title"
  const segments = key.split(".");
  let node: unknown = messages;
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

export function LocaleProvider({
  locale,
  messages,
  children,
}: {
  locale: Locale;
  messages: Messages;
  children: ReactNode;
}) {
  const value = useMemo<LocaleContextValue>(() => {
    const t = (key: string, params?: Record<string, string | number>) => {
      const localized = resolve(messages, key);
      if (localized !== undefined) return interpolate(localized, params);
      // Fallback to English source so the UI never shows raw keys.
      const fallback = resolve(en, key);
      if (fallback !== undefined) return interpolate(fallback, params);
      if (process.env.NODE_ENV === "development") {
        console.warn(`[i18n] Missing translation key: ${key}`);
      }
      return key;
    };
    return { locale, t };
  }, [locale, messages]);

  return (
    <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
  );
}

export function useLocale(): Locale {
  const ctx = useContext(LocaleContext);
  return ctx?.locale ?? defaultLocale;
}

export function useT(): LocaleContextValue["t"] {
  const ctx = useContext(LocaleContext);
  if (!ctx) {
    // Safe no-op fallback during SSR before provider mounts.
    return ((key: string) => key) as LocaleContextValue["t"];
  }
  return ctx.t;
}

export type { Messages };
