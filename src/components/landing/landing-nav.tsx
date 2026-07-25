"use client";

import Link from "next/link";
import { AppLogo } from "@/components/brand/app-logo";
import { useT, useLocale } from "@/i18n/LocaleProvider";
import { localePath } from "@/i18n/LocaleLink";
import { ArrowRight } from "@/lib/ui/icons";

interface LandingNavProps {
  /** 未登录时触发 AuthPanel。 */
  onShowAuth: (mode: "login" | "register") => void;
  /** 已登录时"进入工作台"按钮的目标路径（已含 locale 前缀）。未登录传 null。 */
  entryHref: string | null;
}

/**
 * 顶部导航：Logo + 右上角按钮。
 * 白底 + 底部细线，fixed 定位。
 * - 未登录：登录 / 免费注册（触发 AuthPanel）
 * - 已登录：进入工作台（链接到 entryHref）
 */
export function LandingNav({ onShowAuth, entryHref }: LandingNavProps) {
  const t = useT();
  const locale = useLocale();

  return (
    <nav className="fixed inset-x-0 top-0 z-50 border-b border-[--landing-border] bg-white/80 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-6">
        <AppLogo variant="header" size="sm" href={localePath(locale, "/")} />

        {entryHref ? (
          <Link
            href={entryHref}
            className="landing-btn-primary inline-flex items-center gap-2 rounded-[var(--radius-control)] px-5 py-2 text-[13px] font-semibold"
          >
            {t("landing.navEnterWorkbench")}
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        ) : (
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => onShowAuth("login")}
              className="landing-btn-secondary rounded-[var(--radius-control)] px-4 py-2 text-[13px] font-medium"
            >
              {t("landing.navLogin")}
            </button>
            <button
              type="button"
              onClick={() => onShowAuth("register")}
              className="landing-btn-primary rounded-[var(--radius-control)] px-4 py-2 text-[13px] font-semibold"
            >
              {t("landing.navRegister")}
            </button>
          </div>
        )}
      </div>
    </nav>
  );
}
