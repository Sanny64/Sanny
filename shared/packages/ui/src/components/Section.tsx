import type { ComponentPropsWithoutRef } from "react";
import "../styles/section.css";

type Variant = "primary" | "secondary" | "ghost";

type SectionProps = ComponentPropsWithoutRef<"section"> & {
  variant?: Variant;

};

export function Section({
  children,
  className = "",
  variant = "ghost",
  ...props
}: SectionProps) {
  return (
      <section
        className={`sct sct--${variant} ${className}`}
        {...props}
      >
        {variant === "ghost" ? null : children}
      </section>
    );
  }