import { redirect } from "next/navigation";

/** Ops / credits refund policy — retired with monetization. */
export default async function AccountRefundPolicyRedirectPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  redirect(`/${locale}/account/shops`);
}
