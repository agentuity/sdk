interface PlaceholderPageProps {
	title: string;
	description?: string;
}

export function PlaceholderPage({ title, description }: PlaceholderPageProps) {
	return (
		<div>
			<h1>{title}</h1>
			{description && <p className="lead">{description}</p>}
			<div className="not-prose mt-8 rounded-lg border border-dashed border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 p-8 text-center">
				<p className="text-zinc-500 dark:text-zinc-400">
					This page is coming soon. Check back later for the full documentation.
				</p>
			</div>
		</div>
	);
}
