import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { Providers } from "@/components/providers";
import { APP_DESCRIPTION, APP_FULL_NAME } from "@/lib/brand";
import "./globals.css";

const displayFont = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-brand",
  weight: ["500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: APP_FULL_NAME,
  description: APP_DESCRIPTION,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className={`${displayFont.variable} h-full antialiased`}>
      <body className="min-h-full bg-slate-100 font-sans text-slate-900">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
