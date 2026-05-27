import { createFileRoute } from '@tanstack/react-router';
import { Cards, CardLink } from '../../components/docs/cards';
import { DEMOS, type DemoConfig } from '../../demo-config';

const categories = [...new Set(DEMOS.map((d) => d.category))];

const categoryLabels: Record<DemoConfig['category'], string> = {
	'app-basics': 'App basics',
	services: 'Services',
	'streaming-realtime': 'Streaming and realtime',
	agents: 'Agents',
};

export const Route = createFileRoute('/explorer/')({
	component: ExplorerPage,
	staticData: { crumb: 'SDK Explorer' },
});

function ExplorerPage() {
	return (
		<div className="max-w-6xl mx-auto px-6 py-12">
			<div className="max-w-3xl mb-10">
				<h1 className="text-3xl font-semibold text-zinc-900 dark:text-zinc-100 mb-3">
					SDK Explorer
				</h1>
				<p className="text-lg text-zinc-600 dark:text-zinc-400">
					Explore live Agentuity demos without creating a project. Examples use Hono because
					route and service boundaries are easy to see; the same patterns apply in framework
					routes such as Next.js route handlers, SvelteKit <code>+server.ts</code>, and
					TanStack Start server routes.
				</p>
			</div>
			{categories.map((category) => {
				const demos = DEMOS.filter((d) => d.category === category);
				if (demos.length === 0) return null;
				return (
					<section key={category} className="mb-10">
						<h2 className="text-lg font-normal text-zinc-600 dark:text-zinc-400 mb-2">
							{categoryLabels[category] ?? category}
						</h2>
						<Cards>
							{demos.map((demo) => (
								<CardLink
									key={demo.id}
									href={`/explorer/${demo.id}`}
									title={demo.title}
									subtitle={demo.subtitle}
									description={demo.description}
								/>
							))}
						</Cards>
					</section>
				);
			})}
		</div>
	);
}
