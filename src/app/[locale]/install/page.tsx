"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, Loader2, Sparkles } from "@/lib/ui/icons";
import { useOnboarding } from "@/context/onboarding-context";
import { useUser } from "@/context/user-context";
import {
  SHOP_STORAGE_KEY,
  launchShopifyInstall,
  normalizeShopDomain,
  rememberShopDomain,
  resolveInstallError,
} from "@/lib/shopify-install";
import {
  ShopDomainConnectField,
  shopHandleFromDomain,
} from "@/components/shopify/shop-domain-connect-field";

import { AppLogo } from "@/components/brand/app-logo";
import { LandingHeroPreview } from "@/components/landing/landing-hero-preview";
import { LandingStats } from "@/components/landing/landing-stats";
import { LandingFeatures } from "@/components/landing/landing-features";
import { LandingValueProps } from "@/components/landing/landing-value-props";
import { LandingHowItWorks } from "@/components/landing/landing-how-it-works";
import { LandingUseCases } from "@/components/landing/landing-use-cases";
import { LandingCtaBand } from "@/components/landing/landing-cta-band";
import { LandingFooter } from "@/components/landing/landing-footer";
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";
import { useT, useLocale } from "@/i18n/LocaleProvider";
import { localePath } from "@/i18n/LocaleLink";
import { consumeJustRegistered } from "@/lib/auth/just-registered";
import { useEmbeddedMode } from "@/host/embedded/use-embedded-mode";
import { hrefInApp, replaceInApp } from "@/host/adapters/navigation";

const CONNECT_ANCHOR = "install-connect";

