import { CODE_EXAMPLES } from './code-examples';
import { AgentCallsDemo } from './components/AgentCallsDemo';
import { AIGatewayDemo } from './components/AIGatewayDemo';
import { ChatDemo } from './components/ChatDemo';

import { HandlerContextDemo } from './components/HandlerContextDemo';
import { HelloDemo } from './components/HelloDemo';
import { KVExplorer } from './components/KVExplorer';
import { ModelArena } from './components/ModelArena';
import { ObjectStoreDemo } from './components/ObjectStoreDemo';
import { PersistentStreamDemo } from './components/PersistentStreamDemo';
import { SSEStreamDemo } from './components/SSEStreamDemo';
import { StreamingDemo } from './components/StreamingDemo';
import { VectorSearch } from './components/VectorSearch';
import { DatabaseDemo } from './components/DatabaseDemo';
import { EmailDemo } from './components/EmailDemo';
import { QueueDemo } from './components/QueueDemo';
import { SchedulesDemo } from './components/SchedulesDemo';

import { WebRTCDemo } from './components/WebRTCDemo';
import { WebSocketDemo } from './components/WebSocketDemo';
import type { LineHighlight } from './components/CodeBlock';

export type DemoId =
	| 'hello'
	| 'handler-context'
	| 'chat'
	| 'key-value'
	| 'vector-storage'
	| 'model-arena'
	| 'ai-gateway'
	| 'sse-stream'
	| 'streaming'
	| 'websocket'
	| 'webrtc'
	| 'durable-stream'
	| 'schedules'
	| 'agent-calls'
	| 'object-storage'
	| 'queue'
	| 'email'
	| 'database';

export const explorerHref = (id: DemoId) => `/explorer/${id}` as const;

export interface DemoConfig {
	id: DemoId;
	title: string;
	subtitle: string;
	description: string;
	explanation: React.ReactNode;
	docsUrl?: string;
	category: 'basics' | 'services' | 'io-patterns' | 'examples';
	component: React.ComponentType;
	codeExample: string;
	sandboxEnabled?: boolean;
	sandboxScript?: string;
	sandboxInput?: unknown;
	codeHighlights?: LineHighlight[];
	isRoute?: boolean;
}

