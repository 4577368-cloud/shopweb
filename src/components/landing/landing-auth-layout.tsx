"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { CyberBackground } from "@/components/landing/cyber-background";
import { LandingNav } from "@/components/landing/landing-nav";
import { LandingHero } from "@/components/landing/landing-hero";
import { AuthPanel } from "@/components/landing/auth-panel";
import { useAuth } from "@/context/user-context";
import { useOnboarding } from "@/context/onboarding-context";
import { useLocale } from "@/i18n/LocaleProvider";
import { localePath } from "@/i18n/LocaleLink";
import { resolvePostLoginPath } from "@/lib/auth/post-login-redirect";

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
  const { status: authStatus } = useAuth();
  const { isAuthorized } = useOnboarding();
  const [mode, setMode] = useState<LandingAuthMode>(initialMode);

  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  const from = params.get("from");
  const postLoginTarget = resolvePostLoginPath(locale, from, {
    isAuthorized,
  });

  // Only redirect once when session becomes authenticated.
  // Embedded: soft-nav with host/embedded preserved — hard assign drops query and
  // used to bounce Admin merchants through /login in a flash loop.
  const redirectedRef = useRef(false);
  useEffect(() => {
    if (authStatus !== "authenticated") {
      redirectedRef.current = false;
      return;
    }
    if (redirectedRef.current) return;
    redirectedRef.current = true;
    void (async () => {
      const { readEmbeddedMode } = await import(
        "@/host/embedded/use-embedded-mode"
      );
      if (readEmbeddedMode().isEmbedded) {
        const { replaceInApp } = await import("@/host/adapters/navigation");
        replaceInApp(postLoginTarget, router);
        return;
      }
      window.location.assign(postLoginTarget);
    })();
  }, [authStatus, postLoginTarget, router]);

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
