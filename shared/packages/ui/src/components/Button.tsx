import type { ButtonHTMLAttributes } from "react";
import "../styles/button.css";

type Variant = "primary" | "secondary" | "destructive" | "ghost";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
};

export function Button({
  children,
  className = "",
  variant = "primary",
  ...props
}: ButtonProps) {
  return variant === "ghost" ? null : (
    <button className={`btn btn--${variant} ${className}`} {...props}>
      {children}
    </button>
  );
}
