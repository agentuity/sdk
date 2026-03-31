import { createFileRoute } from '@tanstack/react-router';
import {
	Rocket,
	Bot,
	Route as RouteIcon,
	Server,
	Monitor,
	Play,
	BookOpen,
	FileText,
	Users,
} from 'lucide-react';
import { Cards, CardLink } from '../components/docs/cards';

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
					className="text-cyan-600 dark:text-cyan-400 hover:underline"
				>
					Agentuity
				</a>{' '}
				is the full-stack cloud platform built for AI agents, with built-in storage, databases,
				sandboxes, observability, and more.
			</p>
			<p className="text-lg text-zinc-600 dark:text-zinc-400 mb-10">
				Start with a guide, explore interactive demos, or dive into the reference docs.
			</p>

			<h2 className="text-lg font-normal text-zinc-600 dark:text-zinc-400 mb-2">Get Started</h2>
			<Cards>
				<CardLink
					href="/get-started"
					title="Get Started"
					description="Installation, quickstart, project structure, and configuration"
					icon={<Rocket />}
				/>
			</Cards>

			<h2 className="text-lg font-normal text-zinc-600 dark:text-zinc-400 mb-2">Build</h2>
			<Cards>
				<CardLink
					href="/agents"
					title="Agents"
					description="Build AI agents with schema validation, streaming, state, and tool use"
					icon={<Bot />}
				/>
				<CardLink
					href="/routes"
					title="Routes"
					description="HTTP, WebSocket, SSE, cron, middleware, and WebRTC endpoints"
					icon={<RouteIcon />}
				/>
				<CardLink
					href="/services"
					title="Services"
					description="Storage, email, queues, database, tasks, webhooks, and sandbox"
					icon={<Server />}
				/>
				<CardLink
					href="/frontend"
					title="Frontend"
					description="React hooks, authentication, RPC client, and deployment"
					icon={<Monitor />}
				/>
			</Cards>

			<h2 className="text-lg font-normal text-zinc-600 dark:text-zinc-400 mb-2">Learn</h2>
			<Cards>
				<CardLink
					href="/explorer"
					title="SDK Explorer"
					description="Interactive demos for every SDK feature"
					icon={<Play />}
				/>
				<CardLink
					href="/cookbook"
					title="Cookbook"
					description="Tutorials, patterns, and framework integrations"
					icon={<BookOpen />}
				/>
				<CardLink
					href="/community"
					title="Community"
					description="Community examples, integrations, and resources"
					icon={<Users />}
				/>
			</Cards>

			<h2 className="text-lg font-normal text-zinc-600 dark:text-zinc-400 mb-2">Reference</h2>
			<Cards>
				<CardLink
					href="/reference"
					title="Reference"
					description="CLI commands, API endpoints, and SDK reference"
					icon={<FileText />}
				/>
			</Cards>
		</div>
	);
}