export const DEMOS: DemoConfig[] = [
	// Basics - fundamental concepts
	{
		id: 'hello',
		title: 'Hello Agent',
		subtitle: 'Basic Request/Response',
		description: 'Your first agent - send input, get output.',
		explanation: (
			<>
				An <em>agent</em> is code that receives input, processes it, and returns output. Unlike
				a simple function, agents can use tools, access storage, and maintain state across
				requests.{' '}
				<span className="bg-cyan-500/10 px-1 rounded">
					This is the building block of any Agentuity project
				</span>
				. Every agent follows the same pattern: the <em>schema</em> declares what goes in and
				comes out, the <em>handler</em> processes requests. Once you're comfortable here,
				explore the{' '}
				<a
					href={explorerHref('handler-context')}
					className="text-zinc-600 dark:text-zinc-400 underline hover:text-cyan-700 dark:hover:text-cyan-500"
				>
					Handler Context
				</a>{' '}
				to see what tools are available inside your handler.
			</>
		),
		docsUrl: '/build/agents',
		category: 'basics',
		component: HelloDemo,
		codeExample: CODE_EXAMPLES.hello,
		sandboxEnabled: true,
		sandboxScript: 'hello',
		sandboxInput: { name: 'World' },
	},
	{
		id: 'handler-context',
		title: 'Handler Context',
		subtitle: 'Hono Route Context',
		description: 'See request data, injected services, and app-owned state in a Hono route.',
		explanation: (
			<>
				When an Agentuity Hono route runs, the request context includes the pieces your app code
				needs:{' '}
				<span className="bg-cyan-500/10 px-1 rounded">
					request data, logging, service access, and background helpers
				</span>
				. Click the buttons below to inspect the live docs API route. The reference code on the
				right shows the v3 Hono shape with `agentuity()` middleware and `c.var.*` services.
			</>
		),
		docsUrl: '/frameworks/hono',
		category: 'basics',
		component: HandlerContextDemo,
		codeExample: CODE_EXAMPLES['handler-context'],
		sandboxEnabled: true,
		sandboxScript: 'handler-context',
	},
	// Services - storage and AI gateway
	{
		id: 'key-value',
		title: 'KV Storage',
		subtitle: 'Key-Value Store',
		description: 'Store and retrieve data by key, with auto-expiration.',
		explanation: (
			<>
				Store and retrieve data by key, like a dictionary. Set a value with a key, get it back
				later using that exact key. Optionally set a <em>TTL</em> (time-to-live), which tells
				the system to automatically delete the data after a set period, perfect for caching or
				temporary sessions.{' '}
				<span className="bg-zinc-300/15 px-1 rounded">
					Use KV when you know the exact key you're looking for
				</span>
				. For searching by meaning or similarity, use{' '}
				<a
					href={explorerHref('vector-storage')}
					className="text-zinc-600 dark:text-zinc-400 underline hover:text-cyan-700 dark:hover:text-cyan-500"
				>
					Vector storage
				</a>{' '}
				instead.
			</>
		),
		docsUrl: '/services/storage/key-value',
		category: 'services',
		component: KVExplorer,
		codeExample: CODE_EXAMPLES['key-value'],
		sandboxEnabled: true,
		sandboxScript: 'kv',
	},
	{
		id: 'vector-storage',
		title: 'Vector Search',
		subtitle: 'Semantic Search',
		description: 'Find content by meaning, not just keywords.',
		explanation: (
			<>
				Traditional searches match exact words. Search for 'comfortable chair' and you won't
				find 'ergonomic seating'. Vector search finds results by{' '}
				<strong>
					<em>meaning</em>
				</strong>{' '}
				instead. Your text gets converted to numbers (<em>embeddings</em>) that capture
				concepts, so <em>similar ideas cluster together</em>, even when the words are completely
				different.{' '}
				<span className="bg-cyan-500/10 px-1 rounded">
					Use vector search when you need to find content by meaning
				</span>{' '}
				rather than exact keywords. For exact key lookups, use{' '}
				<a
					href={explorerHref('key-value')}
					className="text-zinc-600 dark:text-zinc-400 underline hover:text-cyan-700 dark:hover:text-cyan-500"
				>
					KV storage
				</a>{' '}
				instead.
			</>
		),
		docsUrl: '/services/storage/vector',
		category: 'services',
		component: VectorSearch,
		codeExample: CODE_EXAMPLES['vector-storage'],
		sandboxEnabled: true,
		sandboxScript: 'vector',
		sandboxInput: { query: 'comfortable chair' },
		codeHighlights: [
			{ lines: 16, className: 'important' },
			{ lines: [21, 22], className: 'important' },
		],
	},
	{
		id: 'object-storage',
		title: 'Object Storage',
		subtitle: 'File Storage (Bun S3)',
		description: 'Store files with presigned URLs for sharing.',
		explanation: (
			<>
				Need to store files like images, PDFs, or videos? That's what object storage is for, and
				it handles larger files with ease. Upload a file and get back a shareable URL.{' '}
				<span className="bg-cyan-500/10 px-1 rounded">
					Need temporary access? Generate presigned URLs
				</span>{' '}
				that expire automatically. Under the hood, this uses <em>S3-compatible storage</em> (a
				widely-used standard for file storage), so the patterns you learn here work anywhere.
				For simple key-value data, see{' '}
				<a
					href={explorerHref('key-value')}
					className="text-zinc-600 dark:text-zinc-400 underline hover:text-cyan-700 dark:hover:text-cyan-500"
				>
					KV storage
				</a>
				.
			</>
		),
		docsUrl: '/services/storage/object',
		category: 'services',
		component: ObjectStoreDemo,
		codeExample: CODE_EXAMPLES['object-storage'],
		sandboxEnabled: true,
		sandboxScript: 'objectstore',
	},
	{
		id: 'ai-gateway',
		title: 'AI Gateway',
		subtitle: 'Multi-Provider Routing',
		description: 'Route supported model calls through one Agentuity project credential.',
		explanation: (
			<>
				Call supported provider models through Agentuity instead of wiring every route to a
				separate gateway setup.{' '}
				<span className="bg-cyan-500/10 px-1 rounded">
					The AI Gateway handles project authentication, model routing, and usage metadata
				</span>{' '}
				when the response includes it. This demo compares a fixed model set; use the live model
				catalog before choosing app defaults.
			</>
		),
		docsUrl: '/services/ai-gateway',
		category: 'services',
		component: AIGatewayDemo,
		codeExample: CODE_EXAMPLES['ai-gateway'],
		sandboxEnabled: true,
		sandboxScript: 'ai-gateway',
		sandboxInput: { prompt: 'Explain AI agents in 1 sentence.' },
	},
	// I/O Patterns - streaming and real-time
	{
		id: 'streaming',
		title: 'Text Stream',
		subtitle: 'Raw Streaming',
		description: "Stream responses as they're generated.",
		explanation: (
			<>
				Stream data as it's generated instead of waiting for the complete response. This is{' '}
				<em>raw streaming</em>: bytes flow through as they're ready, with no extra structure
				added.{' '}
				<span className="bg-cyan-500/10 px-1 rounded">
					Perfect for simple LLM token streaming
				</span>{' '}
				where you just want text to appear word-by-word. If you need typed events, message IDs,
				or automatic reconnection, see{' '}
				<a
					href={explorerHref('sse-stream')}
					className="text-zinc-600 dark:text-zinc-400 underline hover:text-cyan-700 dark:hover:text-cyan-500"
				>
					SSE streaming
				</a>
				.
			</>
		),
		docsUrl: '/build/chat-and-streaming',
		category: 'io-patterns',
		component: StreamingDemo,
		codeExample: CODE_EXAMPLES.streaming,
		sandboxEnabled: true,
		sandboxScript: 'streaming',
		sandboxInput: { prompt: 'Write a short poem about AI.' },
		isRoute: true,
	},
	{
		id: 'sse-stream',
		title: 'SSE Stream',
		subtitle: 'Server-Sent Events',
		description: 'Structured streaming with event types and auto-reconnect.',
		explanation: (
			<>
				A one-way stream from your server to the user's browser, with structure built in. Unlike
				raw streaming, SSE gives you <em>typed events</em> (like "chunk" or "done"), message{' '}
				<em>IDs</em> for tracking, and automatic reconnection if the connection drops.{' '}
				<span className="bg-cyan-500/10 px-1 rounded">
					The sweet spot for LLM token streaming, live feeds, and progress updates
				</span>
				. For simpler use cases where you just need raw bytes, see{' '}
				<a
					href={explorerHref('streaming')}
					className="text-zinc-600 dark:text-zinc-400 underline hover:text-cyan-700 dark:hover:text-cyan-500"
				>
					Text Stream
				</a>
				.
			</>
		),
		docsUrl: '/build/chat-and-streaming',
		category: 'io-patterns',
		component: SSEStreamDemo,
		codeExample: CODE_EXAMPLES['sse-stream'],
		sandboxEnabled: true,
		sandboxScript: 'sse-stream',
		sandboxInput: { prompt: 'Explain what Server-Sent Events are in 2-3 sentences.' },
		isRoute: true,
	},
	{
		id: 'websocket',
		title: 'WebSocket',
		subtitle: 'Bidirectional Communication',
		description: 'Real-time bidirectional messaging over a persistent connection.',
		explanation: (
			<>
				WebSockets give you a <em>persistent, bidirectional</em> connection between client and
				server. Unlike SSE, both sides can send messages at any time.{' '}
				<span className="bg-cyan-500/10 px-1 rounded">
					Use WebSockets when the server needs to receive messages without a new HTTP request
				</span>
				. Define <em>open</em>, <em>message</em>, and <em>close</em> handlers, then call your
				Agentuity service clients or app code from inside them. For one-way streaming, see{' '}
				<a
					href={explorerHref('sse-stream')}
					className="text-zinc-600 dark:text-zinc-400 underline hover:text-cyan-700 dark:hover:text-cyan-500"
				>
					SSE Stream
				</a>
				.
			</>
		),
		docsUrl: '/build/chat-and-streaming',
		category: 'io-patterns',
		component: WebSocketDemo,
		codeExample: CODE_EXAMPLES.websocket,
		sandboxEnabled: true,
		sandboxScript: 'websocket',
		isRoute: true,
	},
	{
		id: 'webrtc',
		title: 'WebRTC Signaling',
		subtitle: 'Browser Peer Connections',
		description: 'Host the signaling route on Agentuity while browsers carry media peer-to-peer.',
		explanation: (
			<>
				Browser WebRTC sends media and data directly between peers, but the browsers still need
				a signaling route to exchange offers, answers, and ICE candidates.{' '}
				<span className="bg-cyan-500/10 px-1 rounded">
					Agentuity hosts the app and WebSocket relay
				</span>
				. The browser <em>RTCPeerConnection</em> carries camera, microphone, and data-channel
				traffic. Open the same room in another tab to connect. For server-to-client events, see{' '}
				<a
					href={explorerHref('sse-stream')}
					className="text-zinc-600 dark:text-zinc-400 underline hover:text-cyan-700 dark:hover:text-cyan-500"
				>
					SSE Stream
				</a>
				.
			</>
		),
		docsUrl: '/build/chat-and-streaming',
		category: 'io-patterns',
		component: WebRTCDemo,
		codeExample: CODE_EXAMPLES.webrtc,
		sandboxEnabled: true,
		sandboxScript: 'webrtc',
		isRoute: true,
	},
	{
		id: 'durable-stream',
		title: 'Durable Streams',
		subtitle: 'Shareable URLs',
		description: 'Generate content and get a permanent, shareable URL.',
		explanation: (
			<>
				Need to generate content and share it via URL? Durable streams let you write data (e.g.,
				text, files, AI output) to storage, then get a <em>permanent public URL</em> that anyone
				can access. Write your content, close the stream, and the URL stays accessible.{' '}
				<span className="bg-cyan-500/10 px-1 rounded">
					Great for exports, reports, and generated artifacts
				</span>
				. For real-time use cases where data streams in as it's generated, see{' '}
				<a
					href={explorerHref('sse-stream')}
					className="text-zinc-600 dark:text-zinc-400 underline hover:text-cyan-700 dark:hover:text-cyan-500"
				>
					SSE streaming
				</a>
				. Use <code className="bg-cyan-500/10 px-1 rounded">StreamClient</code> to create, list,
				and manage your streams.
			</>
		),
		docsUrl: '/services/storage/durable-streams',
		category: 'io-patterns',
		component: PersistentStreamDemo,
		codeExample: CODE_EXAMPLES['durable-stream'],
		sandboxEnabled: true,
		sandboxScript: 'durable-stream',
		isRoute: true,
	},
	{
		id: 'agent-calls',
		title: 'Agent Calls',
		subtitle: 'Composition Patterns',
		description: 'Compose focused functions from routes, queues, and schedules.',
		explanation: (
			<>
				Keep reusable work in focused functions, then call those functions from routes, queues,
				schedules, or other app code:{' '}
				<span className="bg-cyan-500/10 px-1 rounded">
					complex workflows stay easier to test when each step has one job
				</span>
				. Return results directly for request/response flows, or queue background work when a
				step should run after the response.
			</>
		),
		docsUrl: '/build/agents',
		category: 'io-patterns',
		component: AgentCallsDemo,
		codeExample: CODE_EXAMPLES['agent-calls'],
		sandboxEnabled: true,
		sandboxScript: 'agent-calls',
		sandboxInput: { name: 'Explorer' },
	},
	{
		id: 'schedules',
		title: 'Schedules',
		subtitle: 'Recurring Jobs',
		description: 'Run code on a schedule with delivery tracking built in.',
		explanation: (
			<>
				Schedules are platform-managed recurring jobs. Define a cron expression, point it at a
				destination, and inspect each attempt with <code>listDeliveries()</code>. The live demo
				creates one real schedule against{' '}
				<code className="bg-cyan-500/10 px-1 rounded">/api/hello</code>, waits for the first
				recorded delivery, then cleans it up.
			</>
		),
		docsUrl: '/services/schedules',
		category: 'services',
		component: SchedulesDemo,
		codeExample: CODE_EXAMPLES.schedules,
		sandboxEnabled: true,
		sandboxScript: 'schedule',
		sandboxInput: {
			expression: '* * * * *',
			destinationUrl: 'https://agentuity.dev/api/hello',
		},
	},
	// Examples - complete use cases
	{
		id: 'chat',
		title: 'Chat',
		subtitle: 'Multi-turn Conversation',
		description: 'Conversation memory that persists across messages.',
		explanation: (
			<>
				A conversation that remembers what was said before. Each message is a separate request,
				and the app stores recent turns in key-value storage so the next model call has the
				right context.{' '}
				<span className="bg-cyan-500/10 px-1 rounded">
					Key-value storage is enough for lightweight chat history
				</span>
				. See{' '}
				<a
					href={explorerHref('handler-context')}
					className="text-zinc-600 dark:text-zinc-400 underline hover:text-cyan-700 dark:hover:text-cyan-500"
				>
					Handler Context
				</a>{' '}
				for more on state management.
			</>
		),
		docsUrl: '/cookbook/patterns/chat-with-history',
		category: 'examples',
		component: ChatDemo,
		codeExample: CODE_EXAMPLES.chat,
		sandboxEnabled: true,
		sandboxScript: 'chat',
		sandboxInput: { message: 'What is Agentuity?' },
	},
	{
		id: 'model-arena',
		title: 'Model Arena',
		subtitle: 'LLM-as-Judge Comparison',
		description: 'Compare AI models using another AI as judge.',
		explanation: (
			<>
				Compare outputs from different AI models by{' '}
				<span className="bg-cyan-500/10 px-1 rounded">using another AI as the judge</span>.
				Generate content from multiple providers in parallel via the{' '}
				<a
					href={explorerHref('ai-gateway')}
					className="text-zinc-600 dark:text-zinc-400 underline hover:text-cyan-700 dark:hover:text-cyan-500"
				>
					AI Gateway
				</a>
				, then have a judge model score them on criteria you define: creativity, accuracy, tone,
				or whatever matters for your use case. Useful for comparing models or testing different
				prompts.
			</>
		),
		docsUrl: '/cookbook/patterns/llm-as-a-judge',
		category: 'examples',
		component: ModelArena,
		codeExample: CODE_EXAMPLES['model-arena'],
		sandboxEnabled: true,
		sandboxScript: 'model-arena',
		sandboxInput: { prompt: 'Write a creative one-liner about programming.' },
	},
	{
		id: 'queue',
		title: 'Queues',
		subtitle: 'Publish & Consume',
		description: 'Publish messages, receive with ack/nack, and explore the dead letter queue.',
		explanation: (
			<>
				Message queues decouple producers from consumers. Publish a message and a worker picks
				it up later, processes it, and acknowledges completion.{' '}
				<span className="bg-cyan-500/10 px-1 rounded">
					If processing fails, the message retries automatically
				</span>
				. After exhausting retries, it moves to the <em>dead letter queue</em> (DLQ) for
				inspection and replay. Use <em>QueueClient</em> from routes, workers, or scripts to
				create queues and publish messages.
			</>
		),
		docsUrl: '/services/queues',
		category: 'services',
		component: QueueDemo,
		codeExample: CODE_EXAMPLES.queue,
		sandboxEnabled: true,
		sandboxScript: 'queue',
	},
	{
		id: 'email',
		title: 'Email',
		subtitle: 'Send & Receive',
		description: 'Preview the email, send it to your inbox, and inspect delivery status.',
		explanation: (
			<>
				Send transactional emails using <em>EmailClient</em> with full control over HTML
				content, recipients, and attachments.{' '}
				<span className="bg-cyan-500/10 px-1 rounded">
					Preview the exact HTML first, then send it to an address you control
				</span>
				. The same API also supports managed inboxes, destinations, and inbound message
				inspection, so you can pair outbound sends with receive workflows when you need them.
			</>
		),
		docsUrl: '/services/email',
		category: 'services',
		component: EmailDemo,
		codeExample: CODE_EXAMPLES.email,
		sandboxEnabled: true,
		sandboxScript: 'email',
		sandboxInput: { template: 'welcome' },
	},
	{
		id: 'database',
		title: 'Database',
		subtitle: 'Drizzle ORM',
		description: 'Query a PostgreSQL database with type-safe Drizzle ORM.',
		explanation: (
			<>
				Query a real PostgreSQL database using <em>Drizzle ORM</em> for type-safe, composable
				queries.{' '}
				<span className="bg-cyan-500/10 px-1 rounded">
					Define your schema in TypeScript and query with full autocompletion
				</span>
				. The same chairs from the{' '}
				<a
					href="/explorer/vector-storage"
					className="text-zinc-600 dark:text-zinc-400 underline hover:text-cyan-700 dark:hover:text-cyan-500"
				>
					Vector Search
				</a>{' '}
				demo are stored here in a relational table. Vector found them by meaning, this finds
				them by exact criteria: price ranges, ratings, and keywords.
			</>
		),
		docsUrl: '/services/database',
		category: 'services',
		component: DatabaseDemo,
		codeExample: CODE_EXAMPLES.database,
		sandboxEnabled: true,
		sandboxScript: 'database',
		sandboxInput: { query: 'summary', seedData: true },
	},
];

export function getDemoById(id: string): DemoConfig | undefined {
	return DEMOS.find((d) => d.id === id);
}
