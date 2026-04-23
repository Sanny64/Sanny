import type { ElementType, ReactNode } from 'react';

type CardProps = {
	icon?: ReactNode;
	title?: string;
	description?: string;
	children: ReactNode;
	as?: ElementType;
	className?: string;
};

export default function Card({
	icon,
	title,
	description,
	children,
	as: Component = 'section',
	className = ''
}: CardProps) {
	const hasHeader = Boolean(icon || title || description);

	return (
		<Component className={`card ${className}`.trim()}>
			{hasHeader && (
				<div className="card-header">
					{icon && <div className="card-header-icon">{icon}</div>}
					<div>
						{title && <h2 className="card-title">{title}</h2>}
						{description && <p className="card-description">{description}</p>}
					</div>
				</div>
			)}

			{children}
		</Component>
	);
}
