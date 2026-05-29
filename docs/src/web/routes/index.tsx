import { createFileRoute } from '@tanstack/react-router';
import {
	Rocket,
	Download,
	Zap,
	Server,
	Play,
	BookOpen,
	Code,
	Terminal,
	Package,
	Bot,
	Globe,
	Layers,
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
				is the cloud platform for deploying apps, APIs, static sites, background work, and
				agents. Keep your framework conventions and add built-in, agent-native services where
				they help.
			</p>
			<p className="text-lg text-zinc-600 dark:text-zinc-400 mb-10">
				Start with a guide, explore interactive demos, or dive into the reference docs.
			</p>

			<Link to="/explorer" className="block group mb-10">
				<Alert variant="tip" className="transition-colors hover:border-cyan-500/50">
					<Play className="size-4" />
					<AlertTitle className="group-hover:text-cyan-700 dark:group-hover:text-cyan-500 transition-colors">
						Try the SDK in your browser
					</AlertTitle>
					<AlertDescription>
						The SDK Explorer has live, interactive demos for app routes, services, streaming,
						and more. No setup required.
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
					description="Create, run, and deploy your first app"
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
					href="/build/apps-and-apis"
					title="Apps and APIs"
					description="Build web apps, backend APIs, static sites, and background work"
					icon={<Server />}
				/>
				<CardLink
					href="/build/agents"
					title="Agents"
					description="Build model-backed app code for chat, tools, state, and coding work"
					icon={<Bot />}
				/>
				<CardLink
					href="/services"
					title="Services"
					description="Add app infrastructure from routes, workers, scripts, and agents"
					icon={<Layers />}
				/>
			</Cards>

			<h2 className="text-lg font-normal text-zinc-600 dark:text-zinc-400 mb-2">
				Explore Further
			</h2>
			<Cards className="lg:grid-cols-2">
				<CardLink
					href="/cookbook"
					title="Cookbook"
					description="Recipes for common app, service, and agent patterns"
					icon={<BookOpen />}
				/>
				<CardLink
					href="/deploy-operate"
					title="Deploy & Operate"
					description="Run local development, build deployable output, and manage environment values"
					icon={<Terminal />}
				/>
				<CardLink
					href="/migration"
					title="Migration"
					description="Move apps from previous SDK versions into the current app shape"
					icon={<BookOpen />}
				/>
			</Cards>

			<h2 className="text-lg font-normal text-zinc-600 dark:text-zinc-400 mb-2">
				Find What You Need
			</h2>
			<Cards>
				<CardLink
					href="/reference/sdk-reference"
					title="SDK Reference"
					description="Package APIs, schemas, Coder, and shared SDK surfaces"
					icon={<Code />}
				/>
				<CardLink
					href="/reference/cli"
					title="CLI Reference"
					description="Commands for local development, deploy, auth, storage, and diagnostics"
					icon={<Terminal />}
				/>
				<CardLink
					href="/reference/api"
					title="API Reference"
					description="REST endpoints for non-TypeScript callers and platform integrations"
					icon={<Globe />}
				/>
				<CardLink
					href="/reference/standalone-packages"
					title="Service Clients"
					description="Install and configure Agentuity client packages in server-side code"
					icon={<Package />}
				/>
			</Cards>
		</div>
	);
}
