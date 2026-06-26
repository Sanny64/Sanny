import type { ButtonHTMLAttributes } from "react";
import "../styles/button.css";

type Layout = "horizontal" | "vertical";

type ButtonGroupProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  layout?: Layout;
};

export function ButtonGroup({
  children,
  className = "",
  layout = "horizontal",
}: ButtonGroupProps) {
  return (
    <div className={`btn-group btn-group--${layout} ${className}`}>
      {children}
    </div>
  );
}
