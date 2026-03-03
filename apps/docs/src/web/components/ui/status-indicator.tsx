import * as React from 'react';
import { cn } from '../../lib/utils.ts';

type Status = 'idle' | 'pending' | 'running' | 'success' | 'error';

interface StatusIndicatorProps {
	status: Status;
	label?: string;
	showLabel?: boolean;
	className?: string;
}

const statusConfig: Record<Status, { dot: string; label: string }> = {
	idle: { dot: 'bg-white/40', label: 'Ready' },
	pending: { dot: 'bg-yellow-400 animate-pulse', label: 'Pending' },
	running: { dot: 'bg-cyan-500 animate-pulse', label: 'Running' },
	success: { dot: 'bg-green-400', label: 'Complete' },
	error: { dot: 'bg-red-400', label: 'Error' },
};

function StatusIndicator({ status, label, showLabel = true, className }: StatusIndicatorProps) {
	const config = statusConfig[status];
	const displayLabel = label ?? config.label;

	return (
		<span
			className={cn('inline-flex items-center gap-2', className)}
			role="status"
			aria-label={showLabel ? undefined : displayLabel}
		>
			<span className={cn('h-2 w-2 rounded-full', config.dot)} aria-hidden="true" />
			{showLabel && <span className="text-sm text-muted-foreground">{displayLabel}</span>}
		</span>
	);
}

export { StatusIndicator, type Status, type StatusIndicatorProps };
