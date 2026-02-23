/**
 * Server-side rendering entry point.
 * Used by the prerender script to generate static HTML for each route.
 */

import { renderToString } from 'react-dom/server';
import { StrictMode } from 'react';
import { createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router';
import { AgentuityProvider } from '@agentuity/react';
import { ThemeProvider } from './components/ThemeContext';
import { routeTree } from './routeTree.gen';

export async function render(url: string): Promise<string> {
	const memoryHistory = createMemoryHistory({ initialEntries: [url] });
	const router = createRouter({
		routeTree,
		history: memoryHistory,
	});
	await router.load();

	return renderToString(
		<StrictMode>
			<ThemeProvider>
				<AgentuityProvider>
					<RouterProvider router={router} />
				</AgentuityProvider>
			</ThemeProvider>
		</StrictMode>
	);
}

/**
 * Returns all URL paths that should be pre-rendered to static HTML.
 * Used by the CLI when render: 'static' is set in agentuity.config.ts.
 */
export function getStaticPaths(): string[] {
	return [
		// Landing page
		'/',

		// Demo pages
		'/demo/hello',
		'/demo/handler-context',
		'/demo/key-value',
		'/demo/vector-storage',
		'/demo/object-storage',
		'/demo/ai-gateway',
		'/demo/streaming',
		'/demo/sse-stream',
		'/demo/durable-stream',
		'/demo/agent-calls',
		'/demo/cron',
		'/demo/chat',
		'/demo/model-arena',
		'/demo/evals',

		// Get Started
		'/get-started',
		'/get-started/what-is-agentuity',
		'/get-started/installation',
		'/get-started/quickstart',
		'/get-started/project-structure',
		'/get-started/app-configuration',

		// Agents
		'/agents',
		'/agents/creating-agents',
		'/agents/ai-gateway',
		'/agents/ai-sdk-integration',
		'/agents/calling-other-agents',
		'/agents/evaluations',
		'/agents/events-lifecycle',
		'/agents/schema-libraries',
		'/agents/standalone-execution',
		'/agents/state-management',
		'/agents/streaming-responses',
		'/agents/workbench',

		// APIs
		'/apis',
		'/apis/calling-agents',
		'/apis/when-to-use',

		// Routes
		'/routes',
		'/routes/cron',
		'/routes/http',
		'/routes/middleware',
		'/routes/sse',
		'/routes/websockets',

		// Frontend
		'/frontend',
		'/frontend/advanced-hooks',
		'/frontend/authentication',
		'/frontend/deployment-scenarios',
		'/frontend/provider-setup',
		'/frontend/react-hooks',
		'/frontend/rpc-client',
		'/frontend/workbench',

		// Services
		'/services',
		'/services/queues',
		'/services/storage',
		'/services/storage/key-value',
		'/services/storage/vector',
		'/services/storage/object',
		'/services/storage/durable-streams',
		'/services/storage/custom',
		'/services/database',
		'/services/database/postgres',
		'/services/database/drizzle',
		'/services/observability',
		'/services/observability/logging',
		'/services/observability/tracing',
		'/services/observability/sessions-debugging',
		'/services/observability/web-analytics',
		'/services/sandbox',
		'/services/sandbox/sdk-usage',
		'/services/sandbox/snapshots',

		// Cookbook
		'/cookbook',
		'/cookbook/patterns',
		'/cookbook/patterns/background-tasks',
		'/cookbook/patterns/chat-with-history',
		'/cookbook/patterns/cron-with-storage',
		'/cookbook/patterns/llm-as-a-judge',
		'/cookbook/patterns/product-search',
		'/cookbook/patterns/server-utilities',
		'/cookbook/patterns/tailwind-setup',
		'/cookbook/patterns/webhook-handler',
		'/cookbook/tutorials',
		'/cookbook/tutorials/rag-agent',
		'/cookbook/tutorials/understanding-agents',

		// Community
		'/community',
		'/community/inbound-email-agent',

		// Reference
		'/reference',
		'/reference/gravity-network',
		'/reference/migration-guide',
		'/reference/sdk-reference',
		'/reference/cli',
		'/reference/cli/ai-commands',
		'/reference/cli/build-configuration',
		'/reference/cli/claude-code-plugin',
		'/reference/cli/configuration',
		'/reference/cli/debugging',
		'/reference/cli/deployment',
		'/reference/cli/development',
		'/reference/cli/getting-started',
		'/reference/cli/git-integration',
		'/reference/cli/opencode-plugin',
		'/reference/cli/sandbox',
		'/reference/cli/storage',
	];
}
