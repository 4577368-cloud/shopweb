"use client";

import { useState, useRef, useEffect } from "react";
import { MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { isSkuResolved } from "@/context/onboarding-context";
import type { SkuAlignment, SkuHandleStatus, SkuJudgment } from "@/lib/types";
import { cn } from "@/lib/utils";

const judgmentLabel: Record<SkuJudgment, string> = {
  acceptable: "可直接接受",
  needs_review: "需核对",
  conflict: "有冲突",
  blocked: "待解锁",
};

const handleLabel: Record<SkuHandleStatus, string> = {
  unhandled: "未处理",
  accepted: "已接受",
  modified: "已修改",
  skipped: "已跳过",
  flagged: "已标记异常",
};

export function SkuJudgmentBadge({ judgment }: { judgment: SkuJudgment }) {
  const variant =
    judgment === "acceptable"
      ? "success"
      : judgment === "conflict"
        ? "danger"
        : judgment === "blocked"
          ? "default"
          : "warning";
  return <Badge variant={variant}>{judgmentLabel[judgment]}</Badge>;
}

export function SkuHandleBadge({ handle }: { handle: SkuHandleStatus }) {
  const variant =
    handle === "accepted"
      ? "teal"
      : handle === "unhandled"
        ? "outline"
        : handle === "flagged"
          ? "danger"
          : "default";
  return <Badge variant={variant}>{handleLabel[handle]}</Badge>;
}

function MoreMenu({
  items,
}: {
  items: { label: string; onClick: () => void; danger?: boolean }[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  if (items.length === 0) return null;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-7 w-7 items-center justify-center rounded border border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
        aria-label="更多操作"
      >
        <MoreHorizontal className="h-3.5 w-3.5" />
      </button>
      {open ? (
        <div className="absolute right-0 z-20 mt-1 min-w-[120px] rounded-md border border-slate-200 bg-white py-1 shadow-md">
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              className={cn(
                "block w-full px-3 py-1.5 text-left text-xs hover:bg-slate-50",
                item.danger ? "text-red-700" : "text-slate-700"
              )}
              onClick={() => {
                setOpen(false);
                item.onClick();
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function SkuRowActions({
  row,
  onAction,
}: {
  row: SkuAlignment;
  onAction: (id: string, action: string) => void;
}) {
  if (isSkuResolved(row)) {
    return (
      <span className="text-[11px] text-slate-400">
        {handleLabel[row.handleStatus]}
      </span>
    );
  }

  if (row.handleStatus === "modified") {
    return (
      <div className="flex items-center justify-end gap-1.5">
        <Button size="sm" onClick={() => onAction(row.id, "accept")}>
          接受
        </Button>
        <MoreMenu
          items={[
            { label: "更换 SKU", onClick: () => onAction(row.id, "swap") },
            { label: "暂不处理", onClick: () => onAction(row.id, "skip") },
          ]}
        />
      </div>
    );
  }

  if (row.judgment === "blocked") {
    return (
      <div className="flex items-center justify-end gap-1.5">
        <span className="text-[11px] text-slate-400">等待选品确认</span>
        <button
          type="button"
          className="text-[11px] text-slate-500 underline-offset-2 hover:underline"
          onClick={() => onAction(row.id, "skip")}
        >
          暂不处理
        </button>
      </div>
    );
  }

  if (row.judgment === "conflict") {
    return (
      <div className="flex items-center justify-end gap-1.5">
        <Button size="sm" onClick={() => onAction(row.id, "diff")}>
          去处理
        </Button>
        <MoreMenu
          items={[
            { label: "更换 SKU", onClick: () => onAction(row.id, "swap") },
            {
              label: "标记异常",
              onClick: () => onAction(row.id, "flag"),
              danger: true,
            },
            { label: "暂不处理", onClick: () => onAction(row.id, "skip") },
          ]}
        />
      </div>
    );
  }

  if (row.judgment === "needs_review") {
    return (
      <div className="flex items-center justify-end gap-1.5">
        <Button size="sm" onClick={() => onAction(row.id, "diff")}>
          去核对
        </Button>
        <MoreMenu
          items={[
            { label: "修改映射", onClick: () => onAction(row.id, "edit") },
            { label: "更换 SKU", onClick: () => onAction(row.id, "swap") },
            { label: "暂不处理", onClick: () => onAction(row.id, "skip") },
          ]}
        />
      </div>
    );
  }

  return (
    <div className="flex items-center justify-end gap-1.5">
      <Button size="sm" onClick={() => onAction(row.id, "accept")}>
        接受
      </Button>
      <MoreMenu
        items={[
          { label: "修改映射", onClick: () => onAction(row.id, "edit") },
          { label: "更换 SKU", onClick: () => onAction(row.id, "swap") },
          { label: "暂不处理", onClick: () => onAction(row.id, "skip") },
        ]}
      />
    </div>
  );
}
