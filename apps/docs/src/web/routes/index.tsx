import { createFileRoute } from '@tanstack/react-router';
import {
	Rocket,
	Download,
	Zap,
	Bot,
	Route as RouteIcon,
	Server,
	Monitor,
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
				Start with a guide, explore interactive demos, or dive into the reference docs.
			</p>

			<Link to="/explorer" className="block group mb-10">
				<Alert variant="tip" className="transition-colors hover:border-cyan-500/50">
					<Play className="size-4" />
					<AlertTitle className="group-hover:text-cyan-800 dark:group-hover:text-cyan-500 transition-colors">
						Try the SDK in Your Browser
					</AlertTitle>
					<AlertDescription>
						The SDK Explorer has live, interactive demos for agents, storage, streaming, and
						more. No setup required.
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
					description="Build and deploy your first agent in minutes"
					icon={<Zap />}
				/>
			</Cards>

			<h2 className="text-lg font-normal text-zinc-600 dark:text-zinc-400 mb-2">
				Start Building
			</h2>
			<Cards className="lg:grid-cols-2">
				<CardLink
					href="/agents"
					title="Agents"
					description="Define handlers, validate input, manage state, and stream responses"
					icon={<Bot />}
				/>
				<CardLink
					href="/routes"
					title="Routes"
					description="Expose APIs, schedule cron jobs, and handle real-time connections"
					icon={<RouteIcon />}
				/>
				<CardLink
					href="/services"
					title="Services"
					description="Persist data, send emails, run background jobs, and execute sandboxed code"
					icon={<Server />}
				/>
				<CardLink
					href="/frontend"
					title="Frontend"
					description="Connect your React app to agents with type-safe hooks and auth"
					icon={<Monitor />}
				/>
			</Cards>

			<h2 className="text-lg font-normal text-zinc-600 dark:text-zinc-400 mb-2">
				Explore Further
			</h2>
			<Cards className="lg:grid-cols-2">
				<CardLink
					href="/cookbook"
					title="Cookbook"
					description="Step-by-step guides for RAG, chat history, background tasks, and more"
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
					description="Method signatures for agents, routes, and every service API"
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
