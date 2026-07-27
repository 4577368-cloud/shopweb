import { redirect } from "next/navigation";

/**
 * Marketing credits UI belonged to operations center. This app no longer sells
 * or displays credits — redirect old deep links to shop management.
 */
export default async function AccountCreditsRedirectPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  redirect(`/${locale}/account/shops`);
}
