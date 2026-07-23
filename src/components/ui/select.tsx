import * as React from "react";
import { cn } from "@/lib/utils";
import { controlClassName } from "@/lib/ui/control-styles";

export interface SelectProps
  extends React.SelectHTMLAttributes<HTMLSelectElement> {}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, children, "aria-invalid": ariaInvalid, ...props }, ref) => (
    <select
      ref={ref}
      aria-invalid={ariaInvalid}
      className={cn(controlClassName, className)}
      {...props}
    >
      {children}
    </select>
  )
);
Select.displayName = "Select";
