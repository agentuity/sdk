interface KeyboardShortcutProps {
	readonly className?: string;
}

export function SearchKeyboardShortcut({ className }: KeyboardShortcutProps) {
	return (
		<kbd
			className={
				className ??
				'pointer-events-none inline-flex h-5 w-14 select-none items-center justify-center gap-1 rounded border border-sidebar-border bg-sidebar px-1.5 font-mono text-xs font-medium text-sidebar-foreground/70'
			}
		>
			<span className="shortcut-modifier-meta text-sm">⌘</span>
			<span className="shortcut-modifier-ctrl">Ctrl</span>
			<span>K</span>
		</kbd>
	);
}
