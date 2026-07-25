// 封面缩略图占位（mock 阶段图片为空，用首字母 + 渐变占位；接入真实数据后 src 有值即显示）。
import { cn } from "@/lib/utils";

const GRADIENTS = [
  "from-indigo-400 to-violet-500",
  "from-rose-400 to-orange-400",
  "from-emerald-400 to-teal-500",
  "from-sky-400 to-blue-500",
  "from-amber-400 to-pink-500",
  "from-fuchsia-400 to-purple-500",
];

export function CoverThumb({
  src,
  label,
  sub,
  className,
}: {
  src?: string;
  label?: string;
  sub?: string;
  className?: string;
}) {
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={src}
        alt={label ?? ""}
        className={cn("h-full w-full object-cover", className)}
      />
    );
  }
  const ch = (label ?? "?").trim().charAt(0).toUpperCase() || "?";
  const idx = (label ?? "?").charCodeAt(0) % GRADIENTS.length;
  return (
    <div
      className={cn(
        "flex h-full w-full flex-col items-center justify-center gap-0.5 bg-gradient-to-br text-white/90",
        GRADIENTS[idx],
        className
      )}
      aria-hidden
    >
      <span className="text-lg font-semibold leading-none">{ch}</span>
      {sub && <span className="text-[9px] uppercase tracking-wide opacity-80">{sub}</span>}
    </div>
  );
}
