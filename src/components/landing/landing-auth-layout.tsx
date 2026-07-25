"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
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
  const { isAuthorized, operationsHubReady } = useOnboarding();
  const [mode, setMode] = useState<LandingAuthMode>(initialMode);

  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  const from = params.get("from");
  const postLoginTarget = resolvePostLoginPath(locale, from, {
    isAuthorized,
    operationsHubReady,
  });

  useEffect(() => {
    if (authStatus !== "authenticated") return;
    router.replace(postLoginTarget);
    router.refresh();
  }, [authStatus, postLoginTarget, router]);

  const entryHref =
    authStatus === "authenticated"
      ? localePath(
          locale,
          !isAuthorized ? "/authorize" : operationsHubReady ? "/order-center" : "/products"
        )
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
    router.push(localePath(locale, "/"));
  }, [locale, router]);

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
