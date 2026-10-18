import { forwardRef } from "react";
import type { InputHTMLAttributes } from "react";

export interface CheckboxProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: React.ReactNode;
  error?: string;
  containerClassName?: string;
  labelClassName?: string;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  (
    {
      label,
      error,
      containerClassName = "",
      labelClassName = "",
      className = "",
      ...props
    },
    ref,
  ) => {
    return (
      <div className={`checkbox-container ${containerClassName}`.trim()}>
        <label className={`checkbox-label ${labelClassName}`.trim()}>
          <input
            ref={ref}
            type="checkbox"
            className={`checkbox-input ${className}`.trim()}
            {...props}
          />
          {label && <span className="checkbox-text">{label}</span>}
        </label>
        {error && <p className="checkbox-error">{error}</p>}
      </div>
    );
  },
);

Checkbox.displayName = "Checkbox";