function InstallPageContent() {
  const { showToast, isAuthorized } = useOnboarding();
  const { status: authStatus, bootstrapping } = useUser();
  const { isEmbedded } = useEmbeddedMode();
  const router = useRouter();
  const t = useT();
  const locale = useLocale();
  const searchParams = useSearchParams();
  const autoShopAttempted = useRef(false);
  const [handle, setHandle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [redirecting, setRedirecting] = useState(false);
  const [justRegistered, setJustRegistered] = useState(false);
  const [embeddedGate, setEmbeddedGate] = useState<"checking" | "ready">(
    isEmbedded ? "checking" : "ready"
  );

  useEffect(() => {
    setJustRegistered(consumeJustRegistered());
  }, []);

  const connectWithDomain = (raw: string) => {
    const remembered = rememberShopDomain(raw);
    if (remembered) {
      setHandle(shopHandleFromDomain(remembered));
    }

    // Standalone: Tangbuy cookie login first. Embedded: silent session-token —
    // do not bounce to /login; go straight to Shopify OAuth.
    if (
      !isEmbedded &&
      !bootstrapping &&
      authStatus !== "authenticated"
    ) {
      const shopQ = remembered
        ? `?shop=${encodeURIComponent(remembered)}`
        : "";
      const from = `/install${shopQ}`;
      router.push(
        hrefInApp(
          localePath(locale, `/login?from=${encodeURIComponent(from)}`)
        )
      );
      return;
    }
    if (!isEmbedded && bootstrapping) {
      showToast(t("install.waitAuth"));
      return;
    }
    setError(null);
    setRedirecting(true);

    // Embedded + already installed on Shopify: link via session→offline token
    // exchange (no iframe breakout). Only fall back to OAuth in a new tab.
    if (isEmbedded) {
      void (async () => {
        try {
          const { exchangeSessionToken } = await import(
            "@/host/embedded/exchange-session-token"
          );
          const ex = await exchangeSessionToken(true, {
            launchOauthOnNeed: false,
          });
          if (ex.ok) {
            replaceInApp(
              localePath(locale, isAuthorized ? "/products" : "/authorize"),
              router
            );
            return;
          }
        } catch {
          // fall through to OAuth tab
        }
        const result = launchShopifyInstall(raw, { preferNewTab: true });
        if (!result.ok) {
          setRedirecting(false);
          const msg = resolveInstallError(
            t,
            result.errorCode,
            t("install.launchError")
          );
          setError(msg);
          showToast(msg);
        }
      })();
      return;
    }

    const result = launchShopifyInstall(raw);
    if (!result.ok) {
      setRedirecting(false);
      const msg = resolveInstallError(t, result.errorCode, t("install.launchError"));
      setError(msg);
      showToast(msg);
    }
  };

  const connect = () => connectWithDomain(handle);

  const goLoginPreservingShop = (mode: "login" | "register" = "login") => {
    const raw =
      handle.trim() ||
      searchParams.get("shop")?.trim() ||
      (typeof window !== "undefined"
        ? window.localStorage.getItem(SHOP_STORAGE_KEY) ?? ""
        : "");
    const remembered = raw ? rememberShopDomain(raw) : null;
    const shopQ = remembered
      ? `?shop=${encodeURIComponent(remembered)}`
      : "";
    const from = `/install${shopQ}`;
    const base = mode === "register" ? "/register" : "/login";
    router.push(
      hrefInApp(
        localePath(locale, `${base}?from=${encodeURIComponent(from)}`)
      )
    );
  };

  const scrollToConnect = useCallback(() => {
    document.getElementById(CONNECT_ANCHOR)?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const fromQuery = searchParams.get("shop")?.trim();
    if (fromQuery) {
      const normalized = normalizeShopDomain(fromQuery);
      if (normalized) {
        rememberShopDomain(normalized);
        setHandle(shopHandleFromDomain(normalized));
        return;
      }
    }
    const saved = window.localStorage.getItem(SHOP_STORAGE_KEY);
    if (saved) {
      setHandle(shopHandleFromDomain(saved));
    }
  }, [searchParams]);

  useEffect(() => {
    // Standalone only: after Tangbuy login, resume Shopify OAuth once.
    // Embedded must NOT auto-fire Connect — that re-opens OAuth after a successful
    // callback and surfaces a false red error on the install App URL.
    if (isEmbedded) return;
    if (bootstrapping || authStatus !== "authenticated") return;
    const shop =
      searchParams.get("shop")?.trim() ||
      (typeof window !== "undefined"
        ? window.localStorage.getItem(SHOP_STORAGE_KEY)
        : null);
    if (!shop || autoShopAttempted.current) return;
    autoShopAttempted.current = true;
    setHandle(shopHandleFromDomain(shop));
    connectWithDomain(shop);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- resume once when auth ready
  }, [authStatus, bootstrapping, searchParams, isEmbedded]);

  // Embedded App URL = /install. After OAuth, Admin reloads this page before App Bridge
  // is ready — one-shot exchange falsely fails and leaves merchants on marketing.
  // Poll until session works, then enter authorize (or products when already bound).
  useEffect(() => {
    if (!isEmbedded) {
      setEmbeddedGate("ready");
      return;
    }
    let cancelled = false;
    setEmbeddedGate("checking");
    void (async () => {
      const { exchangeSessionToken } = await import(
        "@/host/embedded/exchange-session-token"
      );
      const { getEmbeddedAccessToken } = await import(
        "@/host/embedded/session-token-store"
      );
      const deadline = Date.now() + 12_000;
      let needOauthStreak = 0;
      while (!cancelled && Date.now() < deadline) {
        if (getEmbeddedAccessToken()) {
          replaceInApp(
            localePath(locale, isAuthorized ? "/products" : "/authorize"),
            router
          );
          return;
        }
        const result = await exchangeSessionToken(true, {
          launchOauthOnNeed: false,
        });
        if (cancelled) return;
        if (result.ok) {
          replaceInApp(
            localePath(locale, isAuthorized ? "/products" : "/authorize"),
            router
          );
          return;
        }
        if (result.code === "NEED_OAUTH" || result.code === "SHOP_NOT_BOUND") {
          needOauthStreak += 1;
          // Brief grace for post-OAuth token persistence; then show Connect UI.
          if (needOauthStreak >= 4) break;
          await new Promise((r) => setTimeout(r, 400));
          continue;
        }
        // App Bridge / network not ready yet — keep waiting.
        await new Promise((r) => setTimeout(r, 300));
      }
      if (!cancelled) setEmbeddedGate("ready");
    })();
    return () => {
      cancelled = true;
    };
  }, [isEmbedded, isAuthorized, locale, router]);

  // Embedded uses session-token silent provision — never show Tangbuy login/signup chrome.
  const needsLogin =
    !isEmbedded && !bootstrapping && authStatus !== "authenticated";
  const showWorkbenchLink =
    (!isEmbedded && !needsLogin && authStatus === "authenticated") ||
    (isEmbedded && embeddedGate === "ready" && isAuthorized);
  const workbenchHref = localePath(
    locale,
    isAuthorized ? "/products" : "/authorize"
  );
  const trustSignals = [
    t("install.trustOfficialOAuth"),
    t("install.trustScoped"),
    t("install.trustRevocable"),
    t("install.trustEncrypted"),
  ];

  if (isEmbedded && embeddedGate === "checking") {
    return (
      <main className="flex min-h-full flex-col items-center justify-center gap-3 bg-canvas px-5">
        <Loader2 className="h-8 w-8 animate-spin text-brand" />
        <p className="text-sm font-medium text-ink">{t("authorize.loading")}</p>
      </main>
    );
  }

  if (redirecting && searchParams.get("shop")) {
    return (
      <main className="flex min-h-full flex-col items-center justify-center gap-3 bg-canvas px-5">
        <Loader2 className="h-8 w-8 animate-spin text-brand" />
        <p className="text-sm font-medium text-ink">{t("install.redirectingToShopify")}</p>
        <p className="text-xs text-ink-muted">{t("install.shopFromAppHint")}</p>
      </main>
    );
  }

  return (
    <main className="landing-root !min-h-0">
      <header className="sticky top-0 z-20 border-b border-[--landing-border] bg-[--landing-surface]/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-3.5 sm:px-6">
          <AppLogo variant="header" size="sm" />
          <div className="flex items-center gap-3">
            <LanguageSwitcher menuPlacement="down" />
            {needsLogin ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => goLoginPreservingShop("login")}
                  className="text-xs font-medium text-[--landing-text-muted] hover:text-[--landing-text]"
                >
                  {t("install.navLogin")}
                </button>
                <button
                  type="button"
                  onClick={() => goLoginPreservingShop("register")}
                  className="rounded-[var(--radius-control)] bg-ink px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-ink/90"
                >
                  {t("install.navRegister")}
                </button>
              </div>
            ) : showWorkbenchLink ? (
              <Link
                href={hrefInApp(workbenchHref)}
                className="text-xs font-medium text-[--landing-text-muted] hover:text-[--landing-text]"
              >
                {t("install.authorizedHint")}
              </Link>
            ) : null}
          </div>
        </div>
      </header>

      {/* Connect / authorize — install-specific; App URL lands here. */}
      <section
        id={CONNECT_ANCHOR}
        className="mx-auto grid max-w-7xl scroll-mt-16 gap-8 px-5 pb-8 pt-5 sm:px-6 sm:pb-10 sm:pt-6 lg:grid-cols-[1.05fr_1fr] lg:items-center"
      >
        <div>
          <span className="landing-badge">
            <Sparkles className="h-3 w-3" />
            {t("landing.badge")}
          </span>
          <h1 className="mt-4 text-3xl font-extrabold leading-tight tracking-tight text-[--landing-text] sm:text-4xl">
            {t("landing.heroTitle")}
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-[--landing-text-muted] sm:text-base">
            {t("landing.heroSubtitle")}
          </p>

          <div className="mt-6 max-w-lg space-y-2">
            {justRegistered && !needsLogin ? (
              <div
                className="rounded-[var(--radius-control)] border border-[--landing-accent]/25 bg-[--landing-accent-soft] px-3 py-2.5 text-[11px] leading-4 text-[--landing-text]"
                role="status"
              >
                <p className="font-medium">{t("install.welcomeRegisterTitle")}</p>
                <p className="mt-0.5 text-[--landing-text-muted]">
                  {t("install.welcomeRegisterDesc")}
                </p>
              </div>
            ) : null}
            {needsLogin ? (
              <div className="rounded-[var(--radius-control)] border border-[--landing-accent]/25 bg-[--landing-accent-soft] px-3 py-2.5 text-[11px] leading-4 text-[--landing-text]">
                <p className="font-medium">{t("install.loginFirstTitle")}</p>
                <p className="mt-0.5 text-[--landing-text-muted]">
                  {t("install.loginFirstDesc")}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => goLoginPreservingShop("login")}
                    className="rounded-[var(--radius-control)] bg-ink px-2.5 py-1 text-[11px] font-semibold text-white"
                  >
                    {t("install.navLogin")}
                  </button>
                  <button
                    type="button"
                    onClick={() => goLoginPreservingShop("register")}
                    className="rounded-[var(--radius-control)] border border-[--landing-border] bg-[--landing-surface] px-2.5 py-1 text-[11px] font-medium text-[--landing-text]"
                  >
                    {t("install.navRegister")}
                  </button>
                </div>
              </div>
            ) : null}
            <ShopDomainConnectField
              value={handle}
              onChange={setHandle}
              onConnect={connect}
              connecting={redirecting}
            />
            {error ? (
              <p className="text-[11px] leading-4 text-red-600">{error}</p>
            ) : (
              <p className="text-[11px] leading-4 text-[--landing-text-subtle]">
                {needsLogin
                  ? t("install.connectNoteLoginFirst")
                  : t("install.connectNote")}
              </p>
            )}
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2">
            {trustSignals.map((signal) => (
              <span
                key={signal}
                className="inline-flex items-center gap-1.5 text-[11px] text-[--landing-text-muted]"
              >
                <CheckCircle2 className="h-3.5 w-3.5 text-[--landing-accent]" />
                {signal}
              </span>
            ))}
          </div>
        </div>

        <LandingHeroPreview />
      </section>

      {/* Same product story as marketing home — App Store / Admin first impression. */}
      <LandingStats />
      <LandingFeatures />
      <LandingValueProps />
      <LandingHowItWorks />
      <LandingUseCases />
      <LandingCtaBand onStart={scrollToConnect} />
      <LandingFooter />
    </main>
  );
}

export default function InstallPage() {
  const t = useT();
  return (
    <Suspense
      fallback={
        <main className="flex min-h-full items-center justify-center bg-canvas">
          <Loader2
            className="h-7 w-7 animate-spin text-brand"
            aria-label={t("authorize.loading")}
          />
        </main>
      }
    >
      <InstallPageContent />
    </Suspense>
  );
}
