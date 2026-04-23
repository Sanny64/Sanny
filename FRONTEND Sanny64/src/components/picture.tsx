import { Link } from 'react-router-dom';

type PictureProps = {
	src: string;
	alt: string;
	width?: number | string;
	height?: number | string;
	className?: string;
	imageClassName?: string;
	ariaLabel?: string;
	role?: string;
	href?: string;
	onClick?: () => void;
	blur?: boolean;
};

export default function Picture({
	src,
	alt,
	width,
	height,
	className = '',
	imageClassName = '',
	ariaLabel,
	role,
	href,
	onClick,
	blur = false
}: PictureProps) {
	const image = (
		<img
			src={src}
			alt={alt}
			width={width}
			height={height}
			className={`picture ${blur ? 'picture-blur' : ''} ${imageClassName}`.trim()}
		/>
	);

	if (href) {
		return (
			<Link to={href} role={role} aria-label={ariaLabel} onClick={onClick} className={className}>
				{image}
			</Link>
		);
	}

	return (
		<div className={className} aria-label={ariaLabel}>
			{image}
		</div>
	);
}
