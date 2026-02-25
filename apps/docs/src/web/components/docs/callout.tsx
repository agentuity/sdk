import type { ReactNode } from 'react';
import { Info, AlertTriangle, Lightbulb, AlertCircle, CheckCircle } from 'lucide-react';
import { Alert, AlertTitle, AlertDescription } from '../ui';
import { cn } from '../../lib/utils';

type CalloutType = 'info' | 'warning' | 'tip' | 'error' | 'success';

interface CalloutProps {
	type?: CalloutType;
	title?: string;
	children: ReactNode;
	className?: string;
}

const iconMap: Record<CalloutType, typeof Info> = {
	info: Info,
	warning: AlertTriangle,
	tip: Lightbulb,
	error: AlertCircle,
	success: CheckCircle,
};

const variantMap: Record<CalloutType, 'info' | 'warning' | 'tip' | 'destructive' | 'default'> = {
	info: 'info',
	warning: 'warning',
	tip: 'tip',
	error: 'destructive',
	success: 'tip',
};

export function Callout({ type = 'info', title, children, className }: CalloutProps) {
	const Icon = iconMap[type];
	const variant = variantMap[type];

	return (
		<Alert variant={variant} className={cn('my-4', className)}>
			<Icon className="size-4" />
			{title && <AlertTitle>{title}</AlertTitle>}
			<AlertDescription>{children}</AlertDescription>
		</Alert>
	);
}
