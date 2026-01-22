import { AgentuityProvider } from "@agentuity/react";
import {
	BookOpenIcon,
	ChevronLeftIcon,
} from "@heroicons/react/24/outline";
import { useCallback, useEffect, useState } from "react";
import { CODE_EXAMPLES } from "./code-examples";
import { TEST_OUTPUTS } from "./test-outputs";
import { AgentCallsDemo } from "./components/AgentCallsDemo";
import { AIGatewayDemo } from "./components/AIGatewayDemo";
import { ChatDemo } from "./components/ChatDemo";
import { CodeBlock, type LineHighlight } from "./components/CodeBlock";
import { CronDemo } from "./components/CronDemo";
import { EvalsDemo } from "./components/EvalsDemo";
import { HandlerContextDemo } from "./components/HandlerContextDemo";
import { HelloDemo } from "./components/HelloDemo";
import { KVExplorer } from "./components/KVExplorer";
import { ModelArena } from "./components/ModelArena";
import { ObjectStoreDemo } from "./components/ObjectStoreDemo";
import { PersistentStreamDemo } from "./components/PersistentStreamDemo";
import { SSEStreamDemo } from "./components/SSEStreamDemo";
import { StreamingDemo } from "./components/StreamingDemo";
import { TerminalOutput } from "./components/TerminalOutput";
import { ThemeProvider } from "./components/ThemeContext";
import { VectorSearch } from "./components/VectorSearch";
import { useSandboxRunner } from "./hooks/useSandboxRunner";

// Demo IDs for navigation
type DemoId =
	| "hello"
	| "handler-context"
	| "chat"
	| "key-value"
	| "vector-storage"
	| "model-arena"
	| "ai-gateway"
	| "sse-stream"
	| "streaming"
	| "durable-stream"
	| "cron"
	| "agent-calls"
	| "object-storage"
	| "evals";

// Demo configuration
interface DemoConfig {
	id: DemoId;
	title: string;
	subtitle: string;
	description: string; // Short description for landing page cards
	explanation: React.ReactNode; // 3-4 sentence educational explanation for detail page
	docsUrl?: string; // Link to relevant docs page
	category: "basics" | "services" | "io-patterns" | "examples";
	component: React.ComponentType;
	codeExample: string;
	sandboxEnabled?: boolean; // Whether code can be run in a cloud sandbox
	sandboxScript?: string; // Script name for sandbox execution (must match backend PREBAKED_SCRIPTS)
	sandboxInput?: unknown; // Input to pass when running the agent in sandbox
	codeHighlights?: LineHighlight[]; // Lines to highlight in the code example
}

