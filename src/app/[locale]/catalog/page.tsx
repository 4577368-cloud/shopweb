import { redirect } from "next/navigation";

// Path B moved into the unified 选品 page. Keep the old route working by redirecting.
export default function CatalogPage() {
  redirect("/products?tab=catalog");
}
