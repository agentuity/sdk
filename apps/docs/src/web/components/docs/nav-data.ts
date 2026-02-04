export interface NavItem {
	title: string;
	url?: string;
	isActive?: boolean;
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
			{ title: 'Hello Agent', url: '/demo/hello' },
			{ title: 'Handler Context', url: '/demo/handler-context' },
			{ title: 'Chat', url: '/demo/chat' },
			{ title: 'KV Storage', url: '/demo/key-value' },
			{ title: 'Vector Search', url: '/demo/vector-storage' },
			{ title: 'Object Storage', url: '/demo/object-storage' },
			{ title: 'AI Gateway', url: '/demo/ai-gateway' },
			{ title: 'Text Stream', url: '/demo/streaming' },
			{ title: 'SSE Stream', url: '/demo/sse-stream' },
			{ title: 'Durable Streams', url: '/demo/durable-stream' },
			{ title: 'Agent Calls', url: '/demo/agent-calls' },
			{ title: 'Cron Jobs', url: '/demo/cron' },
			{ title: 'Model Arena', url: '/demo/model-arena' },
			{ title: 'Evals', url: '/demo/evals' },
		],
	},
	{
		title: 'Get Started',
		url: '/get-started',
		items: [
			{ title: 'What is Agentuity?', url: '/get-started/what-is-agentuity' },
			{ title: 'Installation', url: '/get-started/installation' },
			{ title: 'Quickstart', url: '/get-started/quickstart' },
			{ title: 'Project Structure', url: '/get-started/project-structure' },
			{ title: 'App Configuration', url: '/get-started/app-configuration' },
		],
	},
	{
		title: 'Agents',
		url: '/agents',
		items: [
			{ title: 'Creating Agents', url: '/agents/creating-agents' },
			{ title: 'Workbench', url: '/agents/workbench' },
			{ title: 'Schema Libraries', url: '/agents/schema-libraries' },
			{ title: 'AI Gateway', url: '/agents/ai-gateway' },
			{ title: 'AI SDK Integration', url: '/agents/ai-sdk-integration' },
			{ title: 'Streaming Responses', url: '/agents/streaming-responses' },
			{ title: 'State Management', url: '/agents/state-management' },
			{ title: 'Calling Other Agents', url: '/agents/calling-other-agents' },
			{ title: 'Standalone Execution', url: '/agents/standalone-execution' },
			{ title: 'Evaluations', url: '/agents/evaluations' },
			{ title: 'Events & Lifecycle', url: '/agents/events-lifecycle' },
		],
	},
	{
		title: 'APIs',
		url: '/apis',
		items: [
			{ title: 'When to Use', url: '/apis/when-to-use' },
			{ title: 'Calling Agents', url: '/apis/calling-agents' },
		],
	},
	{
		title: 'Routes',
		url: '/routes',
		items: [
			{ title: 'HTTP', url: '/routes/http' },
			{ title: 'Middleware', url: '/routes/middleware' },
			{ title: 'Cron', url: '/routes/cron' },
			{ title: 'WebSockets', url: '/routes/websockets' },
			{ title: 'SSE', url: '/routes/sse' },
		],
	},
	{
		title: 'Frontend',
		url: '/frontend',
		items: [
			{ title: 'React Hooks', url: '/frontend/react-hooks' },
			{ title: 'RPC Client', url: '/frontend/rpc-client' },
			{ title: 'Provider Setup', url: '/frontend/provider-setup' },
			{ title: 'Authentication', url: '/frontend/authentication' },
			{ title: 'Workbench', url: '/frontend/workbench' },
			{ title: 'Deployment Scenarios', url: '/frontend/deployment-scenarios' },
			{ title: 'Advanced Hooks', url: '/frontend/advanced-hooks' },
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
					{ title: 'Postgres', url: '/services/database/postgres' },
					{ title: 'Drizzle', url: '/services/database/drizzle' },
				],
			},
			{
				title: 'Storage',
				url: '/services/storage',
				items: [
					{ title: 'Key-Value', url: '/services/storage/key-value' },
					{ title: 'Vector', url: '/services/storage/vector' },
					{ title: 'Object', url: '/services/storage/object' },
					{ title: 'Durable Streams', url: '/services/storage/durable-streams' },
					{ title: 'Custom', url: '/services/storage/custom' },
				],
			},
			{ title: 'Queues', url: '/services/queues' },
			{
				title: 'Observability',
				url: '/services/observability',
				items: [
					{ title: 'Logging', url: '/services/observability/logging' },
					{ title: 'Tracing', url: '/services/observability/tracing' },
					{ title: 'Sessions & Debugging', url: '/services/observability/sessions-debugging' },
				],
			},
			{
				title: 'Sandbox',
				url: '/services/sandbox',
				items: [
					{ title: 'SDK Usage', url: '/services/sandbox/sdk-usage' },
					{ title: 'Snapshots', url: '/services/sandbox/snapshots' },
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
					{ title: 'Understanding Agents', url: '/cookbook/tutorials/understanding-agents' },
					{ title: 'RAG Agent', url: '/cookbook/tutorials/rag-agent' },
				],
			},
			{
				title: 'Patterns',
				items: [
					{ title: 'Background Tasks', url: '/cookbook/patterns/background-tasks' },
					{ title: 'Chat with History', url: '/cookbook/patterns/chat-with-history' },
					{ title: 'Cron with Storage', url: '/cookbook/patterns/cron-with-storage' },
					{ title: 'LLM as a Judge', url: '/cookbook/patterns/llm-as-a-judge' },
					{ title: 'Server Utilities', url: '/cookbook/patterns/server-utilities' },
					{ title: 'Product Search', url: '/cookbook/patterns/product-search' },
					{ title: 'Tailwind Setup', url: '/cookbook/patterns/tailwind-setup' },
					{ title: 'Webhook Handler', url: '/cookbook/patterns/webhook-handler' },
				],
			},
		],
	},
	{
		title: 'Community',
		url: '/community',
		hideItems: true,
		items: [{ title: 'Overview', url: '/community' }],
	},
	{
		title: 'Reference',
		url: '/reference',
		items: [
			{
				title: 'CLI',
				url: '/reference/cli',
				items: [
					{ title: 'Getting Started', url: '/reference/cli/getting-started' },
					{ title: 'Development', url: '/reference/cli/development' },
					{ title: 'Build Configuration', url: '/reference/cli/build-configuration' },
					{ title: 'Deployment', url: '/reference/cli/deployment' },
					{ title: 'Storage', url: '/reference/cli/storage' },
					{ title: 'Sandbox', url: '/reference/cli/sandbox' },
					{ title: 'Configuration', url: '/reference/cli/configuration' },
					{ title: 'Debugging', url: '/reference/cli/debugging' },
					{ title: 'AI Commands', url: '/reference/cli/ai-commands' },
					{ title: 'Opencode Plugin', url: '/reference/cli/opencode-plugin' },
				],
			},
			{ title: 'SDK Reference', url: '/reference/sdk-reference' },
			{ title: 'Migration Guide', url: '/reference/migration-guide' },
			{ title: 'MDX Features', url: '/reference/mdx-features' },
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
function collectLeafItems(items: NavItem[], sectionTitle: string): Array<NavItem & { section: string }> {
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
		items.push(...(collectLeafItems(section.items, section.title) as Array<NavItem & { section: string; url: string }>));
	}
	return items;
}

// Helper to find prev/next pages
export function findPrevNext(
	currentPage: string
): { prev?: NavItem & { section: string; url: string }; next?: NavItem & { section: string; url: string } } {
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

// Check if any item in the tree is active (matches current URL)
export function hasActiveChild(items: NavItem[], currentUrl: string): boolean {
	for (const item of items) {
		if (item.url === currentUrl) return true;
		if (item.items && hasActiveChild(item.items, currentUrl)) return true;
	}
	return false;
}
