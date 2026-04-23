import type { ButtonHTMLAttributes, ReactNode } from 'react';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
	children?: ReactNode;
	icon?: ReactNode;
	iconPosition?: 'left' | 'right';
	description?: ReactNode;
	descriptionClassName?: string;
};

export default function Button({
	children,
	icon,
	iconPosition = 'left',
	description,
	descriptionClassName = '',
	type = 'button',
	className = '',
	...props
}: ButtonProps) {
	return (
		<button type={type} className={className} {...props}>
			{icon && iconPosition === 'left' && icon}
			{description && <span className={descriptionClassName}>{description}</span>}
			{children}
			{icon && iconPosition === 'right' && icon}
		</button>
	);
}
