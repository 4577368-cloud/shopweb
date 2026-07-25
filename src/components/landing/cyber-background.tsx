"use client";

/**
 * Landing 页面白底装饰背景：极淡点阵 + 顶部品牌光带。
 * 纯视觉装饰，pointer-events: none，不拦截交互。
 */
export function CyberBackground() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      <div className="landing-dot-bg" />
      <div className="landing-hero-glow" />
    </div>
  );
}
