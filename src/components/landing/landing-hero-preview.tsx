"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, Search } from "@/lib/ui/icons";
import { useT } from "@/i18n/LocaleProvider";
import { useState, useEffect } from "react";

interface MockupProduct {
  id: string;
  name: string;
  sku: string;
  price: string;
  status: string;
  statusTone: "success" | "pending" | "cyan";
  thumbGradient: string;
  thumbIcon: React.ReactNode;
}

function HeadphonesIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 14v3a2 2 0 0 0 2 2h2v-5H3z" />
      <path d="M17 14v5h2a2 2 0 0 0 2-2v-3h-4z" />
      <path d="M21 12c0-4.97-4.03-9-9-9s-9 4.03-9 9" />
    </svg>
  );
}

function BoltIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  );
}

function CupIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 8h1a4 4 0 1 1 0 8h-1" />
      <path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z" />
      <line x1="6" x2="6.01" y1="2" y2="2" />
      <line x1="10" x2="10.01" y1="2" y2="2" />
    </svg>
  );
}

function ProjectorIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect width="20" height="14" x="2" y="5" rx="2" />
      <line x1="2" x2="22" y1="10" y2="10" />
      <circle cx="8" cy="14" r="2" />
      <circle cx="16" cy="14" r="2" />
    </svg>
  );
}

const PRODUCTS: MockupProduct[] = [
  {
    id: "1",
    name: "无线蓝牙耳机",
    sku: "SKU: TWS-2024-A1",
    price: "¥89.00",
    status: "已匹配",
    statusTone: "success",
    thumbGradient: "linear-gradient(135deg, #325be6 0%, #0ea5e9 100%)",
    thumbIcon: <HeadphonesIcon />,
  },
  {
    id: "2",
    name: "USB-C 快充充电器",
    sku: "SKU: CHG-65W-B2",
    price: "¥45.00",
    status: "AI 候选",
    statusTone: "cyan",
    thumbGradient: "linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)",
    thumbIcon: <BoltIcon />,
  },
  {
    id: "3",
    name: "便携咖啡杯",
    sku: "SKU: CUP-350-C3",
    price: "¥32.00",
    status: "待确认",
    statusTone: "pending",
    thumbGradient: "linear-gradient(135deg, #10b981 0%, #06b6d4 100%)",
    thumbIcon: <CupIcon />,
  },
  {
    id: "4",
    name: "迷你投影仪",
    sku: "SKU: PJ-1080-D4",
    price: "¥299.00",
    status: "已同步",
    statusTone: "success",
    thumbGradient: "linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)",
    thumbIcon: <ProjectorIcon />,
  },
];

