import * as React from "react";
import { cn } from "@/lib/utils";
import { controlClassName } from "@/lib/ui/control-styles";

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {}

/** Unified h-9 control — focus border #333, error uses destructive (spec §2.4.4) */
export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, "aria-invalid": ariaInvalid, ...props }, ref) => (
    <input
      type={type}
      ref={ref}
      aria-invalid={ariaInvalid}
      className={cn(controlClassName, className)}
      {...props}
    />
  )
);
Input.displayName = "Input";

export function FieldLabel({
  children,
  htmlFor,
  className,
}: {
  children: React.ReactNode;
  htmlFor?: string;
  className?: string;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className={cn("mb-1.5 block text-xs font-medium text-muted-foreground", className)}
    >
      {children}
    </label>
  );
}

export function FieldHint({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p className={cn("mt-1.5 text-[11px] leading-4 text-ink-subtle", className)}>
      {children}
    </p>
  );
}

export function FieldError({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p className={cn("mt-1.5 text-[11px] leading-4 text-destructive", className)}>
      {children}
    </p>
  );
}

export function Field({
  label,
  hint,
  error,
  className,
  children,
}: {
  label?: string;
  hint?: string;
  error?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      {label ? <FieldLabel>{label}</FieldLabel> : null}
      {children}
      {error ? <FieldError>{error}</FieldError> : null}
      {!error && hint ? <FieldHint>{hint}</FieldHint> : null}
    </div>
  );
}

export function CheckboxRow({
  checked,
  onChange,
  children,
  className,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label
      className={cn(
        "flex h-9 cursor-pointer items-center gap-2 rounded-[var(--radius-control)] border border-input bg-surface px-3 text-sm text-foreground",
        className
      )}
    >
      <input
        type="checkbox"
        className="h-3.5 w-3.5 shrink-0 accent-[var(--brand)]"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="truncate">{children}</span>
    </label>
  );
}
