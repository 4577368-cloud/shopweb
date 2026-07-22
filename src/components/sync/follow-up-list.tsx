"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import type { FollowUpItem } from "@/lib/sync/launch-summary";
import { cn } from "@/lib/utils";

export function FollowUpList({ items }: { items: FollowUpItem[] }) {
  const [open, setOpen] = useState(false);

  if (items.length === 0) return null;

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.25 }}
      className="rounded-xl border border-amber-200/80 bg-amber-50/60"
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
        aria-expanded={open}
      >
        <p className="text-xs font-semibold text-amber-950">
          待关注事项 ({items.length})
        </p>
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 shrink-0 text-amber-800 transition-transform",
            open && "rotate-180"
          )}
        />
      </button>

      <AnimatePresence initial={false}>
        {open ? (
          <motion.ul
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-t border-amber-200/60"
          >
            {items.map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between gap-2 border-b border-amber-200/40 px-3 py-2 last:border-b-0"
              >
                <p className="min-w-0 truncate text-[11px] text-amber-950">
                  <span className="mr-1.5 font-semibold tabular-nums">{item.count}</span>
                  {item.title}
                </p>
                <Link
                  href={item.href}
                  className="shrink-0 text-[11px] font-medium text-amber-900 hover:underline"
                >
                  {item.actionLabel}
                </Link>
              </li>
            ))}
          </motion.ul>
        ) : null}
      </AnimatePresence>
    </motion.section>
  );
}
