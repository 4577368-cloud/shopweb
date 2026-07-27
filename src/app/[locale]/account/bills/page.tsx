import { redirect } from "next/navigation";

/**
 * Billing / recharge was retired for this storefront product (no paid plans).
 * Keep the route so old bookmarks / emails do not 404.
 */
export default async function AccountBillsRedirectPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  redirect(`/${locale}/account/shops`);
}
