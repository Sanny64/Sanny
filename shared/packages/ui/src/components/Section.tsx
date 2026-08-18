import type { ComponentPropsWithoutRef } from "react";
import "../styles/section.css";

type Variant = "primary" | "secondary" | "ghost";

type SectionProps = ComponentPropsWithoutRef<"section"> & {
  variant?: Variant;
};

export function Section({
  children,
  className = "",
  variant = "primary",
  ...props
}: SectionProps) {
  return (
    variant === "ghost" ? null : ( 
      <button className={`sct sct--${variant} ${className}`} {...props}>
        {children}
      </button>
  ))
}
