import type { ReactNode, ReactElement } from 'react';
import { Children, isValidElement } from 'react';
import { cn } from '../../lib/utils';

interface StepProps {
	children: ReactNode;
	className?: string;
}

interface StepsProps {
	children: ReactNode;
	className?: string;
}

export function Step({ children, className }: StepProps) {
	return <div className={cn('relative pb-8 last:pb-0', className)}>{children}</div>;
}

export function Steps({ children, className }: StepsProps) {
	const steps = Children.toArray(children).filter(
		(child): child is ReactElement<StepProps> => isValidElement(child) && child.type === Step
	);

	return (
		<div className={cn('my-6', className)}>
			{steps.map((step, index) => (
				<div key={index} className="relative flex gap-4">
					{/* Vertical line */}
					{index < steps.length - 1 && (
						<div className="absolute left-[15px] top-8 bottom-0 w-px bg-zinc-200 dark:bg-zinc-800" />
					)}
					{/* Number circle */}
					<div className="relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full border-2 border-cyan-500 bg-white text-sm font-semibold text-cyan-600 dark:text-cyan-400 dark:bg-zinc-950">
						{index + 1}
					</div>
					{/* Content */}
					<div className="flex-1 pt-1">{step.props.children}</div>
				</div>
			))}
		</div>
	);
}
