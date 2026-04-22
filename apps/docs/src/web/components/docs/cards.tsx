import type { ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { ExternalLink } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardAction } from '../ui';
import { cn } from '../../lib/utils';

interface CardLinkProps {
	href: string;
	title: string;
	subtitle?: string;
	description?: ReactNode;
	icon?: ReactNode;
	className?: string;
	align?: 'natural' | 'locked';
}

interface ExternalCardProps {
	href: string;
	title: string;
	description?: ReactNode;
	children?: ReactNode;
	icon?: ReactNode;
	className?: string;
	align?: 'natural' | 'locked';
}

interface CardsProps {
	children: ReactNode;
	className?: string;
}

/**
 * A card that links to another page - for use in index pages
 */
export function CardLink({
	href,
	title,
	subtitle,
	description,
	icon,
	className,
	align = 'natural',
}: CardLinkProps) {
	const titleClassName = cn(
		'text-base group-hover:text-cyan-800 dark:group-hover:text-cyan-500 transition-colors',
		align === 'locked' && 'line-clamp-2 leading-6 min-h-12'
	);
	const descriptionClassName = 'text-sm mt-1 [&_p]:m-0 [&_p]:text-inherit [&_p]:leading-6';

	return (
		<Link to={href} className="block group">
			<Card
				className={cn(
					'h-full transition-colors hover:border-cyan-500/50 hover:bg-zinc-50 dark:hover:bg-zinc-900/50',
					className
				)}
			>
				<CardHeader>
					{align === 'locked' && (
						<CardAction aria-hidden="true" className="pointer-events-none opacity-0">
							<ExternalLink className="size-4" />
						</CardAction>
					)}
					{icon && (
						<div className="mb-2 text-cyan-800 dark:text-cyan-400 [&>svg]:size-5 [&>img]:size-7 [&>picture>img]:size-7">
							{icon}
						</div>
					)}
					<CardTitle className={titleClassName}>{title}</CardTitle>
					{subtitle && (
						<p className="text-cyan-800 dark:text-cyan-400 text-xs mt-0.5">{subtitle}</p>
					)}
					{description && (
						<CardDescription className={descriptionClassName}>{description}</CardDescription>
					)}
				</CardHeader>
			</Card>
		</Link>
	);
}

/**
 * A card that links to an external URL - for community examples, external resources
 */
export function ExternalCard({
	href,
	title,
	description,
	children,
	icon,
	className,
	align = 'natural',
}: ExternalCardProps) {
	const titleClassName = cn(
		'text-base group-hover:text-cyan-800 dark:group-hover:text-cyan-500 transition-colors',
		align === 'locked' && 'line-clamp-2 leading-6 min-h-12'
	);
	const descriptionClassName = 'text-sm mt-1 [&_p]:m-0 [&_p]:text-inherit [&_p]:leading-6';
	const descriptionContent = description ?? children;

	return (
		<a href={href} target="_blank" rel="noopener noreferrer" className="block group">
			<Card
				className={cn(
					'h-full transition-colors hover:border-cyan-500/50 hover:bg-zinc-50 dark:hover:bg-zinc-900/50',
					className
				)}
			>
				<CardHeader>
					<CardAction>
						<ExternalLink className="size-4 text-zinc-400 group-hover:text-cyan-800 dark:group-hover:text-cyan-500 transition-colors" />
					</CardAction>
					{icon && (
						<div className="mb-2 text-cyan-800 dark:text-cyan-400 [&>svg]:size-5 [&>img]:size-7 [&>picture>img]:size-7">
							{icon}
						</div>
					)}
					<CardTitle className={titleClassName}>{title}</CardTitle>
					{descriptionContent && (
						<CardDescription className={descriptionClassName}>
							{descriptionContent}
						</CardDescription>
					)}
				</CardHeader>
			</Card>
		</a>
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