const DEMOS: DemoConfig[] = [
	// Basics - fundamental concepts
	{
		id: "hello",
		title: "Hello Agent",
		subtitle: "Basic Request/Response",
		description: "Your first agent - send input, get output.",
		explanation: (
			<>
				An <em>agent</em> is code that receives input, processes it, and returns
				output. Unlike a simple function, agents can use tools, access storage,
				and maintain state across requests.{" "}
				<span className="bg-cyan-50 dark:bg-zinc-800 px-1 rounded">
					This is the building block of any Agentuity project
				</span>
				. Every agent follows the same pattern: the <em>schema</em> declares what
				goes in and comes out, the <em>handler</em> processes requests. Once
				you're comfortable here, explore the{" "}
				<a
					href="?handler-context"
					className="text-zinc-600 dark:text-zinc-400 underline hover:text-cyan-700 dark:hover:text-cyan-400"
				>
					Handler Context
				</a>{" "}
				to see what tools are available inside your handler.
			</>
		),
		docsUrl: "https://agentuity.dev/Agents/creating-agents",
		category: "basics",
		component: HelloDemo,
		codeExample: CODE_EXAMPLES.hello,
		sandboxEnabled: true,
		sandboxScript: "hello",
		sandboxInput: { name: "World" },
	},
	{
		id: "handler-context",
		title: "Handler Context",
		subtitle: "AgentContext Properties",
		description: "See what's available inside your agent handler.",
		explanation: (
			<>
				When your agent runs, it receives a <em>context object</em> (ctx) with
				everything you need:{" "}
				<span className="bg-cyan-50 dark:bg-zinc-800 px-1 rounded">
					logging, storage access, session info, and more
				</span>
				. Think of it as your agent's toolbox. Click the buttons below to see live
				responses from the API routes. The reference code on the right shows a
				simplified standalone example you can run in the sandbox.
			</>
		),
		docsUrl: "https://agentuity.dev/Reference/sdk-reference#context-api",
		category: "basics",
		component: HandlerContextDemo,
		codeExample: CODE_EXAMPLES["handler-context"],
		sandboxEnabled: true,
		sandboxScript: "handler-context",
	},
	// Services - storage and AI gateway
	{
		id: "key-value",
		title: "KV Storage",
		subtitle: "Key-Value Store",
		description: "Store and retrieve data by key, with auto-expiration.",
		explanation: (
			<>
				Store and retrieve data by key, like a dictionary. Set a value with a
				key, get it back later using that exact key. Optionally set a{" "}
				<em>TTL</em> (time-to-live), which tells the system to automatically
				delete the data after a set period, perfect for caching or temporary
				sessions.{" "}
				<span className="bg-zinc-300/15 px-1 rounded">
					Use KV when you know the exact key you're looking for
				</span>
				. For searching by meaning or similarity, use{" "}
				<a href="?vector-storage" className="text-zinc-600 dark:text-zinc-400 underline hover:text-cyan-700 dark:hover:text-cyan-400">
					Vector storage
				</a>{" "}
				instead.
			</>
		),
		docsUrl: "https://agentuity.dev/Services/Storage/key-value",
		category: "services",
		component: KVExplorer,
		codeExample: CODE_EXAMPLES["key-value"],
		sandboxEnabled: true,
		sandboxScript: "kv",
	},
	{
		id: "vector-storage",
		title: "Vector Search",
		subtitle: "Semantic Search",
		description: "Find content by meaning, not just keywords.",
		explanation: (
			<>
				Traditional searches match exact words. Search for 'comfortable chair'
				and you won't find 'ergonomic seating'. Vector search finds results by{" "}
				<strong>
					<em>meaning</em>
				</strong>{" "}
				instead. Your text gets converted to numbers (<em>embeddings</em>) that
				capture concepts, so <em>similar ideas cluster together</em>, even when
				the words are completely different.{" "}
				<span className="bg-cyan-50 dark:bg-zinc-800 px-1 rounded">
					Use vector search when you need to find content by meaning
				</span>{" "}
				rather than exact keywords. For exact key lookups, use{" "}
				<a href="?key-value" className="text-zinc-600 dark:text-zinc-400 underline hover:text-cyan-700 dark:hover:text-cyan-400">
					KV storage
				</a>{" "}
				instead.
			</>
		),
		docsUrl: "https://agentuity.dev/Services/Storage/vector",
		category: "services",
		component: VectorSearch,
		codeExample: CODE_EXAMPLES["vector-storage"],
		sandboxEnabled: true,
		sandboxScript: "vector",
		sandboxInput: { query: "comfortable chair" },
		codeHighlights: [
			{ lines: 16, className: "important" }, // document field - what gets searched
			{ lines: [21, 22], className: "important" }, // search call with query
		],
	},
	{
		id: "object-storage",
		title: "Object Storage",
		subtitle: "File Storage (Bun S3)",
		description: "Store files with presigned URLs for sharing.",
		explanation: (
			<>
				Need to store files like images, PDFs, or videos? That's what object
				storage is for, and it handles larger files with ease. Upload a file and
				get back a shareable URL.{" "}
				<span className="bg-cyan-50 dark:bg-zinc-800 px-1 rounded">
					Need temporary access? Generate presigned URLs
				</span>{" "}
				that expire automatically. Under the hood,
				this uses <em>S3-compatible storage</em> (a widely-used standard for file
				storage), so the patterns you learn here work anywhere. For simple
				key-value data, see{" "}
				<a href="?key-value" className="text-zinc-600 dark:text-zinc-400 underline hover:text-cyan-700 dark:hover:text-cyan-400">
					KV storage
				</a>
				.
			</>
		),
		docsUrl: "https://agentuity.dev/Services/Storage/object",
		category: "services",
		component: ObjectStoreDemo,
		codeExample: CODE_EXAMPLES["object-storage"],
		sandboxEnabled: true,
		sandboxScript: "objectstore",
	},
	{
		id: "ai-gateway",
		title: "AI Gateway",
		subtitle: "Multi-Provider Routing",
		description: "Use any AI provider with a single API key.",
		explanation: (
			<>
				Use any AI model from any provider (OpenAI, Anthropic, Google, etc.)
				with a <strong>single API key</strong>. No juggling multiple accounts
				or credentials.{" "}
				<span className="bg-cyan-50 dark:bg-zinc-800 px-1 rounded">
					The AI Gateway handles authentication, tracks usage, and lets you
					switch models
				</span>{" "}
				with minimal code changes. Just import the provider SDK and call it.
				Works seamlessly with the Vercel AI SDK for streaming and structured
				output.
			</>
		),
		docsUrl: "https://agentuity.dev/Agents/ai-gateway",
		category: "services",
		component: AIGatewayDemo,
		codeExample: CODE_EXAMPLES["ai-gateway"],
		sandboxEnabled: true,
		sandboxScript: "ai-gateway",
		sandboxInput: { prompt: "Explain AI agents in 1 sentence." },
	},
	// I/O Patterns - streaming and real-time
	{
		id: "streaming",
		title: "Text Stream",
		subtitle: "Raw Streaming",
		description: "Stream responses as they're generated.",
		explanation: (
			<>
				Stream data as it's generated instead of waiting for the complete
				response. This is <em>raw streaming</em>: bytes flow through as they're
				ready, with no extra structure added.{" "}
				<span className="bg-cyan-50 dark:bg-zinc-800 px-1 rounded">
					Perfect for simple LLM token streaming
				</span>{" "}
				where you just want text to appear word-by-word. If you need typed
				events, message IDs, or automatic reconnection, see{" "}
				<a
					href="?sse-stream"
					className="text-zinc-600 dark:text-zinc-400 underline hover:text-cyan-700 dark:hover:text-cyan-400"
				>
					SSE streaming
				</a>
				.
			</>
		),
		docsUrl: "https://agentuity.dev/Agents/streaming-responses",
		category: "io-patterns",
		component: StreamingDemo,
		codeExample: CODE_EXAMPLES.streaming,
		sandboxEnabled: true,
		sandboxScript: "streaming",
		sandboxInput: { prompt: "Write a short poem about coding." },
	},
	{
		id: "sse-stream",
		title: "SSE Stream",
		subtitle: "Server-Sent Events",
		description: "Structured streaming with event types and auto-reconnect.",
		explanation: (
			<>
				A one-way stream from your server to the user's browser, with structure
				built in. Unlike raw streaming, SSE gives you <em>typed events</em> (like
				"token" or "done"), message <em>IDs</em> for tracking, and automatic
				reconnection if the connection drops.{" "}
				<span className="bg-cyan-50 dark:bg-zinc-800 px-1 rounded">
					The sweet spot for LLM token streaming, live feeds, and progress
					updates
				</span>
				. For simpler use cases where you just need raw bytes, see{" "}
				<a
					href="?streaming"
					className="text-zinc-600 dark:text-zinc-400 underline hover:text-cyan-700 dark:hover:text-cyan-400"
				>
					Text Stream
				</a>
				.
			</>
		),
		docsUrl: "https://agentuity.dev/Routes/sse",
		category: "io-patterns",
		component: SSEStreamDemo,
		codeExample: CODE_EXAMPLES["sse-stream"],
		sandboxEnabled: true,
		sandboxScript: "sse-stream",
		sandboxInput: { prompt: "Explain what Server-Sent Events are in 2-3 sentences." },
	},
	{
		id: "durable-stream",
		title: "Durable Streams",
		subtitle: "Shareable URLs",
		description: "Generate content and get a permanent, shareable URL.",
		explanation: (
			<>
				Need to generate content and share it via URL? Durable streams let you
				write data (e.g., text, files, AI output) to storage, then get a{" "}
				<em>permanent public URL</em> that anyone can access. Write your content,
				close the stream, and the URL stays accessible.{" "}
				<span className="bg-cyan-50 dark:bg-zinc-800 px-1 rounded">
					Great for exports, reports, and generated artifacts
				</span>
				. For real-time use cases where data streams in as it's generated, see{" "}
				<a
					href="?sse-stream"
					className="text-zinc-600 dark:text-zinc-400 underline hover:text-cyan-700 dark:hover:text-cyan-400"
				>
					SSE streaming
				</a>
				. Use{" "}
				<code className="bg-cyan-50 dark:bg-zinc-800 px-1 rounded">ctx.stream</code> to
				create, list, and manage your streams.
			</>
		),
		docsUrl: "https://agentuity.dev/Services/Storage/durable-streams",
		category: "io-patterns",
		component: PersistentStreamDemo,
		codeExample: CODE_EXAMPLES["durable-stream"],
		sandboxEnabled: true,
		sandboxScript: "durable-stream",
	},
	{
		id: "agent-calls",
		title: "Agent Calls",
		subtitle: "Invocation Patterns",
		description: "Call agents from routes or other agents.",
		explanation: (
			<>
				Agents can call other agents, and routes can call agents too. Think of
				it like functions calling functions:{" "}
				<span className="bg-cyan-50 dark:bg-zinc-800 px-1 rounded">
					you can break complex workflows into focused, reusable pieces
				</span>
				. Use <code className="bg-cyan-50 dark:bg-zinc-800 px-1 rounded">agent.run()</code>{" "}
				to invoke any agent, wait for results synchronously, or use{" "}
				<em>ctx.waitUntil</em> for fire-and-forget background tasks.
			</>
		),
		docsUrl: "https://agentuity.dev/Agents/calling-other-agents",
		category: "io-patterns",
		component: AgentCallsDemo,
		codeExample: CODE_EXAMPLES["agent-calls"],
		sandboxEnabled: true,
		sandboxScript: "agent-calls",
		sandboxInput: { text: "  Hello!!!  World...  #testing   @demo  " },
	},
	{
		id: "cron",
		title: "Cron Jobs",
		subtitle: "Scheduled Tasks",
		description: "Run tasks on a schedule with cron expressions.",
		explanation: (
			<>
				Sometimes you need code to run automatically — every hour, every day, or
				on a custom schedule. That's what <em>cron jobs</em> do. The schedule is
				defined using a <em>cron expression</em> like{" "}
				<code className="bg-cyan-50 dark:bg-zinc-800 px-1 rounded">0 * * * *</code>, which
				reads as "minute hour day month weekday" (this one means "at minute 0 of
				every hour").{" "}
				<span className="bg-cyan-50 dark:bg-zinc-800 px-1 rounded">
					Use cron for recurring tasks
				</span>{" "}
				like fetching data, cleaning up old records, or sending reports. Combine
				with{" "}
				<a href="?key-value" className="text-zinc-600 dark:text-zinc-400 underline hover:text-cyan-700 dark:hover:text-cyan-400">
					KV storage
				</a>{" "}
				to cache results so you don't have to fetch them each time.
			</>
		),
		docsUrl: "https://agentuity.dev/Routes/cron",
		category: "io-patterns",
		component: CronDemo,
		codeExample: CODE_EXAMPLES.cron,
		sandboxEnabled: true,
		sandboxScript: "cron",
	},
	// Examples - complete use cases
	{
		id: "chat",
		title: "Chat",
		subtitle: "Multi-turn Conversation",
		description: "Conversation memory that persists across messages.",
		explanation: (
			<>
				A conversation that remembers what was said before. Each message you send
				is a separate request, but the agent keeps track of the full conversation
				using <em>thread state</em>. This lets the AI reference earlier messages
				and maintain context.{" "}
				<span className="bg-cyan-50 dark:bg-zinc-800 px-1 rounded">
					No database setup required; state management is built in
				</span>
				. See{" "}
				<a
					href="?handler-context"
					className="text-zinc-600 dark:text-zinc-400 underline hover:text-cyan-700 dark:hover:text-cyan-400"
				>
					Handler Context
				</a>{" "}
				for more on state management.
			</>
		),
		docsUrl: "https://agentuity.dev/Learn/Cookbook/Patterns/chat-with-history",
		category: "examples",
		component: ChatDemo,
		codeExample: CODE_EXAMPLES.chat,
		sandboxEnabled: true,
		sandboxScript: "chat",
		sandboxInput: { message: "What is Agentuity?" },
	},
	{
		id: "model-arena",
		title: "Model Arena",
		subtitle: "LLM-as-Judge Comparison",
		description: "Compare AI models using another AI as judge.",
		explanation: (
			<>
				Compare outputs from different AI models by{" "}
				<span className="bg-cyan-50 dark:bg-zinc-800 px-1 rounded">
					using another AI as the judge
				</span>
				. Generate content from multiple providers in parallel via the{" "}
				<a
					href="?ai-gateway"
					className="text-zinc-600 dark:text-zinc-400 underline hover:text-cyan-700 dark:hover:text-cyan-400"
				>
					AI Gateway
				</a>
				, then have a judge model score them on criteria you define: creativity,
				accuracy, tone, or whatever matters for your use case. Useful for
				comparing models or testing different prompts.
			</>
		),
		docsUrl: "https://agentuity.dev/Agents/schema-libraries",
		category: "examples",
		component: ModelArena,
		codeExample: CODE_EXAMPLES["model-arena"],
		sandboxEnabled: true,
		sandboxScript: "model-arena",
		sandboxInput: { prompt: "Write a creative one-liner about programming." },
	},
	{
		id: "evals",
		title: "Evals",
		subtitle: "Automatic Quality Checks",
		description: "Run evaluations after your agent responds.",
		explanation: (
			<>
				<em>Evaluations</em> are automated quality checks that run after your
				agent responds. They don't slow down your response; they execute in the
				background and results appear in the Agentuity console.{" "}
				<span className="bg-cyan-50 dark:bg-zinc-800 px-1 rounded">
					Two types: binary (pass/fail) and score (0-1)
				</span>
				. Use preset evals like <em>answer-completeness</em> or create custom
				evals with your own logic. Evals help you catch quality issues before
				users do and track performance over time.
			</>
		),
		docsUrl: "https://agentuity.dev/Agents/evaluations",
		category: "examples",
		component: EvalsDemo,
		codeExample: CODE_EXAMPLES.evals,
		sandboxEnabled: true,
		sandboxScript: "evals",
		sandboxInput: { question: "What is Agentuity and what are its main features?" },
	},
];

// Agentuity Logo component
function AgentuityLogo({ className }: { className?: string }) {
	return (
		<svg
			aria-hidden="true"
			aria-label="Agentuity Logo"
			className={className}
			fill="none"
			height="191"
			viewBox="0 0 220 191"
			width="220"
			xmlns="http://www.w3.org/2000/svg"
		>
			<path
				clipRule="evenodd"
				d="M220 191H0L31.427 136.5H0L8 122.5H180.5L220 191ZM47.5879 136.5L24.2339 177H195.766L172.412 136.5H47.5879Z"
				fill="#00FFFF"
				fillRule="evenodd"
			/>
			<path
				clipRule="evenodd"
				d="M110 0L157.448 82.5H189L197 96.5H54.5L110 0ZM78.7021 82.5L110 28.0811L141.298 82.5H78.7021Z"
				fill="#00FFFF"
				fillRule="evenodd"
			/>
		</svg>
	);
}

// Demo Card component
function DemoCard({
	demo,
	onClick,
}: {
	demo: DemoConfig;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			className="group bg-white dark:bg-black border border-zinc-200 dark:border-zinc-800 rounded-lg p-6 text-left
                 hover:border-zinc-400 dark:hover:border-zinc-600 transition-colors duration-200 cursor-pointer
                 flex flex-col items-start"
		>
			<h3 className="text-zinc-900 dark:text-white font-normal mb-1">{demo.title}</h3>
			<p className="text-cyan-700 dark:text-cyan-400 text-xs mb-3">{demo.subtitle}</p>
			<p className="text-zinc-500 text-sm leading-relaxed">
				{demo.description}
			</p>
		</button>
	);
}

// Landing page with card grid
function LandingPage({ onSelectDemo }: { onSelectDemo: (id: DemoId) => void }) {
	const basics = DEMOS.filter((d) => d.category === "basics");
	const services = DEMOS.filter((d) => d.category === "services");
	const ioPatterns = DEMOS.filter((d) => d.category === "io-patterns");
	const examples = DEMOS.filter((d) => d.category === "examples");

	return (
		<div className="max-w-6xl mx-auto px-6 py-12">
			{/* Header */}
			<header className="flex items-center gap-4 mb-12">
				<AgentuityLogo className="h-10 w-auto" />
				<div className="flex-1">
					<h1 className="text-3xl font-thin text-zinc-900 dark:text-white">SDK Explorer</h1>
					<p className="text-zinc-500 text-sm">Agentuity v1 SDK</p>
				</div>
			</header>

			{/* Basics Section */}
			<section className="mb-12">
				<h2 className="text-lg font-normal text-zinc-600 dark:text-zinc-400 mb-6">Basics</h2>
				<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
					{basics.map((demo) => (
						<DemoCard
							key={demo.id}
							demo={demo}
							onClick={() => onSelectDemo(demo.id)}
						/>
					))}
				</div>
			</section>

			{/* Services Section */}
			<section className="mb-12">
				<h2 className="text-lg font-normal text-zinc-600 dark:text-zinc-400 mb-6">Services</h2>
				<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
					{services.map((demo) => (
						<DemoCard
							key={demo.id}
							demo={demo}
							onClick={() => onSelectDemo(demo.id)}
						/>
					))}
				</div>
			</section>

			{/* I/O Patterns Section */}
			<section className="mb-12">
				<h2 className="text-lg font-normal text-zinc-600 dark:text-zinc-400 mb-6">I/O Patterns</h2>
				<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
					{ioPatterns.map((demo) => (
						<DemoCard
							key={demo.id}
							demo={demo}
							onClick={() => onSelectDemo(demo.id)}
						/>
					))}
				</div>
			</section>

			{/* Examples Section */}
			<section className="mb-12">
				<h2 className="text-lg font-normal text-zinc-600 dark:text-zinc-400 mb-6">Examples</h2>
				<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
					{examples.map((demo) => (
						<DemoCard
							key={demo.id}
							demo={demo}
							onClick={() => onSelectDemo(demo.id)}
						/>
					))}
				</div>
			</section>
		</div>
	);
}

// Demo view with split layout: demo on left, code on right
// Toggle TEST_MODE to preview terminal UI without running sandbox
const TEST_MODE = false;

function DemoView({ demo, onBack }: { demo: DemoConfig; onBack: () => void }) {
	const DemoComponent = demo.component;
	const sandbox = useSandboxRunner();

	// In test mode, show test output immediately on mount
	const testOutput = TEST_MODE && demo.sandboxScript
		? TEST_OUTPUTS[demo.sandboxScript] ?? null
		: null;

	const handleRun = useCallback(() => {
		if (!TEST_MODE && demo.sandboxScript) {
			sandbox.run(demo.sandboxScript, demo.sandboxInput);
		}
	}, [demo.sandboxScript, demo.sandboxInput, sandbox.run]);

	// Reset sandbox state when navigating away
	useEffect(() => {
		return () => {
			sandbox.reset();
		};
	}, [sandbox.reset]);

	const isRunning =
		sandbox.state.status === "creating" ||
		sandbox.state.status === "running";

	// Use test output if in test mode, otherwise use real sandbox output
	const output = testOutput ?? sandbox.state.output;
	const status = testOutput ? "completed" : sandbox.state.status;

	return (
		<div className="min-h-screen flex flex-col">
			{/* Header: Back navigation */}
			<header className="flex items-center justify-between px-6 py-3 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950">
				<button
					type="button"
					onClick={onBack}
					className="flex items-center px-2 py-1 rounded text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-200/50 dark:hover:bg-zinc-800/50 transition-colors cursor-pointer"
				>
					<ChevronLeftIcon className="w-4 h-4 mr-1.5" />
					<span>Back to Explorer</span>
				</button>
			</header>

			{/* Split layout: top/bottom on mobile, left/right on desktop */}
			<div className="flex-1 flex flex-col lg:grid lg:grid-cols-[55fr_45fr] min-h-0">
				{/* Top (mobile) / Left (desktop): Interactive demo */}
				<div className="flex-1 lg:h-full overflow-auto lg:border-r border-b lg:border-b-0 border-zinc-200 dark:border-zinc-800 p-4 min-w-0">
					{/* Explanation block with docs link - min-height for visual consistency across pages */}
					<div className="bg-white dark:bg-black border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden mb-4 min-h-[140px]">
						{/* Header bar - mirrors CodeBlock header style */}
						<div className="flex items-center justify-between px-4 h-12 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-100/50 dark:bg-zinc-900/50">
							<h2 className="text-lg font-normal text-cyan-700 dark:text-cyan-400">
								{demo.title}
							</h2>
							{demo.docsUrl && (
								<button
									type="button"
									onClick={() => {
										// Ask parent to navigate via postMessage
										const url = demo.docsUrl as string;
										const path = url.startsWith('http')
											? new URL(url).pathname + new URL(url).hash
											: url;
										window.parent.postMessage({ type: 'NAVIGATE', path }, '*');
									}}
									className="flex items-center gap-1.5 text-zinc-500 hover:text-cyan-500 dark:hover:text-cyan-300 transition-colors cursor-pointer"
								>
									<BookOpenIcon className="w-5 h-5" />
									<span className="text-sm">Docs</span>
								</button>
							)}
						</div>
						{/* Description body */}
						<div className="px-4 py-4">
							<p className="text-zinc-600 dark:text-zinc-400 text-sm leading-relaxed">
								{demo.explanation}
							</p>
						</div>
					</div>

					{/* Interactive demo component */}
					<DemoComponent />
				</div>

				{/* Bottom (mobile) / Right (desktop): Code example */}
				<div className="flex-1 lg:h-full overflow-auto p-4 min-w-0 flex flex-col gap-4">
					{demo.sandboxEnabled ? (
						<>
							<CodeBlock
								code={demo.codeExample}
								title="Reference Code"
								showRunButton
								onRun={handleRun}
								isRunning={isRunning}
								highlights={demo.codeHighlights}
							/>
							<TerminalOutput
								output={output}
								status={status}
								error={sandbox.state.error}
								exitCode={testOutput ? 0 : sandbox.state.exitCode}
								onClear={sandbox.reset}
							/>
						</>
					) : (
						<CodeBlock
							code={demo.codeExample}
							title="Reference Code"
							highlights={demo.codeHighlights}
						/>
					)}
				</div>
			</div>
		</div>
	);
}

// Helper to get demo ID from URL (e.g., ?ai-gateway)
function getDemoFromUrl(): DemoId | null {
	const search = window.location.search.slice(1); // Remove leading "?"
	const demoIds = DEMOS.map((d) => d.id);
	if (demoIds.includes(search as DemoId)) {
		return search as DemoId;
	}
	return null;
}

// Main App component
export function App() {
	const [activeDemo, setActiveDemo] = useState<DemoId | null>(getDemoFromUrl);

	// Handle browser back/forward navigation
	useEffect(() => {
		const handlePopState = () => {
			setActiveDemo(getDemoFromUrl());
		};
		window.addEventListener("popstate", handlePopState);
		return () => window.removeEventListener("popstate", handlePopState);
	}, []);

	// Select a demo and update URL
	const selectDemo = useCallback((demoId: DemoId) => {
		setActiveDemo(demoId);
		window.history.pushState({}, "", `?${demoId}`);
	}, []);

	// Go back to landing page and clear URL
	const goBack = useCallback(() => {
		setActiveDemo(null);
		window.history.pushState({}, "", window.location.pathname);
	}, []);

	// If a demo is selected, show full-page view
	if (activeDemo) {
		const demo = DEMOS.find((d) => d.id === activeDemo);
		if (demo) {
			return (
				<ThemeProvider>
					<div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
						<AgentuityProvider>
							<DemoView demo={demo} onBack={goBack} />
						</AgentuityProvider>
					</div>
				</ThemeProvider>
			);
		}
	}

	// Landing page with card grid
	return (
		<ThemeProvider>
			<div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
				<AgentuityProvider>
					<LandingPage onSelectDemo={selectDemo} />
				</AgentuityProvider>
			</div>
		</ThemeProvider>
	);
}
