import { redirect } from "next/navigation";

/**
 * /account → /account/shops redirect.
 *
 * V1: the user center is a single page (shop management). Future phases will add
 * /account/profile, /account/balance, /account/credits, /account/settings, at which
 * point this page becomes a real landing/tab-shell. For now, a server redirect keeps
 * the URL hierarchy clean and avoids a 404 when a user clicks "Account" in the sidebar.
 */
export default async function AccountIndexPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  redirect(`/${locale}/account/shops`);
}
