import type { ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { Card, CardHeader, CardTitle, CardDescription } from '../ui';
import { cn } from '../../lib/utils';

interface CardLinkProps {
	href: string;
	title: string;
	description?: string;
	icon?: ReactNode;
	className?: string;
}

interface CardsProps {
	children: ReactNode;
	className?: string;
}

/**
 * A card that links to another page - for use in index pages
 */
export function CardLink({ href, title, description, icon, className }: CardLinkProps) {
	return (
		<Link to={href} className="block group">
			<Card
				className={cn(
					'h-full transition-colors hover:border-cyan-500/50 hover:bg-zinc-50 dark:hover:bg-zinc-900/50',
					className
				)}
			>
				<CardHeader>
					{icon && (
						<div className="mb-2 text-cyan-600 dark:text-cyan-400 [&>svg]:size-5">{icon}</div>
					)}
					<CardTitle className="text-base group-hover:text-cyan-500 transition-colors">
						{title}
					</CardTitle>
					{description && (
						<CardDescription className="text-sm">{description}</CardDescription>
					)}
				</CardHeader>
			</Card>
		</Link>
	);
}

/**
 * Grid container for CardLink components on section index pages
 */
export function Cards({ children, className }: CardsProps) {
	return (
		<div className={cn('grid gap-4 sm:grid-cols-2 lg:grid-cols-3 my-6', className)}>
			{children}
		</div>
	);
}
