import { Link } from '@tanstack/react-router';
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
	category: 'app-basics' | 'services' | 'streaming-realtime' | 'agents';
	component: React.ComponentType;
	codeExample: string;
	sandboxEnabled?: boolean;
	sandboxScript?: string;
	sandboxInput?: unknown;
	codeHighlights?: LineHighlight[];
	isRoute?: boolean;
}

export const DEMOS: DemoConfig[] = [
	// App basics - fundamental concepts
	{
		id: 'hello',
		title: 'Hello World',
		subtitle: 'App route',
		description: 'Send JSON to a server route and return a typed response.',
		explanation: (
			<>
				A route is server code that receives a request and returns a response. This demo sends
				JSON to a Hono route, validates the body, logs the request, and returns a typed
				response.{' '}
				<span className="bg-cyan-500/10 px-1 rounded">
					Start here before adding storage, model calls, or background work
				</span>
				. Once you're comfortable here, explore{' '}
				<Link
					to={explorerHref('handler-context')}
					className="text-zinc-600 dark:text-zinc-400 underline hover:text-cyan-700 dark:hover:text-cyan-500"
				>
					Route Context
				</Link>{' '}
				to see request data, logging, and service clients.
			</>
		),
		docsUrl: '/build/apps-and-apis/backend-apis',
		category: 'app-basics',
		component: HelloDemo,
		codeExample: CODE_EXAMPLES.hello,
		sandboxEnabled: true,
		sandboxScript: 'hello',
		sandboxInput: { name: 'World' },
	},
	{
		id: 'handler-context',
		title: 'Route Context',
		subtitle: 'Hono context',
		description: 'See request data, injected services, and app-owned state in a Hono route.',
		explanation: (
			<>
				Route context is the object your Hono handler receives for one request. It carries the
				incoming request, lets you read Agentuity services from <code>c.var.*</code>, and gives
				you the boundary where route code calls shared app logic.{' '}
				<span className="bg-cyan-500/10 px-1 rounded">
					Start here to see what lives in the framework context
				</span>
				. Use the buttons below to inspect one part at a time, then compare the response with
				the code on the right.
			</>
		),
		docsUrl: '/frameworks/hono',
		category: 'app-basics',
		component: HandlerContextDemo,
		codeExample: CODE_EXAMPLES['handler-context'],
		sandboxEnabled: true,
		sandboxScript: 'handler-context',
	},
	// Services - managed platform services
	{
		id: 'key-value',
		title: 'KV Storage',
		subtitle: 'Key-Value Store',
		description: 'Store and retrieve data by key, with auto-expiration.',
		explanation: (
			<>
				Key-value storage is for exact lookups: save a value under a namespace and key, then
				read it back with that same key. This demo loads sample records, lists the keys, and
				shows the stored JSON value.{' '}
				<span className="bg-zinc-300/15 px-1 rounded">
					Use KV for preferences, cache entries, counters, and short-lived state
				</span>
				. For searching by meaning or similarity, use{' '}
				<Link
					to={explorerHref('vector-storage')}
					className="text-zinc-600 dark:text-zinc-400 underline hover:text-cyan-700 dark:hover:text-cyan-500"
				>
					Vector storage
				</Link>{' '}
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
				<Link
					to={explorerHref('key-value')}
					className="text-zinc-600 dark:text-zinc-400 underline hover:text-cyan-700 dark:hover:text-cyan-500"
				>
					KV storage
				</Link>{' '}
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
		subtitle: 'Agentuity Storage',
		description: 'Store files with the SDK, and generate share URLs from Bun routes.',
		explanation: (
			<>
				Object storage is for files and blobs, not small JSON records. This demo reads linked
				<code> AWS_*</code> bucket env with <code>@agentuity/storage</code>, then uses Bun's{' '}
				<code>S3Client</code> only for temporary share URLs.
				<span className="bg-cyan-500/10 px-1 rounded">
					{' Use it for files such as uploads, reports, images, and generated artifacts '}
				</span>
				when the data is a file people or systems need to download. For exact-key JSON state,
				see{' '}
				<Link
					to={explorerHref('key-value')}
					className="text-zinc-600 dark:text-zinc-400 underline hover:text-cyan-700 dark:hover:text-cyan-500"
				>
					KV storage
				</Link>
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
				AI Gateway lets a route call supported provider models through one Agentuity project
				credential. This demo sends the same prompt to selected models in parallel and streams
				each response as it arrives, so you can compare output shape, latency, and token
				estimates.{' '}
				<span className="bg-cyan-500/10 px-1 rounded">
					Check supported models before choosing app defaults
				</span>
				.
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
	// Streaming and realtime
	{
		id: 'streaming',
		title: 'Text Stream',
		subtitle: 'Raw Streaming',
		description: "Stream responses as they're generated.",
		explanation: (
			<>
				Raw streaming sends text chunks as soon as they are generated. This demo reads a
				response body stream and appends each chunk to the page, without event names or
				reconnect metadata.{' '}
				<span className="bg-cyan-500/10 px-1 rounded">
					Use it when you only need text to appear quickly
				</span>{' '}
				and the browser doesn't need typed events. If you need event names, completion events,
				or browser-managed reconnects, see{' '}
				<Link
					to={explorerHref('sse-stream')}
					className="text-zinc-600 dark:text-zinc-400 underline hover:text-cyan-700 dark:hover:text-cyan-500"
				>
					SSE streaming
				</Link>
				.
			</>
		),
		docsUrl: '/build/agents/chat-and-streaming',
		category: 'streaming-realtime',
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
				Server-Sent Events are a structured one-way stream from your server to the browser. This
				demo receives named events such as <code>chunk</code> and <code>done</code> through{' '}
				<code>EventSource</code>, then uses the done event to finish cleanly.{' '}
				<span className="bg-cyan-500/10 px-1 rounded">
					Use SSE for LLM output, progress updates, and live feeds
				</span>
				. For simpler use cases where you only need raw text chunks, see{' '}
				<Link
					to={explorerHref('streaming')}
					className="text-zinc-600 dark:text-zinc-400 underline hover:text-cyan-700 dark:hover:text-cyan-500"
				>
					Text Stream
				</Link>
				.
			</>
		),
		docsUrl: '/build/agents/chat-and-streaming',
		category: 'streaming-realtime',
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
				WebSockets keep one bidirectional connection open so the browser and server can both
				send messages. This demo connects, sends a message, receives echoes and heartbeats, and
				reconnects after connection loss.{' '}
				<span className="bg-cyan-500/10 px-1 rounded">
					Use WebSockets when clients must send live input without opening a new HTTP request
				</span>
				. For one-way server updates, see{' '}
				<Link
					to={explorerHref('sse-stream')}
					className="text-zinc-600 dark:text-zinc-400 underline hover:text-cyan-700 dark:hover:text-cyan-500"
				>
					SSE Stream
				</Link>
				.
			</>
		),
		docsUrl: '/build/agents/chat-and-streaming',
		category: 'streaming-realtime',
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
				WebRTC carries audio, video, or data directly between browsers, but peers still need a
				signaling route to exchange connection details. This demo uses Agentuity-hosted
				WebSocket signaling to join a room.{' '}
				<span className="bg-cyan-500/10 px-1 rounded">
					The browser RTCPeerConnection carries media and data peer-to-peer
				</span>
				. Open the same room in another tab to connect. For server-to-client events, see{' '}
				<Link
					to={explorerHref('sse-stream')}
					className="text-zinc-600 dark:text-zinc-400 underline hover:text-cyan-700 dark:hover:text-cyan-500"
				>
					SSE Stream
				</Link>
				.
			</>
		),
		docsUrl: '/build/agents/chat-and-streaming',
		category: 'streaming-realtime',
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
				Durable streams save generated output as it is written, then keep the finished result
				available by URL. This demo starts an AI summary, polls until content exists, and adds
				the completed stream to a history list.{' '}
				<span className="bg-cyan-500/10 px-1 rounded">
					Use durable streams when generated output needs to outlive the request
				</span>
				. For live browser output that doesn't need a saved URL, see{' '}
				<Link
					to={explorerHref('sse-stream')}
					className="text-zinc-600 dark:text-zinc-400 underline hover:text-cyan-700 dark:hover:text-cyan-500"
				>
					SSE streaming
				</Link>
				.
			</>
		),
		docsUrl: '/services/storage/durable-streams',
		category: 'streaming-realtime',
		component: PersistentStreamDemo,
		codeExample: CODE_EXAMPLES['durable-stream'],
		sandboxEnabled: true,
		sandboxScript: 'durable-stream',
		isRoute: true,
	},
	{
		id: 'agent-calls',
		title: 'Agent Calls',
		subtitle: 'Calling focused agents',
		description: 'Compose focused functions from routes, queues, and schedules.',
		explanation: (
			<>
				An agent is focused model-backed code with a clear task. This demo compares three ways a
				route can call that code: wait for a direct result, hand work to the background, or
				chain one focused step into the next.{' '}
				<span className="bg-cyan-500/10 px-1 rounded">
					The caller owns timing; the agent owns the task
				</span>
				.
			</>
		),
		docsUrl: '/build/agents',
		category: 'agents',
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
				Schedules run an HTTP destination on a cron expression and keep delivery records. This
				demo creates one managed schedule against{' '}
				<code className="bg-cyan-500/10 px-1 rounded">/api/hello</code>, waits for the first
				recorded delivery, then deletes it. Use schedules for recurring jobs such as syncs,
				cleanup, reports, and polling external systems.
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
	// Agents - model-backed patterns
	{
		id: 'chat',
		title: 'Chat',
		subtitle: 'Multi-turn Conversation',
		description: 'Conversation memory that persists across messages.',
		explanation: (
			<>
				Chat is a repeated model call with memory. This demo stores recent turns in key-value
				storage, then includes that history on the next request so the model can answer with
				context.{' '}
				<span className="bg-cyan-500/10 px-1 rounded">
					Use this shape for lightweight chat history
				</span>
				. Use{' '}
				<Link
					to="/build/agents/state-and-memory"
					className="text-zinc-600 dark:text-zinc-400 underline hover:text-cyan-700 dark:hover:text-cyan-500"
				>
					State and Memory
				</Link>{' '}
				when the state needs stronger ownership, search, or retention rules.
			</>
		),
		docsUrl: '/cookbook/patterns/chat-with-history',
		category: 'agents',
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
				Model Arena compares model outputs with a second model acting as judge. This demo runs
				the same prompt through multiple providers via the{' '}
				<Link
					to={explorerHref('ai-gateway')}
					className="text-zinc-600 dark:text-zinc-400 underline hover:text-cyan-700 dark:hover:text-cyan-500"
				>
					AI Gateway
				</Link>
				, then scores the answers against criteria.{' '}
				<span className="bg-cyan-500/10 px-1 rounded">
					Use it for early prompt and model evaluation
				</span>{' '}
				before you turn the same idea into repeatable tests.
			</>
		),
		docsUrl: '/cookbook/patterns/llm-as-a-judge',
		category: 'agents',
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
				Queues decouple the route that publishes work from the worker that processes it. This
				demo creates a queue, publishes sample messages, shows ack/nack behavior, and exposes
				the dead letter queue after failures.{' '}
				<span className="bg-cyan-500/10 px-1 rounded">
					Use queues when work can run after the request returns or needs retries
				</span>
				. Use schedules when time, not an incoming request, starts the work.
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
				Email lets your app send outbound messages and inspect delivery state. This demo
				previews a transactional email, sends it to an address you control, and reads delivery
				status so the UI can show what happened.{' '}
				<span className="bg-cyan-500/10 px-1 rounded">
					Use it for emails such as receipts, notifications, invites, and inbound flows
				</span>
				.
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
				Relational databases are for structured data you query by fields and relationships. This
				demo stores the same product catalog used in Vector Search in PostgreSQL, then queries
				it with Drizzle by price, rating, and keywords.{' '}
				<span className="bg-cyan-500/10 px-1 rounded">
					Use a database when exact filters and transactions matter
				</span>
				. Use{' '}
				<Link
					to="/explorer/vector-storage"
					className="text-zinc-600 dark:text-zinc-400 underline hover:text-cyan-700 dark:hover:text-cyan-500"
				>
					Vector Search
				</Link>{' '}
				when meaning matters more than exact fields.
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
