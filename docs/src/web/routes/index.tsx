import { createFileRoute } from '@tanstack/react-router';
import {
	Rocket,
	Download,
	Zap,
	Server,
	Play,
	BookOpen,
	Users,
	Code,
	Terminal,
	Package,
} from 'lucide-react';
import { Link } from '@tanstack/react-router';
import { Cards, CardLink } from '../components/docs/cards';
import { Alert, AlertTitle, AlertDescription } from '../components/ui';

export const Route = createFileRoute('/')({
	component: HomePage,
	staticData: { crumb: 'Home' },
});

function HomePage() {
	return (
		<div className="max-w-4xl mx-auto px-6 py-12">
			<h1 className="text-3xl font-semibold text-zinc-900 dark:text-zinc-100 mb-3">
				Agentuity Documentation
			</h1>
			<p className="text-lg text-zinc-600 dark:text-zinc-400 mb-4">
				<a
					href="https://agentuity.com"
					target="_blank"
					rel="noopener noreferrer"
					className="text-cyan-800 dark:text-cyan-400 hover:underline"
				>
					Agentuity
				</a>{' '}
				is the full-stack cloud platform built for AI agents, with built-in storage, databases,
				sandboxes, observability, and more.
			</p>
			<p className="text-lg text-zinc-600 dark:text-zinc-400 mb-10">
				Start with your framework, add Agentuity services, then deploy the app.
			</p>

			<Link to="/get-started/quickstart" className="block group mb-10">
				<Alert variant="tip" className="transition-colors hover:border-cyan-500/50">
					<Play className="size-4" />
					<AlertTitle className="group-hover:text-cyan-700 dark:group-hover:text-cyan-500 transition-colors">
						Start with the v3 quickstart
					</AlertTitle>
					<AlertDescription>
						Create a framework app, run it with `agentuity dev`, and validate the build before
						deploying.
					</AlertDescription>
				</Alert>
			</Link>

			<h2 className="text-lg font-normal text-zinc-600 dark:text-zinc-400 mb-2">
				New to Agentuity?
			</h2>
			<Cards>
				<CardLink
					href="/get-started/what-is-agentuity"
					title="What is Agentuity?"
					description="What Agentuity is and how it works"
					icon={<Rocket />}
				/>
				<CardLink
					href="/get-started/installation"
					title="Installation"
					description="Install the CLI and create your first project"
					icon={<Download />}
				/>
				<CardLink
					href="/get-started/quickstart"
					title="Quickstart"
					description="Create, run, and deploy a framework app"
					icon={<Zap />}
				/>
			</Cards>

			<h2 className="text-lg font-normal text-zinc-600 dark:text-zinc-400 mb-2">
				Start Building
			</h2>
			<Cards className="lg:grid-cols-2">
				<CardLink
					href="/frameworks"
					title="Frameworks"
					description="Start from Next.js, Nuxt, Hono, SvelteKit, Astro, or another app shape"
					icon={<Code />}
				/>
				<CardLink
					href="/services"
					title="Services"
					description="Persist data, send emails, run background jobs, and execute sandboxed code"
					icon={<Server />}
				/>
				<CardLink
					href="/deploy-operate"
					title="Build & Deploy"
					description="Run local development, build deployable output, and manage environment values"
					icon={<Terminal />}
				/>
				<CardLink
					href="/patterns"
					title="Patterns"
					description="Build model-backed workflows, streaming routes, and background work"
					icon={<BookOpen />}
				/>
			</Cards>

			<h2 className="text-lg font-normal text-zinc-600 dark:text-zinc-400 mb-2">
				Explore Further
			</h2>
			<Cards className="lg:grid-cols-2">
				<CardLink
					href="/migration"
					title="Migration"
					description="Move older runtime apps toward the v3 framework model"
					icon={<BookOpen />}
				/>
				<CardLink
					href="/community"
					title="Community"
					description="Open-source examples and third-party integrations"
					icon={<Users />}
				/>
			</Cards>

			<h2 className="text-lg font-normal text-zinc-600 dark:text-zinc-400 mb-2">
				Find What You Need
			</h2>
			<Cards>
				<CardLink
					href="/reference/sdk-reference"
					title="SDK Reference"
					description="Compatibility reference for older runtime APIs"
					icon={<Code />}
				/>
				<CardLink
					href="/reference/cli"
					title="CLI Reference"
					description="Commands for dev, deploy, cloud storage, and sandbox management"
					icon={<Terminal />}
				/>
				<CardLink
					href="/reference/standalone-packages"
					title="Standalone Packages"
					description="Use Agentuity packages outside the runtime"
					icon={<Package />}
				/>
			</Cards>
		</div>
	);
}
