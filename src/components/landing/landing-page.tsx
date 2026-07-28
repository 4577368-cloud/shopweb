"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { CyberBackground } from "@/components/landing/cyber-background";
import { LandingNav } from "@/components/landing/landing-nav";
import { LandingHero } from "@/components/landing/landing-hero";
import { LandingFeatures } from "@/components/landing/landing-features";
import { LandingHowItWorks } from "@/components/landing/landing-how-it-works";
import { LandingStats } from "@/components/landing/landing-stats";
import { LandingValueProps } from "@/components/landing/landing-value-props";
import { LandingUseCases } from "@/components/landing/landing-use-cases";
import { LandingCtaBand } from "@/components/landing/landing-cta-band";
import { LandingFooter } from "@/components/landing/landing-footer";
import { LandingAuthSplit } from "@/components/landing/landing-auth-layout";
import { useAuth } from "@/context/user-context";
import { useOnboarding } from "@/context/onboarding-context";
import { useLocale } from "@/i18n/LocaleProvider";
import { localePath } from "@/i18n/LocaleLink";
import { resolvePostLoginPath } from "@/lib/auth/post-login-redirect";
import { useEmbeddedMode } from "@/host/embedded/use-embedded-mode";
import { replaceInApp } from "@/host/adapters/navigation";
import { Loader2 } from "@/lib/ui/icons";
import { useT } from "@/i18n/LocaleProvider";

type LandingMode = "hero" | "auth";
type AuthMode = "login" | "register";

/**
 * Landing 营销页容器。
 *
 * 状态机：
 * - hero：全屏 Hero + Stats + Features + ValueProps + HowItWorks + UseCases + CtaBand + Footer
 * - auth：左侧 Hero 缩略 + 右侧 420px 固定面板（登录/注册）
 *
 * Nav 按钮根据登录状态分流：
 * - 未登录 → 显示登录/注册，点击触发 auth 模式
 * - 已登录 → 显示"进入工作台"，链接到：
 *   - 未绑店 → /authorize
 *   - 已绑店 → /products
 */
export function LandingPage() {
  const [mode, setMode] = useState<LandingMode>("hero");
  const [authMode, setAuthMode] = useState<AuthMode>("login");

  const { status: authStatus } = useAuth();
  const { isAuthorized } = useOnboarding();
  const locale = useLocale();
  const router = useRouter();
  const { isEmbedded } = useEmbeddedMode();
  const t = useT();

  // Admin App URL often hits `/` — send embedded merchants to the install page.
  useEffect(() => {
    if (!isEmbedded) return;
    replaceInApp(localePath(locale, "/install"), router);
  }, [isEmbedded, locale, router]);

  const entryHref =
    authStatus === "authenticated"
      ? localePath(locale, !isAuthorized ? "/authorize" : "/products")
      : null;

  const showAuth = (m: AuthMode) => {
    setAuthMode(m);
    setMode("auth");
  };

  const hideAuth = () => setMode("hero");

  const startCta = () => {
    if (authStatus === "authenticated") {
      // 已登录用户点 CTA 也走工作台入口（不会发生，CTA 主要面向未登录）
      return;
    }
    showAuth("register");
  };

  const postLoginTarget = useMemo(
    () =>
      resolvePostLoginPath(locale, null, {
        isAuthorized,
      }),
    [locale, isAuthorized]
  );

  useEffect(() => {
    if (authStatus !== "authenticated" || mode !== "auth") return;
    // Soft client nav can stall after login/register; hard-assign matches AuthPanel.
    window.location.assign(postLoginTarget);
  }, [authStatus, mode, postLoginTarget]);

  if (isEmbedded) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center gap-3">
        <Loader2 className="h-7 w-7 animate-spin text-brand" aria-hidden />
        <span className="text-sm text-ink-muted">{t("authorize.loading")}</span>
      </div>
    );
  }

  return (
    <div className="landing-root">
      <CyberBackground />

      <LandingNav onShowAuth={showAuth} entryHref={entryHref} />

      {/* 主内容区：根据模式切换布局 */}
      <AnimatePresence mode="wait">
        {mode === "hero" ? (
          <motion.main
            key="hero"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="relative z-10 pt-14"
          >
            {/* Hero 全屏 */}
            <section className="mx-auto flex min-h-[calc(100vh-3.5rem)] max-w-7xl flex-col justify-center px-6 py-20">
              <LandingHero onStart={startCta} />
            </section>

            <LandingStats />
            <LandingFeatures />
            <LandingValueProps />
            <LandingHowItWorks />
            <LandingUseCases />
            <LandingCtaBand onStart={startCta} />
            <LandingFooter />
          </motion.main>
        ) : (
          <motion.div
            key="auth"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="relative z-10"
          >
            <LandingAuthSplit
              mode={authMode}
              onModeChange={(m) => {
                setAuthMode(m);
                router.replace(
                  localePath(locale, m === "login" ? "/login" : "/register")
                );
              }}
              onClose={hideAuth}
              redirectAfterSuccess={postLoginTarget}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
