import * as React from 'react';

interface KeyboardShortcutProps {
	readonly className?: string;
}

function getShortcutModifier(): string {
	if (typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.userAgent)) {
		return '⌘';
	}

	return 'Ctrl';
}

export function SearchKeyboardShortcut({ className }: KeyboardShortcutProps) {
	const [modifier, setModifier] = React.useState('Ctrl');

	React.useEffect(() => {
		setModifier(getShortcutModifier());
	}, []);

	return (
		<kbd
			className={
				className ??
				'pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border border-sidebar-border bg-sidebar px-1.5 font-mono text-xs font-medium text-sidebar-foreground/70'
			}
		>
			<span className={modifier === '⌘' ? 'text-sm' : undefined}>{modifier}</span>
			<span>K</span>
		</kbd>
	);
}
