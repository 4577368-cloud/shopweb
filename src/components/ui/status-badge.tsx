"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/LocaleProvider";
import type {
  AuthStatus,
  ProductMatchStatus,
  SkuAlignStatus,
  StepStatus,
  SyncResultKind,
  WorkflowStatus,
} from "@/lib/types";
import { Badge } from "@/components/ui/badge";

/** 全站 4 类流程状态 */
export const workflowStatusMap: Record<
  WorkflowStatus,
  { labelKey: string; variant: "info" | "warning" | "success" | "danger" }
> = {
  in_progress: { labelKey: "status.inProgress", variant: "info" },
  pending_confirm: { labelKey: "status.pending", variant: "warning" },
  completed: { labelKey: "status.done", variant: "success" },
  error: { labelKey: "status.exception", variant: "danger" },
};

const stepStatusMap: Record<
  StepStatus,
  { labelKey: string; variant: "default" | "info" | "warning" | "success" | "danger" }
> = {
  not_started: { labelKey: "status.notStarted", variant: "default" },
  in_progress: workflowStatusMap.in_progress,
  pending_confirm: workflowStatusMap.pending_confirm,
  completed: workflowStatusMap.completed,
  error: workflowStatusMap.error,
};

/** 授权流程状态 → 统一四类 */
const authToWorkflow: Record<
  AuthStatus,
  { labelKey: string; status: WorkflowStatus | "not_started" }
> = {
  waiting_input: { labelKey: "status.inProgress", status: "in_progress" },
  ready_to_authorize: { labelKey: "status.inProgress", status: "in_progress" },
  authorizing: { labelKey: "status.inProgress", status: "in_progress" },
  authorized: { labelKey: "status.done", status: "completed" },
  error: { labelKey: "status.exception", status: "error" },
};

/** 商品匹配处置状态 → 统一四类 */
const matchToWorkflow: Record<
  ProductMatchStatus,
  { labelKey: string; status: WorkflowStatus }
> = {
  high_match: { labelKey: "status.pending", status: "pending_confirm" },
  medium_match: { labelKey: "status.pending", status: "pending_confirm" },
  needs_review: { labelKey: "status.exception", status: "error" },
  confirmed: { labelKey: "status.done", status: "completed" },
  deferred: { labelKey: "status.done", status: "completed" },
  flagged: { labelKey: "status.exception", status: "error" },
  rejected: { labelKey: "status.done", status: "completed" },
};

/** SKU 对齐状态 → 统一四类（冲突单独文案） */
const skuToWorkflow: Record<
  SkuAlignStatus,
  { labelKey: string; status: WorkflowStatus }
> = {
  auto_aligned: { labelKey: "status.pending", status: "pending_confirm" },
  needs_confirm: { labelKey: "status.pending", status: "pending_confirm" },
  pending: { labelKey: "status.inProgress", status: "in_progress" },
  confirmed: { labelKey: "status.done", status: "completed" },
  conflict: { labelKey: "status.conflict", status: "error" },
  skipped: { labelKey: "status.done", status: "completed" },
  flagged: { labelKey: "status.exception", status: "error" },
};

const syncKindMap: Record<
  SyncResultKind,
  { labelKey: string; variant: "success" | "default" | "danger" }
> = {
  success: { labelKey: "sync.kindSuccess", variant: "success" },
  skipped: { labelKey: "sync.kindSkipped", variant: "default" },
  exception: { labelKey: "sync.kindException", variant: "danger" },
};

export function WorkflowBadge({ status }: { status: WorkflowStatus }) {
  const t = useT();
  const item = workflowStatusMap[status];
  return <Badge variant={item.variant}>{t(item.labelKey)}</Badge>;
}

export function StepStatusBadge({ status }: { status: StepStatus }) {
  const t = useT();
  const item = stepStatusMap[status];
  return <Badge variant={item.variant}>{t(item.labelKey)}</Badge>;
}

export function AuthStatusBadge({ status }: { status: AuthStatus }) {
  const t = useT();
  const mapped = authToWorkflow[status];
  const variant =
    mapped.status === "not_started"
      ? "default"
      : workflowStatusMap[mapped.status as WorkflowStatus].variant;
  return <Badge variant={variant}>{t(mapped.labelKey)}</Badge>;
}

export function MatchStatusBadge({ status }: { status: ProductMatchStatus }) {
  const t = useT();
  const mapped = matchToWorkflow[status];
  return (
    <Badge variant={workflowStatusMap[mapped.status].variant}>
      {t(mapped.labelKey)}
    </Badge>
  );
}

export function SkuStatusBadge({ status }: { status: SkuAlignStatus }) {
  const t = useT();
  const mapped = skuToWorkflow[status];
  return (
    <Badge variant={workflowStatusMap[mapped.status].variant}>
      {t(mapped.labelKey)}
    </Badge>
  );
}

/** 自动对齐 vs 需确认 的补充标签（非流程状态） */
export function SkuKindBadge({ status }: { status: SkuAlignStatus }) {
  const t = useT();
  if (status === "auto_aligned") {
    return <Badge variant="teal">{t("sku.statusAutoAligned")}</Badge>;
  }
  if (status === "needs_confirm") {
    return <Badge variant="warning">{t("sku.statusNeedsConfirm")}</Badge>;
  }
  if (status === "conflict") {
    return <Badge variant="danger">{t("status.conflict")}</Badge>;
  }
  return null;
}

export function SyncKindBadge({ kind }: { kind: SyncResultKind }) {
  const t = useT();
  const item = syncKindMap[kind];
  return <Badge variant={item.variant}>{t(item.labelKey)}</Badge>;
}

export function matchWorkflowStatus(status: ProductMatchStatus): WorkflowStatus {
  return matchToWorkflow[status].status;
}

export function skuWorkflowStatus(status: SkuAlignStatus): WorkflowStatus {
  return skuToWorkflow[status].status;
}

const rowActionVariants = cva(
  "inline-flex items-center justify-center gap-1 whitespace-nowrap rounded border text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35 disabled:pointer-events-none disabled:opacity-40",
  {
    variants: {
      tone: {
        default:
          "h-7 border-surface-border bg-surface px-2 text-foreground hover:bg-surface-hover",
        primary:
          "h-7 border-brand bg-brand px-2 text-brand-foreground hover:bg-brand-hover",
        danger:
          "h-7 border-destructive/30 bg-surface px-2 text-destructive hover:bg-destructive-soft",
        ghost:
          "h-7 border-transparent bg-transparent px-1.5 text-muted-foreground hover:bg-surface-hover hover:text-foreground",
      },
    },
    defaultVariants: { tone: "default" },
  }
);

export interface RowActionProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof rowActionVariants> {}

export function RowAction({ className, tone, ...props }: RowActionProps) {
  return (
    <button className={cn(rowActionVariants({ tone }), className)} {...props} />
  );
}

export function RowActionGroup({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex min-w-[148px] flex-wrap items-center justify-end gap-1",
        className
      )}
      {...props}
    />
  );
}
