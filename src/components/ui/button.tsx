import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * Buttons — spec §3.2.2
 * - md：页面主/次按钮，统一 h-9 / text-sm / font-medium
 * - sm：表格行内，统一 h-7 / text-xs（优先用 RowAction）
 */
const buttonVariants = cva(
  "inline-flex cursor-pointer select-none touch-manipulation items-center justify-center gap-1.5 whitespace-nowrap rounded-[var(--radius-control)] font-medium transition-[transform,background-color,border-color,color,box-shadow] duration-100 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 disabled:active:scale-100",
  {
    variants: {
      variant: {
        primary:
          "bg-brand text-brand-foreground hover:bg-brand-hover active:bg-brand-hover",
        secondary:
          "border border-brand bg-surface text-brand hover:bg-surface-hover active:bg-muted-strong",
        ghost:
          "text-muted-foreground hover:bg-surface-hover hover:text-foreground active:bg-muted-strong",
        danger:
          "bg-destructive text-primary-foreground hover:brightness-95 active:brightness-90",
        link: "h-auto px-0 text-link underline-offset-4 hover:text-link-hover hover:underline active:scale-100",
      },
      size: {
        md: "h-9 px-3.5 text-sm",
        sm: "h-7 px-2 text-xs",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  )
);
Button.displayName = "Button";

export { buttonVariants };
