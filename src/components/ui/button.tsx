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
          "bg-brand text-primary-foreground hover:bg-brand-hover active:bg-brand-hover",
        secondary:
          "border border-brand bg-surface text-brand hover:bg-surface-hover active:bg-muted-strong",
        ghost:
          // §3.2.2 Text Button / Link：文字 #3A40FF（link 色），无底色无边框。
          // 原用 text-muted-foreground（灰）对比度低且不符合规范，改为 text-link。
          "text-link hover:bg-surface-hover hover:text-link-hover active:bg-muted-strong",
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
    VariantProps<typeof buttonVariants> {
  /**
   * 仿 shadcn Slot 行为：当 asChild 为 true，把唯一子元素（如 <Link>）克隆出来、
   * 合并按钮样式与 ref，而不是渲染裸 <button>。用于「按钮外观的链接」避免 button>a 嵌套。
   */
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const classes = cn(buttonVariants({ variant, size }), className);
    if (asChild && React.isValidElement(props.children)) {
      const child = props.children as React.ReactElement<{ className?: string }>;
      const { children: _omit, ...rest } = props;
      return React.cloneElement(child, {
        ...rest,
        className: cn(classes, child.props.className),
        ref: ref as never,
      } as Record<string, unknown>);
    }
    return (
      <button
        ref={ref}
        className={classes}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { buttonVariants };
