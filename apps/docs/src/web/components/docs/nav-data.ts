export interface NavItem {
	title: string;
	url?: string;
	isActive?: boolean;
	/** Short description from MDX frontmatter, used in search results */
	description?: string;
	/** Nested items for subsections */
	items?: NavItem[];
}

export interface NavSection {
	title: string;
	url?: string;
	items: NavItem[];
	/** If true, items are hidden from sidebar but still used for breadcrumb/search */
	hideItems?: boolean;
}

export const navData: NavSection[] = [
	{
		title: 'SDK Explorer',
		url: '/',
		hideItems: true,
		items: [
			{
				title: 'Hello Agent',
				url: '/demo/hello',
				description: 'Your first agent - send input, get output',
			},
			{
				title: 'Handler Context',
				url: '/demo/handler-context',
				description: "See what's available inside your agent handler",
			},
			{
				title: 'Chat',
				url: '/demo/chat',
				description: 'Conversation memory that persists across messages',
			},
			{
				title: 'KV Storage',
				url: '/demo/key-value',
				description: 'Store and retrieve data by key, with auto-expiration',
			},
			{
				title: 'Vector Search',
				url: '/demo/vector-storage',
				description: 'Find content by meaning, not just keywords',
			},
			{
				title: 'Object Storage',
				url: '/demo/object-storage',
				description: 'Store files with presigned URLs for sharing',
			},
			{
				title: 'AI Gateway',
				url: '/demo/ai-gateway',
				description: 'Use any AI provider with a single API key',
			},
			{
				title: 'Text Stream',
				url: '/demo/streaming',
				description: "Stream responses as they're generated",
			},
			{
				title: 'SSE Stream',
				url: '/demo/sse-stream',
				description: 'Structured streaming with event types and auto-reconnect',
			},
			{
				title: 'Durable Streams',
				url: '/demo/durable-stream',
				description: 'Generate content and get a permanent, shareable URL',
			},
			{
				title: 'Agent Calls',
				url: '/demo/agent-calls',
				description: 'Call agents from routes or other agents',
			},
			{
				title: 'Cron Jobs',
				url: '/demo/cron',
				description: 'Run tasks on a schedule with cron expressions',
			},
			{
				title: 'Model Arena',
				url: '/demo/model-arena',
				description: 'Compare AI models using another AI as judge',
			},
			{
				title: 'Evals',
				url: '/demo/evals',
				description: 'Run evaluations after your agent responds',
			},
		],
	},
	{
		title: 'Get Started',
		url: '/get-started',
		items: [
			{
				title: 'What is Agentuity?',
				url: '/get-started/what-is-agentuity',
				description: 'The full-stack platform for building, deploying, and operating AI agents',
			},
			{
				title: 'Installation',
				url: '/get-started/installation',
				description: 'Set up your development environment',
			},
			{
				title: 'Quickstart',
				url: '/get-started/quickstart',
				description: 'Build your first agent in 5 minutes',
			},
			{
				title: 'Project Structure',
				url: '/get-started/project-structure',
				description: 'Understand how Agentuity projects are organized',
			},
			{
				title: 'App Configuration',
				url: '/get-started/app-configuration',
				description: 'Configure your Agentuity project',
			},
		],
	},
	{
		title: 'Agents',
		url: '/agents',
		items: [
			{
				title: 'Creating Agents',
				url: '/agents/creating-agents',
				description: 'Build agents with createAgent(), schemas, and handlers',
			},
			{
				title: 'Workbench',
				url: '/agents/workbench',
				description:
					'Use the built-in development UI to test agents, validate schemas, and debug responses',
			},
			{
				title: 'Schema Libraries',
				url: '/agents/schema-libraries',
				description: 'Choose from built-in, Zod, Valibot, or ArkType for validation',
			},
			{
				title: 'AI Gateway',
				url: '/agents/ai-gateway',
				description: 'Automatic LLM routing with observability and cost tracking',
			},
			{
				title: 'AI SDK Integration',
				url: '/agents/ai-sdk-integration',
				description: 'Generate text, structured data, and streams with the Vercel AI SDK',
			},
			{
				title: 'Streaming Responses',
				url: '/agents/streaming-responses',
				description: 'Return real-time LLM output with streaming agents',
			},
			{
				title: 'State Management',
				url: '/agents/state-management',
				description: 'Request and thread state for stateful agents',
			},
			{
				title: 'Calling Other Agents',
				url: '/agents/calling-other-agents',
				description: 'Build multi-agent systems with type-safe agent-to-agent communication',
			},
			{
				title: 'Standalone Execution',
				url: '/agents/standalone-execution',
				description:
					'Execute agents programmatically for cron jobs, bots, CLI tools, and background workers',
			},
			{
				title: 'Evaluations',
				url: '/agents/evaluations',
				description: 'Automatically test and validate agent outputs for quality and compliance',
			},
			{
				title: 'Events & Lifecycle',
				url: '/agents/events-lifecycle',
				description: 'Lifecycle hooks for monitoring and extending agent behavior',
			},
		],
	},
	{
		title: 'APIs',
		url: '/apis',
		items: [
			{
				title: 'When to Use',
				url: '/apis/when-to-use',
				description: 'When to use simple routes vs agents for your endpoints',
			},
			{
				title: 'Calling Agents',
				url: '/apis/calling-agents',
				description: 'Import and invoke agents from your routes',
			},
		],
	},
	{
		title: 'Routes',
		url: '/routes',
		items: [
			{
				title: 'HTTP',
				url: '/routes/http',
				description: 'Define GET, POST, and other HTTP endpoints with createRouter()',
			},
			{
				title: 'Explicit Routing',
				url: '/routes/explicit-routing',
				description: 'Compose and mount your own Hono routers with createApp({ router })',
			},
			{
				title: 'Middleware',
				url: '/routes/middleware',
				description: 'Add authentication, validation, and request processing to your routes',
			},
			{
				title: 'Cron',
				url: '/routes/cron',
				description: 'Run tasks on a schedule with the cron() middleware',
			},
			{
				title: 'WebSockets',
				url: '/routes/websockets',
				description: 'Real-time bidirectional communication with the websocket middleware',
			},
			{
				title: 'SSE',
				url: '/routes/sse',
				description: 'Stream updates from server to client using SSE middleware',
			},
			{
				title: 'WebRTC',
				url: '/routes/webrtc',
				description: 'Peer-to-peer audio, video, and data channels with the webrtc middleware',
			},
		],
	},
	{
		title: 'Frontend',
		url: '/frontend',
		items: [
			{
				title: 'React Hooks',
				url: '/frontend/react-hooks',
				description:
					'Call your API routes from React with useAPI, useWebsocket, and useEventStream',
			},
			{
				title: 'RPC Client',
				url: '/frontend/rpc-client',
				description:
					'Type-safe API calls from any JavaScript environment using createAPIClient',
			},
			{
				title: 'Provider Setup',
				url: '/frontend/provider-setup',
				description: 'Configure AgentuityProvider for local development and deployments',
			},
			{
				title: 'Authentication',
				url: '/frontend/authentication',
				description: 'Add user authentication with Agentuity Auth',
			},
			{
				title: 'Workbench',
				url: '/frontend/workbench',
				description:
					'Configure routes, authentication, and embed Workbench in custom frontends',
			},
			{
				title: 'Deployment Scenarios',
				url: '/frontend/deployment-scenarios',
				description:
					'Deploy your frontend alongside agents or separately on Vercel, Netlify, etc.',
			},
			{
				title: 'Static Rendering',
				url: '/frontend/static-rendering',
				description:
					'Pre-render your frontend to static HTML for faster page loads and better SEO',
			},
			{
				title: 'Advanced Hooks',
				url: '/frontend/advanced-hooks',
				description:
					'Connect to custom WebSocket and SSE endpoints with useWebsocket and useEventStream',
			},
		],
	},
	{
		title: 'Services',
		url: '/services',
		items: [
			{
				title: 'Database',
				url: '/services/database',
				items: [
					{
						title: 'Postgres',
						url: '/services/database/postgres',
						description: 'Auto-reconnecting PostgreSQL client for serverless environments',
					},
					{
						title: 'Drizzle',
						url: '/services/database/drizzle',
						description: 'Type-safe database access with Drizzle ORM',
					},
				],
			},
			{
				title: 'Storage',
				url: '/services/storage',
				items: [
					{
						title: 'Key-Value',
						url: '/services/storage/key-value',
						description:
							'Fast, ephemeral storage for caching, session data, and configuration',
					},
					{
						title: 'Vector',
						url: '/services/storage/vector',
						description: 'Semantic search and retrieval for knowledge bases and RAG systems',
					},
					{
						title: 'Object',
						url: '/services/storage/object',
						description: "Durable file storage using Bun's native S3 APIs",
					},
					{
						title: 'Durable Streams',
						url: '/services/storage/durable-streams',
						description:
							'Streaming storage for large exports, audit logs, and real-time data',
					},
					{
						title: 'Custom',
						url: '/services/storage/custom',
						description:
							'Local development storage and bringing your own storage implementations',
					},
				],
			},
			{
				title: 'Queues',
				url: '/services/queues',
				description:
					'Publish messages for async processing, webhooks, and event-driven workflows',
			},
			{
				title: 'Tasks',
				url: '/services/tasks',
				description: 'Track work items, issues, and agent activity with lifecycle management',
			},
			{
				title: 'Email',
				url: '/services/email',
				description: 'Send and receive emails with managed addresses and delivery tracking',
			},
			{
				title: 'Webhooks',
				url: '/services/webhooks',
				description: 'Create webhook endpoints with destinations, receipts, and delivery retry',
			},
			{
				title: 'Schedules',
				url: '/services/schedules',
				description: 'Platform-managed cron jobs with HTTP and sandbox destinations',
			},
			{
				title: 'Observability',
				url: '/services/observability',
				items: [
					{
						title: 'Logging',
						url: '/services/observability/logging',
						description: 'Structured logging for agents and routes',
					},
					{
						title: 'Tracing',
						url: '/services/observability/tracing',
						description:
							'OpenTelemetry spans for performance debugging and operation tracking',
					},
					{
						title: 'Sessions & Debugging',
						url: '/services/observability/sessions-debugging',
						description: 'Debug agents using session IDs, CLI commands, and trace timelines',
					},
					{
						title: 'Web Analytics',
						url: '/services/observability/web-analytics',
						description:
							'Track page views, user engagement, and custom events in your frontend',
					},
				],
			},
			{
				title: 'Sandbox',
				url: '/services/sandbox',
				items: [
					{
						title: 'SDK Usage',
						url: '/services/sandbox/sdk-usage',
						description: 'Programmatic API for creating and managing sandboxes',
					},
					{
						title: 'Snapshots',
						url: '/services/sandbox/snapshots',
						description: 'Save and restore sandbox filesystem states for faster cold starts',
					},
				],
			},
		],
	},
	{
		title: 'Cookbook',
		url: '/cookbook',
		items: [
			{
				title: 'Tutorials',
				items: [
					{
						title: 'Understanding Agents',
						url: '/cookbook/tutorials/understanding-agents',
						description:
							'Learn how AI agents use tools, run in loops, and leverage LLMs to complete tasks',
					},
					{
						title: 'RAG Agent',
						url: '/cookbook/tutorials/rag-agent',
						description:
							'Create a retrieval-augmented generation agent with vector search and citations',
					},
				],
			},
			{
				title: 'Patterns',
				items: [
					{
						title: 'Autonomous Research',
						url: '/cookbook/patterns/autonomous-research',
						description:
							'Build a recursive research loop using the Anthropic SDK with native tool calling',
					},
					{
						title: 'Background Tasks',
						url: '/cookbook/patterns/background-tasks',
						description: 'Use waitUntil to run work after responding to the client',
					},
					{
						title: 'Chat with History',
						url: '/cookbook/patterns/chat-with-history',
						description:
							'Build a chat agent that remembers previous messages using thread state',
					},
					{
						title: 'Cron with Storage',
						url: '/cookbook/patterns/cron-with-storage',
						description: 'Cache scheduled task results in KV for later retrieval',
					},
					{
						title: 'LLM as a Judge',
						url: '/cookbook/patterns/llm-as-a-judge',
						description:
							'Use LLMs to evaluate and score agent outputs for quality, safety, and compliance',
					},
					{
						title: 'Server Utilities',
						url: '/cookbook/patterns/server-utilities',
						description:
							'Use storage, queues, logging, and error handling from external backends',
					},
					{
						title: 'Product Search',
						url: '/cookbook/patterns/product-search',
						description: 'Semantic product search with metadata filtering',
					},
					{
						title: 'Hono RPC',
						url: '/cookbook/patterns/hono-rpc-tanstack-query',
						description: 'Type-safe API calls between server and React frontend',
					},
					{
						title: 'Tailwind Setup',
						url: '/cookbook/patterns/tailwind-setup',
						description: 'Add Tailwind CSS styling to your Agentuity frontend',
					},
					{
						title: 'Web Exploration',
						url: '/cookbook/patterns/web-exploration',
						description:
							'Run a headless browser in a sandbox to let agents browse, screenshot, and extract web content',
					},
					{
						title: 'Webhook Handler',
						url: '/cookbook/patterns/webhook-handler',
						description:
							'Handle incoming webhooks with signature verification and background processing',
					},
				],
			},
			{
				title: 'Integrations',
				items: [
					{
						title: 'Mastra',
						url: '/cookbook/integrations/mastra',
						description:
							'Agent framework with tools, structured output, and multi-agent workflows',
					},
					{
						title: 'LangChain',
						url: '/cookbook/integrations/langchain',
						description: 'ReAct agents, dynamic tools, and streaming with LangChain.js',
					},
					{
						title: 'OpenAI Agents SDK',
						url: '/cookbook/integrations/openai-agents',
						description: 'Tool calling, handoffs, and streaming with the OpenAI Agents SDK',
					},
					{
						title: 'Claude Agent SDK',
						url: '/cookbook/integrations/claude-agent',
						description: 'Conversational code intelligence with sandbox execution',
					},
					{
						title: 'Chat SDK',
						url: '/cookbook/integrations/chat-sdk',
						description:
							'Multi-platform chatbots for Slack and Discord with conversation memory',
					},
					{
						title: 'Next.js',
						url: '/cookbook/integrations/nextjs',
						description: 'Add agents to an existing Next.js application',
					},
					{
						title: 'TanStack Start',
						url: '/cookbook/integrations/tanstack-start',
						description: 'Add agents to an existing TanStack Start application',
					},
					{
						title: 'Turborepo',
						url: '/cookbook/integrations/turborepo',
						description:
							'Add Agentuity agents as a workspace package in a Turborepo monorepo with shared types',
					},
				],
			},
		],
	},
	{
		title: 'Community',
		url: '/community',
		items: [
			{
				title: 'Overview',
				url: '/community',
				description: 'Real-world integrations and tutorials built with Agentuity',
			},
			{
				title: 'Inbound Email Agent',
				url: '/community/inbound-email-agent',
				description:
					'Build an AI auto-responder that handles inbound emails via webhooks and sends replies',
			},
		],
	},
	{
		title: 'Reference',
		url: '/reference',
		items: [
			{
				title: 'API Reference',
				url: '/reference/api',
				items: [
					{
						title: 'Key-Value Storage',
						url: '/reference/api/key-value',
						description: 'Store and retrieve arbitrary data by key within namespaces',
					},
					{
						title: 'Vector Search',
						url: '/reference/api/vector',
						description: 'Semantic search with automatic embedding generation',
					},
					{
						title: 'Object Storage',
						url: '/reference/api/object-storage',
						description: 'Store and manage files and binary objects in buckets',
					},
					{
						title: 'Durable Streams',
						url: '/reference/api/streams',
						description: 'Create durable, resumable data streams with public URLs',
					},
					{
						title: 'Message Queues',
						url: '/reference/api/queues',
						description:
							'Publish, consume, and manage messages with worker and pub/sub queues',
					},
					{
						title: 'Emails',
						url: '/reference/api/email',
						description:
							'Send and receive emails with managed addresses and webhook destinations',
					},
					{
						title: 'Users',
						url: '/reference/api/user',
						description: 'Get authenticated user information and organization memberships',
					},
					{
						title: 'Threads',
						url: '/reference/api/threads',
						description: 'Manage conversation threads for agent session state and user data',
					},
					{
						title: 'Evaluations',
						url: '/reference/api/evaluations',
						description: 'List and retrieve evaluations and their run history',
					},
					{
						title: 'API Keys',
						url: '/reference/api/api-keys',
						description: 'Create and manage API keys for authentication',
					},
					{
						title: 'Regions',
						url: '/reference/api/regions',
						description: 'List available cloud regions and manage per-region resources',
					},
					{
						title: 'Databases',
						url: '/reference/api/database',
						description: 'Execute queries, inspect tables, and monitor database performance',
					},
					{
						title: 'Organizations',
						url: '/reference/api/organizations',
						description:
							'Manage organizations, environment variables, and org-level resources',
					},
					{
						title: 'Machines',
						url: '/reference/api/machines',
						description: 'Manage compute nodes and organization authentication enrollment',
					},
					{
						title: 'Schedules',
						url: '/reference/api/schedules',
						description:
							'Create and manage cron-based scheduled jobs with destinations and delivery tracking',
					},
					{
						title: 'Webhooks',
						url: '/reference/api/webhooks',
						description:
							'Manage webhook endpoints, destinations, receipts, deliveries, and analytics',
					},
					{
						title: 'Sessions',
						url: '/reference/api/sessions',
						description:
							'View agent execution sessions with timing, cost, and observability data',
					},
					{
						title: 'Projects',
						url: '/reference/api/projects',
						description:
							'Full project lifecycle management including deployments, agents, environment variables, and hostnames',
					},
					{
						title: 'Tasks',
						url: '/reference/api/tasks',
						description:
							'Full-featured task management with epics, features, bugs, comments, tags, attachments, and activity tracking',
					},
					{
						title: 'Sandboxes',
						url: '/reference/api/sandboxes',
						description:
							'Create and manage isolated execution environments with full lifecycle, file system, snapshot, and checkpoint support',
					},
				],
			},
			{
				title: 'CLI',
				url: '/reference/cli',
				items: [
					{
						title: 'Getting Started',
						url: '/reference/cli/getting-started',
						description:
							'Install the Agentuity CLI and authenticate to start building agents',
					},
					{
						title: 'Development',
						url: '/reference/cli/development',
						description:
							'Run the development server with hot reload, local mode, and the interactive Workbench',
					},
					{
						title: 'Build Configuration',
						url: '/reference/cli/build-configuration',
						description:
							'Customize the build process with Vite plugins and build-time constants',
					},
					{
						title: 'Deployment',
						url: '/reference/cli/deployment',
						description:
							'Deploy your agents to Agentuity Cloud with automatic infrastructure provisioning',
					},
					{
						title: 'Git Integration',
						url: '/reference/cli/git-integration',
						description:
							'Link your GitHub account and repositories to enable preview deployments and CI/CD',
					},
					{
						title: 'Storage',
						url: '/reference/cli/storage',
						description:
							'Manage Key-Value, S3, Vector, Database, and Stream storage from the CLI',
					},
					{
						title: 'Sandbox',
						url: '/reference/cli/sandbox',
						description: 'Create and manage isolated execution environments from the CLI',
					},
					{
						title: 'Configuration',
						url: '/reference/cli/configuration',
						description: 'Manage environment variables, secrets, and API keys from the CLI',
					},
					{
						title: 'Debugging',
						url: '/reference/cli/debugging',
						description:
							'SSH into containers, inspect sessions, and troubleshoot deployed agents',
					},
					{
						title: 'AI Commands',
						url: '/reference/cli/ai-commands',
						description: 'CLI commands for AI agents, IDE integration, and schema inspection',
					},
					{
						title: 'OAuth Applications',
						url: '/reference/cli/oauth',
						description:
							'Register and manage OAuth/OIDC applications for third-party integrations',
					},
					{
						title: 'Monitoring',
						url: '/reference/cli/monitoring',
						description:
							'Monitor machine health, resource usage, and distressed nodes in real time',
					},
					{
						title: 'Opencode Plugin',
						url: '/reference/cli/opencode-plugin',
						description:
							'Install the Agentuity plugin for OpenCode to enable AI-assisted development',
					},
					{
						title: 'Claude Code Plugin',
						url: '/reference/cli/claude-code-plugin',
						description:
							'Install the Agentuity Coder plugin for Claude Code to get specialized agents with persistent memory',
					},
				],
			},
			{
				title: 'GitHub App',
				url: '/reference/github-app',
				description:
					'Automate deployments from GitHub repositories with push and PR preview environments',
			},
			{
				title: 'SDK Reference',
				url: '/reference/sdk-reference',
				description: 'Comprehensive reference for the Agentuity TypeScript/JavaScript SDK',
			},
			{
				title: 'Gravity Network',
				url: '/reference/gravity-network',
				description: "The layered infrastructure powering Agentuity's services",
			},
			{
				title: 'Migration Guide',
				url: '/reference/migration-guide',
				description: "Moving from v0? Here's everything you need to update",
			},
		],
	},
];

