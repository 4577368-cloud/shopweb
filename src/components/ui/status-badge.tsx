import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
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
  {
    label: string;
    variant: "info" | "warning" | "success" | "danger";
  }
> = {
  in_progress: { label: "进行中", variant: "info" },
  pending_confirm: { label: "待确认", variant: "warning" },
  completed: { label: "已完成", variant: "success" },
  error: { label: "异常", variant: "danger" },
};

const stepStatusMap: Record<
  StepStatus,
  { label: string; variant: "default" | "info" | "warning" | "success" | "danger" }
> = {
  not_started: { label: "未开始", variant: "default" },
  in_progress: workflowStatusMap.in_progress,
  pending_confirm: workflowStatusMap.pending_confirm,
  completed: workflowStatusMap.completed,
  error: workflowStatusMap.error,
};

/** 授权流程状态 → 统一四类 */
const authToWorkflow: Record<AuthStatus, { label: string; status: WorkflowStatus | "not_started" }> = {
  waiting_input: { label: "进行中", status: "in_progress" },
  ready_to_authorize: { label: "进行中", status: "in_progress" },
  authorizing: { label: "进行中", status: "in_progress" },
  authorized: { label: "已完成", status: "completed" },
  error: { label: "异常", status: "error" },
};

/** 商品匹配处置状态 → 统一四类 */
const matchToWorkflow: Record<
  ProductMatchStatus,
  { label: string; status: WorkflowStatus }
> = {
  high_match: { label: "待确认", status: "pending_confirm" },
  medium_match: { label: "待确认", status: "pending_confirm" },
  needs_review: { label: "异常", status: "error" },
  confirmed: { label: "已完成", status: "completed" },
  deferred: { label: "已完成", status: "completed" },
  flagged: { label: "异常", status: "error" },
  rejected: { label: "已完成", status: "completed" },
};

/** SKU 对齐状态 → 统一四类（冲突单独文案） */
const skuToWorkflow: Record<
  SkuAlignStatus,
  { label: string; status: WorkflowStatus }
> = {
  auto_aligned: { label: "待确认", status: "pending_confirm" },
  needs_confirm: { label: "待确认", status: "pending_confirm" },
  pending: { label: "进行中", status: "in_progress" },
  confirmed: { label: "已完成", status: "completed" },
  conflict: { label: "冲突", status: "error" },
  skipped: { label: "已完成", status: "completed" },
  flagged: { label: "异常", status: "error" },
};

const syncKindMap: Record<
  SyncResultKind,
  { label: string; variant: "success" | "default" | "danger" }
> = {
  success: { label: "已成功同步", variant: "success" },
  skipped: { label: "跳过", variant: "default" },
  exception: { label: "待处理异常", variant: "danger" },
};

export function WorkflowBadge({ status }: { status: WorkflowStatus }) {
  const item = workflowStatusMap[status];
  return <Badge variant={item.variant}>{item.label}</Badge>;
}

export function StepStatusBadge({ status }: { status: StepStatus }) {
  const item = stepStatusMap[status];
  return <Badge variant={item.variant}>{item.label}</Badge>;
}

export function AuthStatusBadge({ status }: { status: AuthStatus }) {
  const mapped = authToWorkflow[status];
  const variant =
    mapped.status === "not_started"
      ? "default"
      : workflowStatusMap[mapped.status as WorkflowStatus].variant;
  return <Badge variant={variant}>{mapped.label}</Badge>;
}

export function MatchStatusBadge({ status }: { status: ProductMatchStatus }) {
  const mapped = matchToWorkflow[status];
  return (
    <Badge variant={workflowStatusMap[mapped.status].variant}>
      {mapped.label}
    </Badge>
  );
}

export function SkuStatusBadge({ status }: { status: SkuAlignStatus }) {
  const mapped = skuToWorkflow[status];
  return (
    <Badge variant={workflowStatusMap[mapped.status].variant}>
      {mapped.label}
    </Badge>
  );
}

/** 自动对齐 vs 需确认 的补充标签（非流程状态） */
export function SkuKindBadge({ status }: { status: SkuAlignStatus }) {
  if (status === "auto_aligned") {
    return <Badge variant="teal">自动对齐</Badge>;
  }
  if (status === "needs_confirm") {
    return <Badge variant="warning">需核对</Badge>;
  }
  if (status === "conflict") {
    return <Badge variant="danger">冲突</Badge>;
  }
  return null;
}

export function SyncKindBadge({ kind }: { kind: SyncResultKind }) {
  const item = syncKindMap[kind];
  return <Badge variant={item.variant}>{item.label}</Badge>;
}

export function matchWorkflowStatus(status: ProductMatchStatus): WorkflowStatus {
  return matchToWorkflow[status].status;
}

export function skuWorkflowStatus(status: SkuAlignStatus): WorkflowStatus {
  return skuToWorkflow[status].status;
}

const rowActionVariants = cva(
  "inline-flex items-center justify-center gap-1 whitespace-nowrap rounded border text-xs font-medium transition-colors disabled:pointer-events-none disabled:opacity-40",
  {
    variants: {
      tone: {
        default:
          "h-7 border-slate-200 bg-white px-2 text-slate-700 hover:bg-slate-50",
        primary:
          "h-7 border-teal-700 bg-teal-700 px-2 text-white hover:bg-teal-800",
        danger:
          "h-7 border-red-200 bg-white px-2 text-red-700 hover:bg-red-50",
        ghost:
          "h-7 border-transparent bg-transparent px-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800",
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
