import { Inbox } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  title: string;
  description?: string;
  className?: string;
  action?: React.ReactNode;
}

export function EmptyState({
  title,
  description,
  className,
  action,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-start justify-center gap-2 rounded-lg border border-dashed border-slate-200 bg-slate-50/60 px-6 py-10",
        className
      )}
    >
      <div className="flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-400">
        <Inbox className="h-4 w-4" />
      </div>
      <div>
        <p className="text-sm font-medium text-slate-800">{title}</p>
        {description ? (
          <p className="mt-1 text-xs text-slate-500">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}
