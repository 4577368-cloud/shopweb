// 底部快捷操作四卡片（设计 §10 / 原型）：对比竞店 / 学素材 / 收藏管理 / 用量明细。
import { useT } from "@/i18n/LocaleProvider";
import { Crosshair, Wand2, ListChecks, Database } from "@/lib/ui/icons";

interface QuickActionsProps {
  onCompare: () => void;
  onLearn: () => void;
  onManage: () => void;
  onUsage: () => void;
}

const ACTIONS = [
  { key: "compare", Icon: Crosshair, run: "onCompare" },
  { key: "learn", Icon: Wand2, run: "onLearn" },
  { key: "manage", Icon: ListChecks, run: "onManage" },
  { key: "usage", Icon: Database, run: "onUsage" },
] as const;

export function QuickActions({ onCompare, onLearn, onManage, onUsage }: QuickActionsProps) {
  const t = useT();
  const handlers = { onCompare, onLearn, onManage, onUsage };
  return (
    <div>
      <p className="mb-2 text-[11px] font-medium text-ink-subtle">{t("ops.quickActions.title")}</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {ACTIONS.map(({ key, Icon, run }) => (
          <button
            key={key}
            type="button"
            onClick={handlers[run]}
            className="flex items-center gap-2 rounded-[var(--radius-card)] border border-hairline bg-surface px-3 py-2.5 text-left shadow-card transition-colors hover:border-brand/40 hover:bg-surface-hover"
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-brand-soft text-brand-accent">
              <Icon className="h-4 w-4" />
            </span>
            <span className="text-[12px] font-medium text-ink">{t(`ops.quickActions.${key}`)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