// Recursively search for a nav item by URL
function findItemByUrl(items: NavItem[], url: string): NavItem | undefined {
	for (const item of items) {
		if (item.url === url) {
			return item;
		}
		if (item.items) {
			const found = findItemByUrl(item.items, url);
			if (found) return found;
		}
	}
	return undefined;
}

// Helper to find current nav item and section
export function findCurrentNav(currentPage: string): { section?: NavSection; item?: NavItem } {
	const url = currentPage === 'home' ? '/' : `/${currentPage}`;
	for (const section of navData) {
		// Check section URL
		if (section.url === url) {
			return { section };
		}
		// Check items recursively
		const item = findItemByUrl(section.items, url);
		if (item) {
			return { section, item };
		}
	}
	return {};
}

// Recursively collect all leaf nav items (items with URLs, no sub-items or sub-items without URLs)
function collectLeafItems(
	items: NavItem[],
	sectionTitle: string
): Array<NavItem & { section: string }> {
	const result: Array<NavItem & { section: string }> = [];
	for (const item of items) {
		// If item has a URL, it's navigable
		if (item.url) {
			result.push({ ...item, url: item.url, section: sectionTitle });
		}
		// Also recurse into nested items
		if (item.items) {
			result.push(...collectLeafItems(item.items, sectionTitle));
		}
	}
	return result;
}

