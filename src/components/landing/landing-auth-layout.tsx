"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { CyberBackground } from "@/components/landing/cyber-background";
import { LandingNav } from "@/components/landing/landing-nav";
import { LandingHero } from "@/components/landing/landing-hero";
import { AuthPanel } from "@/components/landing/auth-panel";
import { useAuth } from "@/context/user-context";
import { useOnboarding } from "@/context/onboarding-context";
import { useLocale, useT } from "@/i18n/LocaleProvider";
import { localePath } from "@/i18n/LocaleLink";
import { resolvePostLoginPath } from "@/lib/auth/post-login-redirect";
import { useEmbeddedMode } from "@/host/embedded/use-embedded-mode";
import { Loader2 } from "@/lib/ui/icons";

export type LandingAuthMode = "login" | "register";

interface LandingAuthSplitProps {
  mode: LandingAuthMode;
  onModeChange: (mode: LandingAuthMode) => void;
  onClose: () => void;
  redirectAfterSuccess: string;
}

/** 左侧营销 Hero + 右侧登录/注册面板（与首页 auth 模式一致）。 */
export function LandingAuthSplit({
  mode,
  onModeChange,
  onClose,
  redirectAfterSuccess,
}: LandingAuthSplitProps) {
  return (
    <main className="relative z-10 flex min-h-screen flex-col pt-14 lg:flex-row">
      <div className="flex flex-1 flex-col justify-center px-6 py-12 lg:px-12 lg:py-20">
        <LandingHero onStart={() => onModeChange("register")} compact />
      </div>
      <aside className="w-full shrink-0 border-t border-[--landing-border] lg:max-w-[420px] lg:border-l lg:border-t-0">
        <AuthPanel
          mode={mode}
          onModeChange={onModeChange}
          onClose={onClose}
          redirectAfterSuccess={redirectAfterSuccess}
        />
      </aside>
    </main>
  );
}

function LandingAuthRouteShellInner({ initialMode }: { initialMode: LandingAuthMode }) {
  const router = useRouter();
  const params = useSearchParams();
  const locale = useLocale();
  const t = useT();
  const { status: authStatus, refreshUser } = useAuth();
  const { isAuthorized } = useOnboarding();
  const { isEmbedded } = useEmbeddedMode();
  const [mode, setMode] = useState<LandingAuthMode>(initialMode);

  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  const from = params.get("from");
  const postLoginTarget = resolvePostLoginPath(locale, from, {
    isAuthorized,
  });

  // Embedded Admin never needs Tangbuy email/password — session-token silently
  // provisions a shop-bound account. Bounce off /login instead of flashing the form.
  useEffect(() => {
    if (!isEmbedded) return;
    let cancelled = false;
    void (async () => {
      const { exchangeSessionToken } = await import(
        "@/host/embedded/exchange-session-token"
      );
      const { replaceInApp } = await import("@/host/adapters/navigation");
      const deadline = Date.now() + 8_000;
      while (!cancelled && Date.now() < deadline) {
        const ex = await exchangeSessionToken(true, { launchOauthOnNeed: false });
        if (ex.ok) {
          await refreshUser();
          if (!cancelled) replaceInApp(postLoginTarget, router);
          return;
        }
        if (ex.code === "NEED_OAUTH") {
          if (!cancelled) {
            replaceInApp(localePath(locale, "/authorize"), router);
          }
          return;
        }
        await new Promise((r) => setTimeout(r, 250));
      }
      if (!cancelled) {
        replaceInApp(localePath(locale, "/authorize"), router);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isEmbedded, locale, postLoginTarget, refreshUser, router]);

  // Only redirect once when session becomes authenticated (standalone).
  // Embedded: soft-nav with host/embedded preserved — hard assign drops query and
  // used to bounce Admin merchants through /login in a flash loop.
  const redirectedRef = useRef(false);
  useEffect(() => {
    if (isEmbedded) return;
    if (authStatus !== "authenticated") {
      redirectedRef.current = false;
      return;
    }
    if (redirectedRef.current) return;
    redirectedRef.current = true;
    window.location.assign(postLoginTarget);
  }, [authStatus, postLoginTarget, isEmbedded]);

  const entryHref =
    authStatus === "authenticated"
      ? localePath(locale, !isAuthorized ? "/authorize" : "/products")
      : null;

  const onModeChange = useCallback(
    (next: LandingAuthMode) => {
      setMode(next);
      const base = localePath(locale, next === "login" ? "/login" : "/register");
      const q = from ? `?from=${encodeURIComponent(from)}` : "";
      router.replace(`${base}${q}`);
    },
    [from, locale, router]
  );

  const onClose = useCallback(() => {
    if (from && from.startsWith("/") && !from.startsWith("//")) {
      // Reuse post-login rules so closing the panel cannot bounce into a locked hub URL.
      router.push(
        resolvePostLoginPath(locale, from, { isAuthorized })
      );
      return;
    }
    router.push(localePath(locale, "/"));
  }, [from, locale, router, isAuthorized]);

  const showAuth = useCallback(
    (m: LandingAuthMode) => {
      onModeChange(m);
    },
    [onModeChange]
  );

  if (isEmbedded) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3">
        <Loader2 className="h-7 w-7 animate-spin text-brand" aria-hidden />
        <span className="text-sm text-ink-muted">{t("authorize.loading")}</span>
      </div>
    );
  }

  return (
    <div className="landing-root min-h-screen">
      <CyberBackground />
      <LandingNav onShowAuth={showAuth} entryHref={entryHref} />
      <LandingAuthSplit
        mode={mode}
        onModeChange={onModeChange}
        onClose={onClose}
        redirectAfterSuccess={postLoginTarget}
      />
    </div>
  );
}

export function LandingAuthRouteShell({ initialMode }: { initialMode: LandingAuthMode }) {
  return (
    <Suspense fallback={<div className="landing-root min-h-screen bg-[--landing-bg]" />}>
      <LandingAuthRouteShellInner initialMode={initialMode} />
    </Suspense>
  );
}
