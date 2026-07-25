import { redirect } from "next/navigation";
import { defaultLocale } from "@/i18n/config";

/**
 * 根路径 `/` 重定向到默认 locale。
 * always-prefix i18n 策略下，所有路由都带 /en /zh /fr /es 前缀。
 * 访问默认域名时落到这里，避免 404。
 *
 * 如需基于 Accept-Language 智能匹配，可在此读取 headers() 做 locale negotiation。
 * 当前简单起见统一跳 defaultLocale (en)。
 */
export default function RootPage() {
  redirect(`/${defaultLocale}`);
}
