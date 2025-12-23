import React from 'react';
import { Settings } from 'lucide-react';
import Logo from './logo';
import { Button } from '../ui/button';
import { ThemeToggle } from '../ui/theme-toggle';
import { useWorkbench } from './WorkbenchProvider';
import type { ConnectionStatus } from '../../types/config';

export interface HeaderProps {
	className?: string;
}

export function StatusIndicator({ status }: { status: ConnectionStatus }) {
	if (status === 'connected') {
		return (
			<div className="flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400">
				<div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
				<span>Connected</span>
			</div>
		);
	}

	if (status === 'restarting') {
		return (
			<div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
				<div className="w-2 h-2 rounded-full bg-amber-500 animate-spin"></div>
				<span>Restarting...</span>
			</div>
		);
	}

	if (status === 'disconnected') {
		return (
			<div className="flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400">
				<div className="w-2 h-2 rounded-full bg-red-500"></div>
				<span>Disconnected</span>
			</div>
		);
	}

	return null;
}

/**
 * Header component - navigation bar with logo, title, and settings
 * Must be used within WorkbenchProvider
 */
export function Header({ className }: HeaderProps) {
	const { connectionStatus } = useWorkbench();
	const LogoComponent = Logo;
	const title = 'Bobby test 1';
	const showSettings = true;

	return (
		<nav
			className={`flex items-center justify-between gap-6 py-2 px-4 border-b ${className || ''}`}
		>
			<div className="flex items-center gap-2.5">
				<LogoComponent />
				<h1 className="mt-0.5 text-sm">{title}</h1>
			</div>
			<div className="flex items-center gap-3">
				<StatusIndicator status={connectionStatus} />
				<div className="flex items-center gap-1">
					<ThemeToggle />
					{showSettings && (
						<Button size="icon" variant="ghost">
							<Settings />
						</Button>
					)}
				</div>
			</div>
		</nav>
	);
}

export default Header;
