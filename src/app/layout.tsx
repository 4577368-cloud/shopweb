import type { Metadata } from "next";
import { Providers } from "@/components/providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tangbuy · 一件代发工作台",
  description: "Shopify 商家一件代发 onboarding 工作台原型",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="h-full antialiased">
      <body className="min-h-full bg-slate-100 font-sans text-slate-900">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
