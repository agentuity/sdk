import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';
import { cn } from '../../lib/utils';

const buttonVariants = cva(
	'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded text-sm font-medium ring-offset-background transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed aria-disabled:opacity-50 aria-disabled:cursor-not-allowed aria-disabled:pointer-events-none aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
	{
		variants: {
			variant: {
				default: 'bg-primary text-primary-foreground hover:bg-primary/90',
				destructive: 'bg-destructive text-destructive-foreground hover:opacity-80',
				// Primary CTA - subtle bg hover + cyan text accent
				outline: 'border border-zinc-300 dark:border-zinc-700 bg-transparent text-foreground hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:border-zinc-400 dark:hover:border-zinc-600 hover:text-cyan-600 dark:hover:text-cyan-400 disabled:hover:bg-transparent disabled:hover:text-foreground disabled:hover:border-zinc-300 dark:disabled:hover:border-zinc-700',
				// Neutral outline - subtle bg hover only (no accent)
				'outline-neutral': 'border border-zinc-300 dark:border-zinc-700 bg-transparent text-foreground hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:border-zinc-400 dark:hover:border-zinc-600 disabled:hover:bg-transparent disabled:hover:border-zinc-300 dark:disabled:hover:border-zinc-700',
				secondary: 'bg-secondary text-secondary-foreground hover:opacity-80',
				ghost: 'hover:bg-accent hover:text-accent-foreground',
				link: 'text-primary underline-offset-4 hover:underline',
				// Green pill for "Load Sample Data"
				success: 'border border-green-500 dark:border-green-600 text-green-600 dark:text-green-400 hover:bg-green-500/10 rounded-full',
				// Neutral toggle - muted at rest, visible lift on hover
				toggle: 'border border-zinc-300 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:border-zinc-400 dark:hover:border-zinc-700',
				// Selected toggle state - solid and prominent
				'toggle-active': 'border border-zinc-400 dark:border-zinc-600 bg-zinc-200 dark:bg-zinc-700 text-zinc-900 dark:text-white',
			},
			size: {
				default: 'h-10 px-4 py-2',
				sm: 'h-9 px-3',
				xs: 'h-8 px-2 text-xs',
				lg: 'h-11 px-8',
				icon: 'size-10',
				'icon-sm': 'size-8',
			},
		},
		defaultVariants: {
			variant: 'default',
			size: 'default',
		},
	}
);

export interface ButtonProps
	extends React.ButtonHTMLAttributes<HTMLButtonElement>,
		VariantProps<typeof buttonVariants> {
	asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
	({ className, variant, size, asChild = false, ...props }, ref) => {
		const Comp = asChild ? Slot : 'button';
		return (
			<Comp
				className={cn(buttonVariants({ variant, size, className }))}
				ref={ref}
				{...(props as any)}
			/>
		);
	}
);

Button.displayName = 'Button';

export { Button, buttonVariants };
