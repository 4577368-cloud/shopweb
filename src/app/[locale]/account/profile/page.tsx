"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Person,
  RefreshCw,
} from "@/lib/ui/icons";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/input";
import { ApiError } from "@/lib/api";
import { userApi, type UserProfile, type UpdateProfilePayload } from "@/lib/user/api";
import { useUser } from "@/context/user-context";
import { useT, useLocale } from "@/i18n/LocaleProvider";
import { localePath } from "@/i18n/LocaleLink";
import { localeHtmlLang } from "@/i18n/config";
import {
  AccountCard,
  AccountErrorState,
  AccountLoadingState,
  AccountPageHeader,
  AccountSignInState,
} from "@/components/account/account-primitives";

/**
 * Account → Profile.
 *
 * Edits the user's display name, avatar URL, locale, timezone, currency, and
 * AI-response language. The form is dirty-checked against the server snapshot;
 * save calls PUT /api/plugin/user/profile (COALESCE update — null fields are
 * preserved server-side).
 *
 * After a successful save, we also call refreshUser() so the global User
 * context (sidebar menu, etc.) picks up the new name.
 */
export default function AccountProfilePage() {
  const t = useT();
  const locale = useLocale();
  const { status, bootstrapping, refreshUser } = useUser();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Form fields — kept as strings for controlled inputs; converted on save.
  const [name, setName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [uiLocale, setUiLocale] = useState("");
  const [timezone, setTimezone] = useState("");
  const [currency, setCurrency] = useState("");
  const [aiResponseLanguage, setAiResponseLanguage] = useState("");

  const loadProfile = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const p = await userApi.getProfile();
      setProfile(p);
      hydrateForm(p);
    } catch (err) {
      setError(readError(err, t));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (bootstrapping) return;
    if (status !== "authenticated") return;
    void loadProfile();
  }, [bootstrapping, status, loadProfile]);

  function hydrateForm(p: UserProfile) {
    setName(p.name ?? "");
    setAvatarUrl(p.avatarUrl ?? "");
    setUiLocale(p.locale ?? "");
    setTimezone(p.timezone ?? "");
    setCurrency(p.currency ?? "");
    setAiResponseLanguage(p.aiResponseLanguage ?? "");
  }

  const isDirty =
    profile != null &&
    (name !== (profile.name ?? "") ||
      avatarUrl !== (profile.avatarUrl ?? "") ||
      uiLocale !== (profile.locale ?? "") ||
      timezone !== (profile.timezone ?? "") ||
      currency !== (profile.currency ?? "") ||
      aiResponseLanguage !== (profile.aiResponseLanguage ?? ""));

  const handleSave = async () => {
    if (!isDirty || saving) return;
    setSaving(true);
    setSaveError(null);
    setSavedAt(null);
    try {
      // Build payload with only changed fields — server uses COALESCE on null.
      const payload: UpdateProfilePayload = {};
      if (name !== (profile?.name ?? "")) payload.name = name.trim() || null;
      if (avatarUrl !== (profile?.avatarUrl ?? "")) payload.avatarUrl = avatarUrl.trim() || null;
      if (uiLocale !== (profile?.locale ?? "")) payload.locale = uiLocale || null;
      if (timezone !== (profile?.timezone ?? "")) payload.timezone = timezone || null;
      if (currency !== (profile?.currency ?? "")) payload.currency = currency || null;
      if (aiResponseLanguage !== (profile?.aiResponseLanguage ?? ""))
        payload.aiResponseLanguage = aiResponseLanguage || null;

      const updated = await userApi.updateProfile(payload);
      setProfile(updated);
      hydrateForm(updated);
      setSavedAt(Date.now());
      // Refresh global user context so sidebar/headers show the new name.
      await refreshUser();
    } catch (err) {
      setSaveError(readError(err, t));
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    if (profile) hydrateForm(profile);
    setSaveError(null);
    setSavedAt(null);
  };

  if (bootstrapping) {
    return <AccountLoadingState message={t("common.loading")} />;
  }

  if (status !== "authenticated") {
    return (
      <AccountSignInState
        icon={<Person className="h-4 w-4 text-muted-foreground" />}
        message={t("accountProfile.signInRequired")}
        signInLabel={t("userMenu.signIn")}
        signInHref={localePath(locale, `/login?from=${encodeURIComponent("/account/profile")}`)}
      />
    );
  }

  return (
    <section className="space-y-6">
      <AccountPageHeader
        title={t("accountProfile.title")}
        subtitle={t("accountProfile.subtitle")}
        footnote={profile?.email}
        actions={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => void loadProfile()}
            disabled={loading}
          >
            <RefreshCw className={loading ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} />
            {t("accountProfile.refresh")}
          </Button>
        }
      />

      {loading ? (
        <AccountLoadingState message={t("accountProfile.loading")} />
      ) : error ? (
        <AccountErrorState
          title={t("accountProfile.loadFailed")}
          message={error}
          retryLabel={t("accountProfile.retry")}
          onRetry={() => void loadProfile()}
        />
      ) : profile ? (
        <>
          {/* Account meta (read-only) */}
          <AccountCard title={t("accountProfile.sectionAccount")}>
            <dl className="grid grid-cols-1 gap-3 text-[12px] sm:grid-cols-2">
              <MetaItem label={t("accountProfile.fieldEmail")} value={profile.email} />
              <MetaItem label={t("accountProfile.fieldStatus")} value={formatStatus(profile.status, t)} />
              <MetaItem
                label={t("accountProfile.fieldCreatedAt")}
                value={fmtDate(locale, profile.createdAt)}
              />
              <MetaItem
                label={t("accountProfile.fieldLastLoginAt")}
                value={fmtDate(locale, profile.lastLoginAt)}
              />
            </dl>
          </AccountCard>

          {/* Editable fields */}
          <AccountCard
            title={t("accountProfile.sectionProfile")}
            description={t("accountProfile.sectionProfileHint")}
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label={t("accountProfile.fieldName")} labelHtmlFor="profile-name">
                <Input
                  id="profile-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={64}
                  disabled={saving}
                  placeholder={t("accountProfile.fieldNamePlaceholder")}
                />
              </Field>

              <Field label={t("accountProfile.fieldAvatarUrl")} labelHtmlFor="profile-avatar">
                <Input
                  id="profile-avatar"
                  type="url"
                  value={avatarUrl}
                  onChange={(e) => setAvatarUrl(e.target.value)}
                  maxLength={2048}
                  disabled={saving}
                  placeholder="https://…/avatar.png"
                />
              </Field>

              <Field label={t("accountProfile.fieldLocale")} labelHtmlFor="profile-locale">
                <select
                  id="profile-locale"
                  value={uiLocale}
                  onChange={(e) => setUiLocale(e.target.value)}
                  className={selectClass}
                  disabled={saving}
                >
                  <option value="">{t("accountProfile.optionSelect")}</option>
                  <option value="zh">中文</option>
                  <option value="en">English</option>
                  <option value="fr">Français</option>
                  <option value="es">Español</option>
                </select>
              </Field>

              <Field label={t("accountProfile.fieldTimezone")} labelHtmlFor="profile-timezone">
                <Input
                  id="profile-timezone"
                  type="text"
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  maxLength={64}
                  disabled={saving}
                  placeholder="Asia/Shanghai"
                  list="tz-suggestions"
                />
                <datalist id="tz-suggestions">
                  {COMMON_TIMEZONES.map((tz) => (
                    <option key={tz} value={tz} />
                  ))}
                </datalist>
              </Field>

              <Field label={t("accountProfile.fieldCurrency")} labelHtmlFor="profile-currency">
                <select
                  id="profile-currency"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className={selectClass}
                  disabled={saving}
                >
                  <option value="">{t("accountProfile.optionSelect")}</option>
                  {COMMON_CURRENCIES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.code} — {c.label}
                    </option>
                  ))}
                </select>
              </Field>

              <Field
                label={t("accountProfile.fieldAiResponseLanguage")}
                labelHtmlFor="profile-ai-lang"
              >
                <select
                  id="profile-ai-lang"
                  value={aiResponseLanguage}
                  onChange={(e) => setAiResponseLanguage(e.target.value)}
                  className={selectClass}
                  disabled={saving}
                >
                  <option value="">{t("accountProfile.optionSelect")}</option>
                  <option value="zh">中文</option>
                  <option value="en">English</option>
                  <option value="fr">Français</option>
                  <option value="es">Español</option>
                </select>
              </Field>
            </div>

            {/* Action bar */}
            <div className="mt-5 flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                onClick={() => void handleSave()}
                disabled={!isDirty || saving}
              >
                {saving ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                )}
                {t("accountProfile.save")}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleReset}
                disabled={!isDirty || saving}
              >
                {t("accountProfile.reset")}
              </Button>

              {savedAt ? (
                <span className="inline-flex items-center gap-1 text-[11px] text-brand-accent">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  {t("accountProfile.toastSaved")}
                </span>
              ) : null}
              {saveError ? (
                <span className="inline-flex items-center gap-1 text-[11px] text-destructive">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {saveError}
                </span>
              ) : null}
            </div>
          </AccountCard>

          <p className="text-[11px] leading-5 text-muted-foreground/80">
            {t("accountProfile.footnote")}
          </p>
        </>
      ) : null}
    </section>
  );
}

