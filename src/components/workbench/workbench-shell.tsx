import type { ReactNode } from "react";

interface WorkbenchShellProps {
  /** Left rail — typically <StepSidebar />. */
  sidebar: ReactNode;
  /** Center column — typically <WorkbenchPanel /> (owns its own header/scroll/footer). */
  children: ReactNode;
  /** Right rail — typically <AssistantRail />. Omit to hide the rail. */
  rail?: ReactNode;
}

/**
 * The stable three-column workbench frame (Step 3). Pure layout: fixed left/right rails around a
 * flexible center that owns its own scrolling (see {@link WorkbenchPanel}). Column widths come from
 * the layout tokens (--wb-sidebar-w / --wb-rail-w). This is the canonical shell the pages migrate to
 * in steps 4–6; {@code AppShell} is a thin backward-compatible adapter over it.
 */
export function WorkbenchShell({ sidebar, children, rail }: WorkbenchShellProps) {
  return (
    <div className="flex h-screen min-h-0 overflow-hidden bg-canvas text-ink">
      <div className="w-[var(--wb-sidebar-w)] shrink-0">{sidebar}</div>
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {children}
      </main>
      {rail ? (
        <div className="w-[var(--wb-rail-w)] shrink-0">{rail}</div>
      ) : null}
    </div>
  );
}
