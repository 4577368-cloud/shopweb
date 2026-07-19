"use client";

import Link from "next/link";
import { AlertTriangle, Lightbulb, PanelRight } from "lucide-react";
import type { AiPanelContent } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface AiAssistantProps {
  content: AiPanelContent;
  onAlertClick?: (targetId: string) => void;
  onNextAction?: (action: string) => void;
  highlightedAlertId?: string;
}

export function AiAssistant({
  content,
  onAlertClick,
  onNextAction,
  highlightedAlertId,
}: AiAssistantProps) {
  const next = content.nextAction;

  return (
    <aside className="flex w-[300px] shrink-0 flex-col gap-3 border-l border-slate-200 bg-slate-50/80 p-3">
      <Card className="shadow-none">
        <CardHeader className="border-b-0 pb-0">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500">
              <PanelRight className="h-3.5 w-3.5" />
            </div>
            <div>
              <CardTitle className="text-sm">助手说明</CardTitle>
              <p className="text-[11px] text-slate-500">{content.title}</p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 pt-2">
          <p className="text-xs leading-5 text-slate-600">{content.summary}</p>

          <div>
            <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium text-slate-500">
              <Lightbulb className="h-3 w-3" />
              关键说明
            </div>
            <ul className="space-y-1.5">
              {content.bullets.map((item) => (
                <li
                  key={item}
                  className="flex gap-2 text-xs leading-5 text-slate-600"
                >
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-slate-400" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          {content.alerts && content.alerts.length > 0 ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2">
              <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium text-amber-800">
                <AlertTriangle className="h-3 w-3" />
                需注意
              </div>
              <ul className="space-y-1.5">
                {content.alerts.map((alert) => {
                  const clickable = Boolean(alert.targetId && onAlertClick);
                  return (
                    <li key={alert.id}>
                      {clickable ? (
                        <button
                          type="button"
                          onClick={() => onAlertClick?.(alert.targetId!)}
                          className={cn(
                            "w-full rounded px-1.5 py-1 text-left text-[11px] leading-4 text-amber-900 transition-colors hover:bg-amber-100/80",
                            highlightedAlertId === alert.id &&
                              "bg-amber-100 ring-1 ring-amber-300"
                          )}
                        >
                          <span className="font-medium text-amber-800">定位 → </span>
                          {alert.text}
                        </button>
                      ) : (
                        <p className="text-[11px] leading-4 text-amber-800">
                          {alert.text}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}

          {next ? (
            <div className="rounded-md border border-slate-200 bg-white px-2.5 py-2.5">
              <p className="text-[11px] font-medium text-slate-500">下一步</p>
              <p className="mt-1 text-xs leading-5 text-slate-700">
                {next.disabled && next.disabledReason
                  ? next.disabledReason
                  : `执行「${next.label}」继续当前步骤。`}
              </p>
              <div className="mt-2">
                {next.href && !next.disabled ? (
                  <Link href={next.href} className="block">
                    <Button className="w-full" size="md" variant="secondary">
                      {next.label}
                    </Button>
                  </Link>
                ) : next.action && onNextAction ? (
                  <Button
                    className="w-full"
                    size="md"
                    variant="secondary"
                    disabled={next.disabled}
                    onClick={() => onNextAction(next.action!)}
                  >
                    {next.label}
                  </Button>
                ) : (
                  <Button className="w-full" size="md" variant="secondary" disabled>
                    {next.label}
                  </Button>
                )}
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </aside>
  );
}
