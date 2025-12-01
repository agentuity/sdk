import React from 'react';
import { Settings } from 'lucide-react';
import Logo from './logo';
import { Button } from '../ui/button';
import { ThemeToggle } from '../ui/theme-toggle';

export interface HeaderProps {
	className?: string;
}

/**
 * Header component - navigation bar with logo, title, and settings
 * Must be used within WorkbenchProvider
 */
export function Header({ className }: HeaderProps) {
	const LogoComponent = Logo;
	const title = 'Workbench';
	const showSettings = true;

	return (
		<nav
			className={`flex items-center justify-between gap-6 py-2 px-4 border-b ${className || ''}`}
		>
			<div className="flex items-center gap-2.5">
				<LogoComponent />
				<h1 className="mt-0.5 text-sm">{title}</h1>
			</div>

			<div className="flex items-center gap-1">
				<ThemeToggle />
				{showSettings && (
					<Button size="icon" variant="ghost">
						<Settings />
					</Button>
				)}
			</div>
		</nav>
	);
}

export default Header;
