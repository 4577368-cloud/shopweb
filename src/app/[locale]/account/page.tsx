import { redirect } from "next/navigation";

/**
 * /account → /account/shops redirect.
 * Account tabs: shops / profile / security (no billing — product is free).
 */
export default async function AccountIndexPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  redirect(`/${locale}/account/shops`);
}
