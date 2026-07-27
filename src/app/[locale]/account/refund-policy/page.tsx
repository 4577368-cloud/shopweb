"use client";

import Link from "next/link";
import { useT, useLocale } from "@/i18n/LocaleProvider";
import { localePath } from "@/i18n/LocaleLink";
import {
  AccountCard,
  AccountPageHeader,
} from "@/components/account/account-primitives";

/**
 * G6b：预付费积分 / 订阅退款政策短页。
 * 一期无 PayPal Subscriptions 自动续费；到期需重新购买。
 */
export default function RefundPolicyPage() {
  const t = useT();
  const locale = useLocale();

  return (
    <section className="space-y-6">
      <AccountPageHeader
        title={t("refundPolicy.title")}
        subtitle={t("refundPolicy.subtitle")}
      />
      <AccountCard>
        <div className="space-y-4 text-[13px] leading-relaxed text-ink">
          <p>{t("refundPolicy.p1")}</p>
          <p>{t("refundPolicy.p2")}</p>
          <p>{t("refundPolicy.p3")}</p>
          <p className="text-[12px] text-ink-muted">{t("refundPolicy.p4")}</p>
          <Link
            href={localePath(locale, "/account/credits")}
            className="inline-block text-[12px] text-link hover:underline"
          >
            {t("refundPolicy.backToCredits")}
          </Link>
        </div>
      </AccountCard>
    </section>
  );
}
