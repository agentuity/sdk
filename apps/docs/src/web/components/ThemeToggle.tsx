import { ComputerDesktopIcon, MoonIcon, SunIcon } from '@heroicons/react/24/outline';
import { useEffect, useRef, useState } from 'react';
import { useTheme } from './ThemeContext';

type Theme = 'light' | 'dark' | 'system';

const THEME_OPTIONS: { value: Theme; label: string; Icon: typeof SunIcon }[] = [
	{ value: 'light', label: 'Light', Icon: SunIcon },
	{ value: 'dark', label: 'Dark', Icon: MoonIcon },
	{ value: 'system', label: 'System', Icon: ComputerDesktopIcon },
];

export function ThemeToggle() {
	const { theme, setTheme } = useTheme();
	const [isOpen, setIsOpen] = useState(false);
	const dropdownRef = useRef<HTMLDivElement>(null);

	// Close dropdown when clicking outside
	useEffect(() => {
		function handleClickOutside(event: MouseEvent) {
			if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
				setIsOpen(false);
			}
		}
		document.addEventListener('mousedown', handleClickOutside);
		return () => document.removeEventListener('mousedown', handleClickOutside);
	}, []);

	// Close dropdown on Escape key
	useEffect(() => {
		function handleEscape(event: KeyboardEvent) {
			if (event.key === 'Escape') setIsOpen(false);
		}
		document.addEventListener('keydown', handleEscape);
		return () => document.removeEventListener('keydown', handleEscape);
	}, []);

	const currentOption = THEME_OPTIONS.find((opt) => opt.value === theme);
	const CurrentIcon = currentOption?.Icon ?? SunIcon;

	return (
		<div ref={dropdownRef} className="relative">
			<button
				type="button"
				onClick={() => setIsOpen(!isOpen)}
				className="p-2 rounded-md text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
				aria-label="Select theme"
				aria-expanded={isOpen}
				aria-haspopup="listbox"
			>
				<CurrentIcon className="w-5 h-5" />
			</button>

			{isOpen && (
				<div
					role="listbox"
					aria-label="Theme options"
					className="absolute right-0 mt-2 w-36 rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-lg z-50"
				>
					{THEME_OPTIONS.map((option) => {
						const isSelected = theme === option.value;
						return (
							<button
								key={option.value}
								type="button"
								role="option"
								aria-selected={isSelected}
								onClick={() => {
									setTheme(option.value);
									setIsOpen(false);
								}}
								className={`w-full flex items-center gap-2 px-3 py-2 text-sm cursor-pointer transition-colors
									first:rounded-t-md last:rounded-b-md
									${
										isSelected
											? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-white'
											: 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 hover:text-zinc-900 dark:hover:text-white'
									}`}
							>
								<option.Icon className="w-4 h-4" />
								<span>{option.label}</span>
							</button>
						);
					})}
				</div>
			)}
		</div>
	);
}
