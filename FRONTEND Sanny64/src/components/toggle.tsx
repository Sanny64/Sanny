import { Check } from 'lucide-react';
import type { ReactNode } from 'react';

type ToggleOptionProps = {
	label: string;
	sublabel?: string;
	active: boolean;
	onToggle: () => void;
	ariaLabel: string;
	icon?: ReactNode;
	showCheck?: boolean;
	className?: string;
};

export default function ToggleOption({
	label,
	sublabel,
	active,
	onToggle,
	ariaLabel,
	icon,
	showCheck = true,
	className = ''
}: ToggleOptionProps) {
	return (
		<button
			onClick={onToggle}
			className={`toggle ${active ? 'toggle-active' : ''} ${className}`.trim()}
			aria-label={ariaLabel}
			aria-pressed={active}
			type="button"
		>
			<div className="toggle-content">
				{icon && <div className="toggle-icon">{icon}</div>}
				<div className="toggle-text">
					<span className="toggle-label">{label}</span>
					{sublabel && <span className="toggle-sublabel">{sublabel}</span>}
				</div>
			</div>
			{showCheck && active && <Check size={20} className="toggle-check" />}
		</button>
	);
}
