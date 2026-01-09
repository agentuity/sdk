import { useAPI } from "@agentuity/react";
import { useEffect, useRef, useState } from "react";
import Markdown from "react-markdown";
import { ChatCodeBlock } from "./ChatCodeBlock";

interface Message {
	id: string;
	role: "user" | "assistant";
	content: string;
}

export function ChatDemo() {
	const [messages, setMessages] = useState<Message[]>([]);
	const [input, setInput] = useState("");
	const [threadInfo, setThreadInfo] = useState<{
		threadId: string;
		turnCount: number;
	} | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<Error | null>(null);
	const messagesEndRef = useRef<HTMLDivElement>(null);
	const messagesContainerRef = useRef<HTMLDivElement>(null);

	const { invoke, isLoading: running } = useAPI("POST /api/chat");

	// Load conversation history on mount
	useEffect(() => {
		const loadHistory = async () => {
			try {
				const result = await invoke({ message: "", command: "history" });
				if (result) {
					setThreadInfo({
						threadId: result.threadId,
						turnCount: result.turnCount,
					});

					// Parse history if it exists
					if (result.response && result.response !== "No conversation history yet.") {
						const parsed: Message[] = [];
						const lines = result.response.split("\n\n");
						for (const line of lines) {
							if (line.startsWith("user: ")) {
								parsed.push({
									id: `hist-user-${parsed.length}`,
									role: "user",
									content: line.slice(6),
								});
							} else if (line.startsWith("assistant: ")) {
								parsed.push({
									id: `hist-asst-${parsed.length}`,
									role: "assistant",
									content: line.slice(11),
								});
							}
						}
						setMessages(parsed);
					}
				}
			} catch (err) {
				// Silent fail on history load - not critical
				console.error("Failed to load history:", err);
			} finally {
				setLoading(false);
			}
		};
		loadHistory();
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	// biome-ignore lint/correctness/useExhaustiveDependencies: scroll when messages change
	useEffect(() => {
		// Scroll container to bottom instead of using scrollIntoView (which scrolls the page)
		const container = messagesContainerRef.current;
		if (container) {
			container.scrollTop = container.scrollHeight;
		}
	}, [messages]);

	const sendMessage = async () => {
		if (!input.trim() || running) return;

		const userMessage = input.trim();
		setInput("");
		setError(null);

		// Add user message immediately for responsive UI
		const userMsgId = `user-${Date.now()}`;
		setMessages((prev) => [
			...prev,
			{ id: userMsgId, role: "user", content: userMessage },
		]);

		try {
			const result = await invoke({ message: userMessage });
			if (result) {
				setMessages((prev) => [
					...prev,
					{
						id: `asst-${Date.now()}`,
						role: "assistant",
						content: result.response,
					},
				]);
				setThreadInfo({ threadId: result.threadId, turnCount: result.turnCount });
			}
		} catch (err) {
			setError(err instanceof Error ? err : new Error("Unknown error"));
		}
	};

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			sendMessage();
		}
	};

	const resetConversation = async () => {
		setError(null);
		try {
			await invoke({ message: "", command: "reset" });
			setMessages([]);
			setThreadInfo(null);
		} catch (err) {
			setError(err instanceof Error ? err : new Error("Unknown error"));
		}
	};

	return (
		<div className="flex flex-col gap-4">
			{/* Messages */}
			<div className="bg-white dark:bg-black border border-zinc-200 dark:border-zinc-900 rounded-lg flex flex-col h-[400px] overflow-hidden">
				<div ref={messagesContainerRef} className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
					{loading ? (
						<div className="text-zinc-500 dark:text-zinc-600 text-center p-8 text-sm">
							Loading conversation...
						</div>
					) : messages.length === 0 ? (
						<div className="text-zinc-500 dark:text-zinc-600 text-center p-8 text-sm">
							Start a conversation. The agent remembers context across messages.
						</div>
					) : (
						messages.map((msg) => (
							<div
								key={msg.id}
								className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
							>
								<div
									className={`rounded-xl text-sm leading-relaxed max-w-[80%] px-4 py-3 ${
										msg.role === "user"
											? "bg-blue-100 dark:bg-blue-900/50 border border-blue-300 dark:border-blue-500 text-zinc-900 dark:text-white whitespace-pre-wrap"
											: "bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-white"
									}`}
								>
									{msg.role === "user" ? (
										msg.content
									) : (
										<Markdown
											components={{
												p: ({ children }) => (
													<p className="my-2 first:mt-0 last:mb-0">
														{children}
													</p>
												),
												strong: ({ children }) => (
													<strong className="font-semibold">{children}</strong>
												),
												// Handle both inline code and fenced code blocks
												code: ({ className, children }) => {
													// Fenced code blocks have className like "language-typescript"
													const match = /language-(\w+)/.exec(className || "");
													const isCodeBlock = Boolean(match);

													if (isCodeBlock) {
														const language = match?.[1] || "typescript";
														const code = String(children).replace(/\n$/, "");
														return <ChatCodeBlock code={code} language={language} />;
													}

													// Inline code
													return (
														<code className="bg-zinc-200 dark:bg-zinc-800 px-1.5 py-0.5 rounded text-cyan-700 dark:text-cyan-400 text-xs">
															{children}
														</code>
													);
												},
												// Let code component handle pre content
												pre: ({ children }) => <>{children}</>,
												ul: ({ children }) => (
													<ul className="list-disc pl-5 my-2">{children}</ul>
												),
												ol: ({ children }) => (
													<ol className="list-decimal pl-5 my-2">{children}</ol>
												),
												li: ({ children }) => (
													<li className="my-1">{children}</li>
												),
											}}
										>
											{msg.content}
										</Markdown>
									)}
								</div>
							</div>
						))
					)}
					{running && (
						<div className="flex justify-start">
							<div className="bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-zinc-500 text-sm px-4 py-3">
								Thinking...
							</div>
						</div>
					)}
					<div ref={messagesEndRef} />
				</div>

				{/* Input */}
				<div className="border-t border-zinc-200 dark:border-zinc-900 flex gap-2 p-4">
					<label htmlFor="chat-input" className="sr-only">Message</label>
					<input
						id="chat-input"
						type="text"
						value={input}
						onChange={(e) => setInput(e.target.value)}
						onKeyDown={handleKeyDown}
						placeholder="Ask about Agentuity..."
						disabled={running}
						className="flex-1 bg-zinc-100 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-800 rounded-md text-zinc-900 dark:text-white text-sm px-4 py-3 outline-none focus:border-cyan-500 dark:focus:border-cyan-400"
					/>
					<button
						onClick={sendMessage}
						disabled={running || !input.trim()}
						type="button"
						className={`rounded-md text-sm font-medium px-6 py-3 ${
							running || !input.trim()
								? "bg-zinc-200 dark:bg-zinc-900 text-zinc-500 dark:text-zinc-600 cursor-not-allowed"
								: "bg-cyan-500 dark:bg-cyan-400 text-white dark:text-black cursor-pointer hover:bg-cyan-400 dark:hover:bg-cyan-300"
						}`}
					>
						Send
					</button>
					<button
						onClick={resetConversation}
						disabled={running}
						type="button"
						className={`bg-zinc-200 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-800 rounded-md text-zinc-600 dark:text-zinc-400 text-xs px-3 py-2 ${
							running
								? "opacity-50 cursor-not-allowed"
								: "cursor-pointer hover:border-zinc-400 dark:hover:border-zinc-600"
						}`}
					>
						Reset
					</button>
				</div>
			</div>
			{threadInfo && (
				<div className="text-zinc-500 dark:text-zinc-600 text-xs">
					Thread: {threadInfo.threadId.slice(0, 20)}... | Turns:{" "}
					{threadInfo.turnCount}
				</div>
			)}

			{/* Error display */}
			{error && (
				<div className="bg-red-100 dark:bg-red-950 border border-red-300 dark:border-red-900 rounded-lg text-red-700 dark:text-red-300 text-sm p-4">
					Error: {error.message}
				</div>
			)}

		</div>
	);
}
