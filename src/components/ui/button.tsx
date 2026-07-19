import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * 按钮规范：
 * - md：页面主/次按钮，统一 h-9 / text-sm / font-medium
 * - sm：表格行内，统一 h-7 / text-xs（优先用 RowAction）
 */
const buttonVariants = cva(
  "inline-flex cursor-pointer select-none touch-manipulation items-center justify-center gap-1.5 whitespace-nowrap rounded-[var(--radius-control)] font-medium transition-[transform,background-color,border-color,color,box-shadow] duration-100 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 disabled:active:scale-100",
  {
    variants: {
      variant: {
        primary: "bg-brand text-white hover:bg-brand-strong active:bg-brand-strong",
        secondary:
          "bg-surface text-slate-700 border border-hairline hover:bg-slate-50 active:bg-slate-100",
        ghost:
          "text-slate-600 hover:bg-slate-100 hover:text-slate-900 active:bg-slate-200",
        danger: "bg-red-600 text-white hover:bg-red-700 active:bg-red-800",
        link: "text-brand underline-offset-4 hover:underline h-auto px-0 active:scale-100",
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
