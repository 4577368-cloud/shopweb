// 平台徽标（TikTok 品红 / Facebook 蓝 / Meta Library 深蓝，设计 §4.1）
// 平台色属"数据"语义，用固定 hex 小圆点，不占语义 token。
import type { AdPlatform } from "@/lib/marketing/types";

const PLATFORM_COLOR: Record<string, string> = {
  tiktok: "#FE2C55",
  facebook: "#1877F2",
  meta: "#0668E1",
};

export function PlatformBadge({ platform }: { platform: AdPlatform | string }) {
  const color = PLATFORM_COLOR[platform] ?? "#94a3b8";
  const label =
    platform === "tiktok"
      ? "TikTok"
      : platform === "facebook"
        ? "Facebook"
        : platform === "meta"
          ? "Meta Library"
          : String(platform);
  return (
    <span className="inline-flex items-center gap-1 text-[11px] text-ink-muted">
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}
