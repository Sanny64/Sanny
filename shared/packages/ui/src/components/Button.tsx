import { motion, useReducedMotion, type HTMLMotionProps } from 'framer-motion';
import { Link, type LinkProps } from 'react-router-dom';
import '../css/button.css';

type Variant = 'primary' | 'secondary' | 'destructive';

type NativeButtonProps = HTMLMotionProps<'button'> & {
  variant?: Variant;
  to?: never;
};

type RouterLinkButtonProps = Omit<HTMLMotionProps<'a'>, 'href'> &
  LinkProps & {
    variant?: Variant;
  };

type ButtonProps = NativeButtonProps | RouterLinkButtonProps;

const MotionLink = motion.create(Link);

export function Button(props: ButtonProps) {
  const reducedMotion = useReducedMotion();
  const isDisabled = 'disabled' in props && props.disabled;
  const motionProps =
    reducedMotion || isDisabled
      ? {}
      : {
          whileTap: { scale: 0.98 },
          whileHover: {
            scale: 1.05,
            transition: {
              duration: 0.16,
              ease: 'easeOut' as const,
            },
          },
        };

  if (props.to !== undefined) {
    const { to, variant = 'primary', className = '', ...linkProps } = props;
    return (
      <MotionLink
        className={`btn btn--${variant} ${className}`}
        to={to}
        {...motionProps}
        {...linkProps}
      />
    );
  }

  const { variant = 'primary', className = '', ...buttonProps } = props;
  return (
    <motion.button
      className={`btn btn--${variant} ${className}`}
      {...motionProps}
      {...buttonProps}
    />
  );
}
