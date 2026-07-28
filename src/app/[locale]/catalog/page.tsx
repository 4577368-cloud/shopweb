import { redirect } from "next/navigation";

// Path B moved into the unified 选品 page. Keep the old route working by redirecting.
export default async function CatalogPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  redirect(`/${locale}/products?tab=catalog`);
}