// Get flat list of all nav items for prev/next navigation
export function getAllNavItems(): Array<NavItem & { section: string; url: string }> {
	const items: Array<NavItem & { section: string; url: string }> = [];
	for (const section of navData) {
		items.push(
			...(collectLeafItems(section.items, section.title) as Array<
				NavItem & { section: string; url: string }
			>)
		);
	}
	return items;
}

// Helper to find prev/next pages
export function findPrevNext(currentPage: string): {
	prev?: NavItem & { section: string; url: string };
	next?: NavItem & { section: string; url: string };
} {
	const allItems = getAllNavItems();
	const url = currentPage === 'home' ? '/' : `/${currentPage}`;
	const currentIndex = allItems.findIndex((item) => item.url === url);

	if (currentIndex === -1) {
		return {};
	}

	return {
		prev: currentIndex > 0 ? allItems[currentIndex - 1] : undefined,
		next: currentIndex < allItems.length - 1 ? allItems[currentIndex + 1] : undefined,
	};
}

// Find the full breadcrumb chain from root section to current page
export function findBreadcrumbChain(currentPage: string): Array<{ title: string; url?: string }> {
	const url = currentPage === 'home' ? '/' : `/${currentPage}`;

	// Home page — no breadcrumbs
	if (url === '/') return [];

	for (const section of navData) {
		// Check if this is the section index page
		if (section.url === url) {
			return [{ title: section.title, url: section.url }];
		}

		// Recursively search items, accumulating ancestors
		const chain = findChainInItems(section.items, url, [
			{ title: section.title, url: section.url },
		]);
		if (chain) return chain;
	}

	return [];
}

// Recursive helper — searches NavItem[] for a matching URL, building up the ancestor chain
function findChainInItems(
	items: NavItem[],
	targetUrl: string,
	ancestors: Array<{ title: string; url?: string }>
): Array<{ title: string; url?: string }> | null {
	for (const item of items) {
		if (item.url === targetUrl) {
			return [...ancestors, { title: item.title, url: item.url }];
		}
		if (item.items) {
			const chain = findChainInItems(item.items, targetUrl, [
				...ancestors,
				{ title: item.title, url: item.url },
			]);
			if (chain) return chain;
		}
	}
	return null;
}

// Check if any item in the tree is active (matches current URL)
export function hasActiveChild(items: NavItem[], currentUrl: string): boolean {
	for (const item of items) {
		if (item.url === currentUrl) return true;
		if (item.items && hasActiveChild(item.items, currentUrl)) return true;
	}
	return false;
}
