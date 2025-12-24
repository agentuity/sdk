import { Settings } from "lucide-react";
import { cn } from "../../lib/utils";
import type { ConnectionStatus } from "../../types/config";
import { Button } from "../ui/button";
import { ThemeToggle } from "../ui/theme-toggle";
import Logo from "./logo";
import { useWorkbench } from "./WorkbenchProvider";

export interface HeaderProps {
	className?: string;
	title?: string;
	showSettings?: boolean;
}

export function Header({
	className,
	title = "Workbench",
	showSettings = true,
}: HeaderProps) {
	const { connectionStatus } = useWorkbench();
	const LogoComponent = Logo;

	return (
		<nav
			className={cn(
				"flex items-center justify-between gap-6 py-2 px-4 border-b",
				className,
			)}
		>
			<div className="flex items-center gap-2.5">
				<LogoComponent />

				<h1 className="text-sm">{title}</h1>
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

export function StatusIndicator({ status }: { status: ConnectionStatus }) {
	if (status === "connected") {
		return (
			<div className="flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400">
				<div className="size-2 rounded-full bg-green-500 animate-pulse"></div>
				<span>Connected</span>
			</div>
		);
	}

	if (status === "restarting") {
		return (
			<div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
				<div className="size-2 rounded-full bg-amber-500 animate-pulse"></div>
				<span>Restarting...</span>
			</div>
		);
	}

	if (status === "disconnected") {
		return (
			<div className="flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400">
				<div className="size-2 rounded-full bg-red-500"></div>
				<span>Disconnected</span>
			</div>
		);
	}

	return null;
}

export default Header;
