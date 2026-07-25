// 左栏监控列表（设计 §1 / 原型）：TikTok 店铺 / 竞店 / 广告商品 三组 + 添加 / 同步。
import { useT } from "@/i18n/LocaleProvider";
import { Button } from "@/components/ui/button";
import { Plus, RefreshCw } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

export interface WatchlistItem {
  id: string;
  name: string;
}

export type WatchlistGroup = "tts" | "competitors" | "ads";

interface WatchlistProps {
  tts: WatchlistItem[];
  competitors: WatchlistItem[];
  ads: WatchlistItem[];
  onSelect: (group: WatchlistGroup, item: WatchlistItem) => void;
  onSync: () => void;
  onAdd: (group: WatchlistGroup) => void;
}

function Group({
  title,
  items,
  onSelect,
  onAdd,
  group,
}: {
  title: string;
  items: WatchlistItem[];
  onSelect: (group: WatchlistGroup, item: WatchlistItem) => void;
  onAdd: (group: WatchlistGroup) => void;
  group: WatchlistGroup;
}) {
  const t = useT();
  return (
    <div className="mb-3">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[11px] font-medium text-ink-subtle">
          {title}
          <span className="rounded-full bg-surface-muted px-1.5 text-[10px] text-ink-muted">
            {items.length}
          </span>
        </span>
        <button
          type="button"
          onClick={() => onAdd(group)}
          title={t("ops.watchlist.add")}
          aria-label={t("ops.watchlist.add")}
          className="flex h-5 w-5 items-center justify-center rounded text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink"
        >
          <Plus className="h-3 w-3" />
        </button>
      </div>
      {items.length === 0 ? (
        <p className="px-1 text-[11px] leading-snug text-ink-subtle">{t("ops.watchlist.empty")}</p>
      ) : (
        <ul className="space-y-0.5">
          {items.map((it) => (
            <li key={it.id}>
              <button
                type="button"
                onClick={() => onSelect(group, it)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-[var(--radius-control)] px-2 py-1.5 text-left text-[12px] transition-colors",
                  "text-ink-muted hover:bg-surface-muted hover:text-ink"
                )}
              >
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-ink-subtle/50" />
                <span className="min-w-0 flex-1 truncate">{it.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function Watchlist({ tts, competitors, ads, onSelect, onSync, onAdd }: WatchlistProps) {
  const t = useT();
  return (
    <div className="flex h-full flex-col">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-[13px] font-semibold text-ink">{t("ops.watchlist.title")}</h2>
        <Button size="sm" variant="ghost" onClick={onSync} title={t("ops.watchlist.sync")} aria-label={t("ops.watchlist.sync")}>
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto pr-0.5">
        <Group title={t("ops.watchlist.tts")} items={tts} group="tts" onSelect={onSelect} onAdd={onAdd} />
        <Group title={t("ops.watchlist.competitors")} items={competitors} group="competitors" onSelect={onSelect} onAdd={onAdd} />
        <Group title={t("ops.watchlist.ads")} items={ads} group="ads" onSelect={onSelect} onAdd={onAdd} />
      </div>
    </div>
  );
}