// ===== Local helpers =====

/**
 * Select styling — mirrors the global `Input` (controlClassName) so the two
 * controls look identical in the same form. Kept local because the global
 * `Select` component is more opinionated about chevron icon / layout.
 */
const selectClass =
  "flex h-9 w-full rounded-[var(--radius-control)] border border-input bg-surface px-3 text-sm text-foreground shadow-sm transition-[border-color,box-shadow] focus:border-brand focus:outline-none focus:ring-2 focus:ring-ring/35 disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-60";

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <dt className="text-[10px] uppercase tracking-wide text-muted-foreground/80">{label}</dt>
      <dd className="break-all text-muted-foreground">{value}</dd>
    </div>
  );
}

const COMMON_TIMEZONES = [
  "Asia/Shanghai",
  "Asia/Hong_Kong",
  "Asia/Tokyo",
  "Asia/Singapore",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "America/New_York",
  "America/Los_Angeles",
  "America/Chicago",
  "UTC",
];

const COMMON_CURRENCIES = [
  { code: "CNY", label: "Chinese Yuan" },
  { code: "USD", label: "US Dollar" },
  { code: "EUR", label: "Euro" },
  { code: "GBP", label: "British Pound" },
  { code: "JPY", label: "Japanese Yen" },
  { code: "HKD", label: "Hong Kong Dollar" },
];

function fmtDate(locale: string, iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const htmlLang = localeHtmlLang[locale as keyof typeof localeHtmlLang] ?? locale;
  return d.toLocaleString(htmlLang, { hour12: false });
}

function formatStatus(status: string, t: (key: string, params?: Record<string, string | number>) => string): string {
  if (status === "ACTIVE") return t("accountProfile.statusActive");
  if (status === "DISABLED") return t("accountProfile.statusDisabled");
  return status;
}

function readError(err: unknown, t: (key: string, params?: Record<string, string | number>) => string): string {
  if (err instanceof ApiError) {
    if (err.status === 0) return t("auth.errorNetwork");
    if (err.status === 401) return t("accountProfile.errorUnauthenticated");
    return t("auth.errorUnknown");
  }
  return t("auth.errorUnknown");
}
