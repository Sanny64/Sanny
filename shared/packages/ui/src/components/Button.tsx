import type { ButtonHTMLAttributes } from "react";
import "../styles/button.css";

type Variant = "primary" | "secondary" | "ghost";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
};

export function Button({
  children,
  className = "",
  variant = "ghost",
  ...props
}: ButtonProps) {
  return (
    <button className={`btn btn--${variant} ${className}`} {...props}>
      {variant === "ghost" ? null : children}
    </button>
  );
}
