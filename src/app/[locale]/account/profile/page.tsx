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
import { useEmbeddedMode } from "@/host/embedded/use-embedded-mode";
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
 * Only editable field: display name (shown in the sidebar menu).
 * Language follows the URL locale; AI replies use message text + UI locale.
 * Avatar / timezone / currency / AI-language prefs were unused and removed.
 */
export default function AccountProfilePage() {
  const t = useT();
  const locale = useLocale();
  const { status, bootstrapping, refreshUser } = useUser();
  const { isEmbedded } = useEmbeddedMode();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [name, setName] = useState("");

  const loadProfile = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const p = await userApi.getProfile();
      setProfile(p);
      setName(p.name ?? "");
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

  const isDirty = profile != null && name !== (profile.name ?? "");

  const handleSave = async () => {
    if (!isDirty || saving) return;
    setSaving(true);
    setSaveError(null);
    setSavedAt(null);
    try {
      const payload: UpdateProfilePayload = {
        name: name.trim() || null,
      };
      const updated = await userApi.updateProfile(payload);
      setProfile(updated);
      setName(updated.name ?? "");
      setSavedAt(Date.now());
      await refreshUser();
    } catch (err) {
      setSaveError(readError(err, t));
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    if (profile) setName(profile.name ?? "");
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
        hideSignIn={isEmbedded}
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
            className="h-7 w-7 px-0"
            onClick={() => void loadProfile()}
            disabled={loading}
            title={t("accountProfile.refresh")}
            aria-label={t("accountProfile.refresh")}
          >
            <RefreshCw className={loading ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} />
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
          <AccountCard title={t("accountProfile.sectionAccount")}>
            <dl className="grid grid-cols-1 gap-3 text-[12px] sm:grid-cols-2">
              <MetaItem label={t("accountProfile.fieldEmail")} value={profile.email} />
              <MetaItem
                label={t("accountProfile.fieldStatus")}
                value={formatStatus(profile.status, t)}
              />
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

          <AccountCard
            title={t("accountProfile.sectionProfile")}
            description={t("accountProfile.sectionProfileHint")}
          >
            <div className="max-w-md">
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
            </div>

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

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <dt className="text-[10px] uppercase tracking-wide text-muted-foreground/80">
        {label}
      </dt>
      <dd className="break-all text-muted-foreground">{value}</dd>
    </div>
  );
}

function fmtDate(locale: string, iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const htmlLang = localeHtmlLang[locale as keyof typeof localeHtmlLang] ?? locale;
  return d.toLocaleString(htmlLang, { hour12: false });
}

function formatStatus(
  status: string,
  t: (key: string, params?: Record<string, string | number>) => string
): string {
  if (status === "ACTIVE") return t("accountProfile.statusActive");
  if (status === "DISABLED") return t("accountProfile.statusDisabled");
  return status;
}

function readError(
  err: unknown,
  t: (key: string, params?: Record<string, string | number>) => string
): string {
  if (err instanceof ApiError) {
    if (err.status === 0) return t("auth.errorNetwork");
    if (err.status === 401) return t("accountProfile.errorUnauthenticated");
    return t("auth.errorUnknown");
  }
  return t("auth.errorUnknown");
}
