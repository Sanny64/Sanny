import { motion, useReducedMotion, type HTMLMotionProps } from "framer-motion";
import "../styles/button.css";

type Variant = "primary" | "secondary" | "destructive";

type ButtonProps = HTMLMotionProps<"button"> & {
  variant?: Variant;
};

export function Button({
  children,
  className = "",
  variant = "primary",
  ...props
}: ButtonProps) {
  const reducedMotion = useReducedMotion();

  return (
    <motion.button
      className={`btn btn--${variant} ${className}`}
      whileTap={
        reducedMotion || props.disabled
          ? undefined
          : {
              scale: 0.98,
            }
      }
      whileHover={
        reducedMotion || props.disabled
          ? undefined
          : {
              scale: 1.05,
              transition: {
                duration: 0.16,
                ease: "easeOut",
              },
            }
      }
      {...props}
    >
      {children}
    </motion.button>
  );
}
