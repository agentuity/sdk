import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui';
import { DEMOS, type DemoId } from '../demo-config';

export const Route = createFileRoute('/')({
	component: LandingPage,
	staticData: { crumb: 'SDK Explorer' },
});

function DemoCard({ demo, onClick }: { demo: (typeof DEMOS)[number]; onClick: () => void }) {
	return (
		<button
			type="button"
			onClick={onClick}
			className="group text-left cursor-pointer w-full focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-lg"
		>
			<Card className="h-full flex flex-col transition-all hover:border-zinc-400 dark:hover:border-zinc-600 hover:bg-zinc-50/50 dark:hover:bg-zinc-900/50">
				<CardHeader>
					<CardTitle className="text-base">{demo.title}</CardTitle>
					<p className="text-cyan-600 dark:text-cyan-400 text-xs">{demo.subtitle}</p>
				</CardHeader>
				<CardContent className="flex-1">
					<p className="text-zinc-600 dark:text-zinc-400 text-sm leading-relaxed">
						{demo.description}
					</p>
				</CardContent>
			</Card>
		</button>
	);
}

function LandingPage() {
	const navigate = useNavigate();

	const handleSelectDemo = (id: DemoId) => {
		void navigate({ to: `/demo/${id}` });
	};

	const basics = DEMOS.filter((d) => d.category === 'basics');
	const services = DEMOS.filter((d) => d.category === 'services');
	const ioPatterns = DEMOS.filter((d) => d.category === 'io-patterns');
	const examples = DEMOS.filter((d) => d.category === 'examples');

	return (
		<div className="max-w-6xl mx-auto px-6 py-12">
			{/* Basics Section */}
			<section className="mb-12">
				<h2 className="text-lg font-normal text-zinc-600 dark:text-zinc-400 mb-6">Basics</h2>
				<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
					{basics.map((demo) => (
						<DemoCard key={demo.id} demo={demo} onClick={() => handleSelectDemo(demo.id)} />
					))}
				</div>
			</section>

			{/* Services Section */}
			<section className="mb-12">
				<h2 className="text-lg font-normal text-zinc-600 dark:text-zinc-400 mb-6">Services</h2>
				<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
					{services.map((demo) => (
						<DemoCard key={demo.id} demo={demo} onClick={() => handleSelectDemo(demo.id)} />
					))}
				</div>
			</section>

			{/* I/O Patterns Section */}
			<section className="mb-12">
				<h2 className="text-lg font-normal text-zinc-600 dark:text-zinc-400 mb-6">
					I/O Patterns
				</h2>
				<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
					{ioPatterns.map((demo) => (
						<DemoCard key={demo.id} demo={demo} onClick={() => handleSelectDemo(demo.id)} />
					))}
				</div>
			</section>

			{/* Examples Section */}
			<section className="mb-12">
				<h2 className="text-lg font-normal text-zinc-600 dark:text-zinc-400 mb-6">Examples</h2>
				<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
					{examples.map((demo) => (
						<DemoCard key={demo.id} demo={demo} onClick={() => handleSelectDemo(demo.id)} />
					))}
				</div>
			</section>
		</div>
	);
}