function ScanLine({ active }: { active: boolean }) {
  return (
    <AnimatePresence>
      {active && (
        <motion.div
          initial={{ top: "0%", opacity: 0 }}
          animate={{ top: "100%", opacity: [0, 1, 1, 0] }}
          exit={{ opacity: 0 }}
          transition={{ duration: 1.2, ease: "easeInOut" }}
          className="pointer-events-none absolute inset-x-0 z-20"
          style={{ height: 2 }}
        >
          <div className="h-full bg-gradient-to-r from-transparent via-[--landing-accent] to-transparent shadow-[0_0_12px_rgba(50,91,230,0.4)]" />
          <div className="absolute inset-x-0 top-full h-16 bg-gradient-to-b from-[--landing-accent]/8 to-transparent" />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function ProductRow({ product, index, matched }: { product: MockupProduct; index: number; matched: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0.4, backgroundColor: "#f1f5f9" }}
      animate={
        matched
          ? { opacity: 1, backgroundColor: "#f8fafc" }
          : { opacity: 0.5, backgroundColor: "#f1f5f9" }
      }
      transition={{ duration: 0.35, delay: matched ? 0 : 0 }}
      className="landing-mockup-row relative overflow-hidden"
    >
      {/* 匹配完成的闪光条 */}
      <AnimatePresence>
        {matched && (
          <motion.div
            initial={{ left: "-100%" }}
            animate={{ left: "200%" }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className="pointer-events-none absolute inset-y-0 w-1/2"
            style={{
              background: "linear-gradient(90deg, transparent, rgba(50,91,230,0.08), transparent)",
            }}
          />
        )}
      </AnimatePresence>

      {/* 缩略图 */}
      <motion.span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg shadow-sm relative z-10"
        style={{ background: product.thumbGradient }}
        initial={{ scale: 0.8, opacity: 0.3 }}
        animate={matched ? { scale: 1, opacity: 1 } : { scale: 0.85, opacity: 0.4 }}
        transition={{ duration: 0.3, delay: matched ? index * 0.08 : 0 }}
      >
        {product.thumbIcon}
      </motion.span>

      {/* 商品信息 */}
      <div className="min-w-0 relative z-10">
        <motion.p
          className="truncate text-[12px] font-semibold text-[--landing-text]"
          initial={{ opacity: 0.2 }}
          animate={matched ? { opacity: 1 } : { opacity: 0.3 }}
          transition={{ duration: 0.25 }}
        >
          {product.name}
        </motion.p>
        <motion.p
          className="text-[10px] text-[--landing-text-subtle]"
          initial={{ opacity: 0.2 }}
          animate={matched ? { opacity: 1 } : { opacity: 0.3 }}
          transition={{ duration: 0.25, delay: 0.05 }}
        >
          {product.sku}
        </motion.p>
      </div>

      {/* 价格 */}
      <motion.span
        className="hidden text-[12px] font-medium tabular-nums text-[--landing-text-muted] md:block relative z-10"
        initial={{ opacity: 0 }}
        animate={matched ? { opacity: 1 } : { opacity: 0.2 }}
        transition={{ duration: 0.2 }}
      >
        {product.price}
      </motion.span>

      {/* 状态标签 */}
      <div className="relative z-10">
        <AnimatePresence mode="wait">
          {!matched ? (
            <motion.span
              key="analyzing"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              className="inline-flex items-center gap-1 rounded-md bg-slate-200 px-2 py-[3px] text-[10px] font-semibold text-slate-500"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-slate-400 animate-pulse" />
              分析中...
            </motion.span>
          ) : (
            <motion.span
              key="matched"
              initial={{ opacity: 0, scale: 0.6, y: 4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ type: "spring", stiffness: 500, damping: 20, delay: 0.1 }}
              className={`landing-mockup-tag is-${product.statusTone}`}
            >
              {product.status}
            </motion.span>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

function AnimatedCounter({ value, active }: { value: number; active: boolean }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    if (!active) {
      setDisplay(0);
      return;
    }
    const timer = setTimeout(() => {
      let start = 0;
      const duration = 400;
      const startTime = performance.now();
      const tick = (now: number) => {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1);
        start = Math.floor(progress * value);
        setDisplay(start);
        if (progress < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }, 600);
    return () => clearTimeout(timer);
  }, [active, value]);
  return <span>{active ? display : 0}</span>;
}

const LOOP_HOLD_MS = 4200;
const SCAN_START_MS = 1200;
const MATCH_START_MS = 1900;
const MATCH_STEP_MS = 180;
const DONE_MS = 2900;

export function LandingHeroPreview({ instant = false }: { instant?: boolean } = {}) {
  const t = useT();
  const [phase, setPhase] = useState<"idle" | "scanning" | "done">("idle");
  const [matchedRows, setMatchedRows] = useState<boolean[]>([false, false, false, false]);
  const [cycle, setCycle] = useState(0);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduced) {
      setPhase("done");
      setMatchedRows(PRODUCTS.map(() => true));
      return;
    }

    setPhase("idle");
    setMatchedRows(PRODUCTS.map(() => false));

    timers.push(setTimeout(() => setPhase("scanning"), SCAN_START_MS));
    PRODUCTS.forEach((_, i) => {
      timers.push(
        setTimeout(() => {
          setMatchedRows((prev) => {
            const next = [...prev];
            next[i] = true;
            return next;
          });
        }, MATCH_START_MS + i * MATCH_STEP_MS)
      );
    });
    timers.push(setTimeout(() => setPhase("done"), DONE_MS));
    // Hold the finished state, then replay.
    timers.push(setTimeout(() => setCycle((c) => c + 1), DONE_MS + LOOP_HOLD_MS));

    return () => timers.forEach(clearTimeout);
  }, [cycle]);

  return (
    <motion.div
      initial={instant ? false : { opacity: 0, scale: 0.96, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={
        instant
          ? { duration: 0 }
          : { duration: 0.7, ease: [0.22, 1, 0.36, 1], delay: 0.15 }
      }
      className="relative"
    >
      <div className="landing-mockup">
        {/* 顶部窗口栏 */}
        <div className="landing-mockup-bar">
          <div className="flex items-center gap-2">
            <span className="landing-mockup-dot is-cyan" />
            <span className="landing-mockup-dot is-accent" />
            <span className="landing-mockup-dot is-muted" />
          </div>
          <span className="ml-3 text-[11px] font-semibold tracking-wide text-[--landing-text-muted]">
            {t("landing.mockupTitle")}
          </span>
        </div>

        {/* 工具栏 */}
        <div className="border-b border-[--landing-border] px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="flex flex-1 items-center gap-2 rounded-lg bg-[--landing-bg-alt] px-3 py-1.5">
              <Search className="h-3.5 w-3.5 text-[--landing-text-subtle]" />
              <span className="text-[11px] text-[--landing-text-subtle]">{t("landing.mockupSearchPlaceholder")}</span>
            </div>
            <div className="flex items-center gap-1.5 rounded-lg border border-[--landing-border] px-2.5 py-1.5">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-[--landing-text-muted]">
                <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
              </svg>
              <span className="text-[11px] text-[--landing-text-muted]">{t("landing.mockupFilter")}</span>
            </div>
          </div>
          <div className="mt-2.5 flex items-center gap-1">
            <span className="rounded-md bg-[--landing-accent] px-2.5 py-[3px] text-[11px] font-semibold text-white">
              {t("landing.mockupTabAll")}
            </span>
            <span className="rounded-md px-2.5 py-[3px] text-[11px] text-[--landing-text-muted]">
              {t("landing.mockupTabMatched")}
            </span>
            <span className="rounded-md px-2.5 py-[3px] text-[11px] text-[--landing-text-muted]">
              {t("landing.mockupTabPending")}
            </span>
          </div>
        </div>

        {/* 商品列表 —— 带扫描动效 */}
        <div className="landing-mockup-body relative">
          {/* 表头 */}
          <div className="mb-2 hidden grid-cols-[40px_1fr_auto_auto] gap-3 px-2 md:grid">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[--landing-text-subtle]">Img</span>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[--landing-text-subtle]">Product</span>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[--landing-text-subtle]">Price</span>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[--landing-text-subtle]">Status</span>
          </div>

          <div className="grid gap-2 relative">
            <ScanLine active={phase === "scanning"} />
            {PRODUCTS.map((product, index) => (
              <ProductRow
                key={product.id}
                product={product}
                index={index}
                matched={matchedRows[index]}
              />
            ))}
          </div>
        </div>

        {/* 底部统计条 */}
        <div className="border-t border-[--landing-border] px-4 py-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-[--landing-text-subtle]">
              {t("landing.mockupFooter")}
            </span>
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1 text-[10px] text-[--landing-text-subtle]">
                <span className="h-1.5 w-1.5 rounded-full bg-[--landing-success]" />
                <AnimatedCounter value={2} active={phase === "done"} /> {t("landing.mockupFooterMatched")}
              </span>
              <span className="flex items-center gap-1 text-[10px] text-[--landing-text-subtle]">
                <span className="h-1.5 w-1.5 rounded-full bg-[--landing-warning]" />
                <AnimatedCounter value={1} active={phase === "done"} /> {t("landing.mockupFooterPending")}
              </span>
              <span className="flex items-center gap-1 text-[10px] text-[--landing-text-subtle]">
                <span className="h-1.5 w-1.5 rounded-full bg-[--landing-cyan]" />
                <AnimatedCounter value={1} active={phase === "done"} /> {t("landing.mockupFooterAi")}
              </span>
            </div>
          </div>
        </div>

        {/* AI 浮层提示 —— 匹配完成后弹出 */}
        <AnimatePresence>
          {phase === "done" && (
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1], delay: 0.2 }}
              className="landing-mockup-ai"
            >
              <div className="flex items-start gap-2.5">
                <motion.span
                  className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-[--landing-accent] to-[--landing-cyan] text-white shadow-md"
                  animate={{ rotate: [0, -10, 10, 0] }}
                  transition={{ duration: 0.5, delay: 0.6 }}
                >
                  <Sparkles className="h-3.5 w-3.5" />
                </motion.span>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-[--landing-text]">{t("landing.mockupAiTitle")}</p>
                  <TypewriterText text={t("landing.mockupAiBody")} delay={0.8} />
                </div>
              </div>
              <div className="absolute -bottom-1.5 right-6 h-3 w-3 rotate-45 border-b border-r border-[--landing-border] bg-white" />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

function TypewriterText({ text, delay }: { text: string; delay: number }) {
  return (
    <motion.p
      className="mt-1 text-[11px] leading-[1.5] text-[--landing-text-muted]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3, delay }}
    >
      {text}
      <motion.span
        className="ml-0.5 inline-block h-3 w-[1.5px] bg-[--landing-accent]"
        animate={{ opacity: [1, 0, 1] }}
        transition={{ duration: 1, repeat: Infinity }}
      />
    </motion.p>
  );
}
