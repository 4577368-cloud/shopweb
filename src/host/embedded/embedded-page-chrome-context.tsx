"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type EmbeddedChromeSearch = {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
};

export type EmbeddedChromeRefresh = {
  onClick: () => void;
  busy?: boolean;
  title: string;
  ariaLabel: string;
};

export type EmbeddedChromeAssistant = {
  open: boolean;
  onToggle: () => void;
};

export type EmbeddedPageChromeState = {
  search: EmbeddedChromeSearch | null;
  refresh: EmbeddedChromeRefresh | null;
  assistant: EmbeddedChromeAssistant | null;
  /** Match WorkbenchPanel content column (default 1080). */
  maxWidth: number;
};

type EmbeddedPageChromeApi = EmbeddedPageChromeState & {
  setSearch: (search: EmbeddedChromeSearch | null) => void;
  setRefresh: (refresh: EmbeddedChromeRefresh | null) => void;
  setAssistant: (assistant: EmbeddedChromeAssistant | null) => void;
  setMaxWidth: (maxWidth: number) => void;
};

const EmbeddedPageChromeContext = createContext<EmbeddedPageChromeApi | null>(
  null
);

export function EmbeddedPageChromeProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [search, setSearch] = useState<EmbeddedChromeSearch | null>(null);
  const [refresh, setRefresh] = useState<EmbeddedChromeRefresh | null>(null);
  const [assistant, setAssistant] =
    useState<EmbeddedChromeAssistant | null>(null);
  const [maxWidth, setMaxWidth] = useState(1080);

  const value = useMemo<EmbeddedPageChromeApi>(
    () => ({
      search,
      refresh,
      assistant,
      maxWidth,
      setSearch,
      setRefresh,
      setAssistant,
      setMaxWidth,
    }),
    [search, refresh, assistant, maxWidth]
  );

  return (
    <EmbeddedPageChromeContext.Provider value={value}>
      {children}
    </EmbeddedPageChromeContext.Provider>
  );
}

/** Safe read for chrome UI — null outside provider. */
export function useEmbeddedPageChromeState(): EmbeddedPageChromeState | null {
  const ctx = useContext(EmbeddedPageChromeContext);
  if (!ctx) return null;
  return {
    search: ctx.search,
    refresh: ctx.refresh,
    assistant: ctx.assistant,
    maxWidth: ctx.maxWidth,
  };
}

/**
 * Register page chrome slots for embedded Row1. Clears on unmount.
 * No-op when outside provider or {@link enabled} is false (standalone).
 */
export function useRegisterEmbeddedPageChrome(opts: {
  search?: EmbeddedChromeSearch | null;
  refresh?: EmbeddedChromeRefresh | null;
  assistant?: EmbeddedChromeAssistant | null;
  maxWidth?: number;
  enabled?: boolean;
}) {
  const ctx = useContext(EmbeddedPageChromeContext);
  const enabled = Boolean(ctx) && opts.enabled !== false;

  const search = opts.search ?? null;
  const refresh = opts.refresh ?? null;
  const assistant = opts.assistant ?? null;
  const maxWidth = opts.maxWidth ?? 1080;

  useEffect(() => {
    if (!ctx || !enabled) return;
    ctx.setSearch(search);
    return () => ctx.setSearch(null);
    // Intentionally depend on search fields, not object identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sync slot payload
  }, [
    ctx,
    enabled,
    search?.value,
    search?.placeholder,
    search?.onChange,
  ]);

  useEffect(() => {
    if (!ctx || !enabled) return;
    ctx.setRefresh(refresh);
    return () => ctx.setRefresh(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sync slot payload
  }, [
    ctx,
    enabled,
    refresh?.busy,
    refresh?.title,
    refresh?.ariaLabel,
    refresh?.onClick,
  ]);

  useEffect(() => {
    if (!ctx || !enabled) return;
    ctx.setAssistant(assistant);
    return () => ctx.setAssistant(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sync slot payload
  }, [ctx, enabled, assistant?.open, assistant?.onToggle]);

  useEffect(() => {
    if (!ctx || !enabled) return;
    ctx.setMaxWidth(maxWidth);
  }, [ctx, enabled, maxWidth]);
}
