import { useCallback, useState } from "react";
import Markdown from "react-markdown";

interface ModelResponse {
	model: string;
	content: string;
	duration: number;
	tokens: number;
	isEstimate: boolean;
	status: "pending" | "streaming" | "done" | "error";
	error?: string;
}

// Estimate token count from text (~4 chars per token for English text)
function estimateTokens(text: string): number {
	if (!text) return 0;
	return Math.ceil(text.length / 4);
}

// Parse x-agentuity-tokens header: "model1:count1 model2:count2"
function parseTokensHeader(header: string): number {
	let total = 0;
	for (const entry of header.split(" ")) {
		const [, count] = entry.split(":");
		if (count) total += Number.parseInt(count, 10) || 0;
	}
	return total;
}

// Note: Google/Gemini excluded due to streaming issues (see issue #248)
const AVAILABLE_MODELS = [
	{ id: "gpt-5-nano", label: "GPT-5 Nano", provider: "OpenAI" },
	{ id: "gpt-5-mini", label: "GPT-5 Mini", provider: "OpenAI" },
	{ id: "claude-haiku-4-5", label: "Claude Haiku", provider: "Anthropic" },
	{ id: "claude-sonnet-4-5", label: "Claude Sonnet", provider: "Anthropic" },
	{ id: "llama-3.3-70b-versatile", label: "Llama 3.3 70B", provider: "Groq" },
];

// Fixed prompt used by the backend
const FIXED_PROMPT = "What is backpropagation and why does it matter for AI?";

export function AIGatewayDemo() {
	const [selectedModels, setSelectedModels] = useState<string[]>([
		"gpt-5-nano",
		"claude-haiku-4-5",
	]);
	const [responses, setResponses] = useState<ModelResponse[]>([]);
	const [isRunning, setIsRunning] = useState(false);

	const toggleModel = (modelId: string) => {
		setSelectedModels((prev) =>
			prev.includes(modelId)
				? prev.filter((id) => id !== modelId)
				: [...prev, modelId],
		);
	};

	const runComparison = useCallback(async () => {
		if (selectedModels.length < 2) return;

		setIsRunning(true);
		setResponses(
			selectedModels.map((model) => ({
				model,
				content: "",
				duration: 0,
				tokens: 0,
				isEstimate: true,
				status: "pending",
			})),
		);

		// Run all models in parallel
		await Promise.all(
			selectedModels.map(async (model, index) => {
				const startTime = Date.now();

				// Update to streaming status
				setResponses((prev) =>
					prev.map((r, i) =>
						i === index ? { ...r, status: "streaming" as const } : r,
					),
				);

				try {
					const response = await fetch("/api/ai-gateway/compare", {
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({ model }),
					});

					if (!response.ok) {
						throw new Error(`HTTP ${response.status}`);
					}

					if (!response.body) {
						throw new Error("No response body");
					}

					const reader = response.body.getReader();
					const decoder = new TextDecoder();
					let content = "";

					while (true) {
						const { done, value } = await reader.read();
						if (done) break;

						content += decoder.decode(value, { stream: true });
						setResponses((prev) =>
							prev.map((r, i) =>
								i === index
									? {
											...r,
											content,
											duration: Date.now() - startTime,
											tokens: estimateTokens(content),
											isEstimate: true,
										}
									: r,
							),
						);
					}

					// TODO: Verify this works - HTTP headers are sent before body, so this may
					// not capture tokens for streaming responses. SSEStreamDemo gets tokens from
					// the "done" event data instead. If this doesn't work, consider always
					// showing "(est.)" for raw streaming responses.
					const tokensHeader = response.headers.get("x-agentuity-tokens");
					const actualTokens = tokensHeader
						? parseTokensHeader(tokensHeader)
						: 0;

					setResponses((prev) =>
						prev.map((r, i) =>
							i === index
								? {
										...r,
										content,
										duration: Date.now() - startTime,
										tokens: actualTokens || estimateTokens(content),
										isEstimate: !actualTokens,
										status: "done" as const,
									}
								: r,
						),
					);
				} catch (error) {
					setResponses((prev) =>
						prev.map((r, i) =>
							i === index
								? {
										...r,
										status: "error" as const,
										error:
											error instanceof Error ? error.message : "Unknown error",
										duration: Date.now() - startTime,
									}
								: r,
						),
					);
				}
			}),
		);

		setIsRunning(false);
	}, [selectedModels]);

	const getModelLabel = (modelId: string) => {
		return AVAILABLE_MODELS.find((m) => m.id === modelId)?.label ?? modelId;
	};

	const getProviderColor = (modelId: string) => {
		const provider = AVAILABLE_MODELS.find((m) => m.id === modelId)?.provider;
		switch (provider) {
			case "OpenAI":
				return "text-green-600 dark:text-green-400";
			case "Anthropic":
				return "text-orange-600 dark:text-orange-400";
			case "Google":
				return "text-blue-600 dark:text-blue-400";
			case "Groq":
				return "text-purple-600 dark:text-purple-400";
			default:
				return "text-zinc-500 dark:text-zinc-400";
		}
	};

	return (
		<div className="flex flex-col gap-4">
			{/* Model Selection */}
			<div className="bg-white dark:bg-black border border-zinc-200 dark:border-zinc-900 rounded-lg p-6">
				<div className="flex flex-col gap-4">
					{/* Model Selection */}
					<div>
						<span className="text-zinc-500 dark:text-zinc-400 block text-xs mb-2 uppercase">
							Select Models (minimum 2)
						</span>
						<div className="flex flex-wrap gap-2">
							{AVAILABLE_MODELS.map((model) => (
								<button
									key={model.id}
									onClick={() => toggleModel(model.id)}
									disabled={isRunning}
									type="button"
									className={`rounded-md text-xs px-3 py-2 transition-colors ${
										selectedModels.includes(model.id)
											? "bg-zinc-300 dark:bg-zinc-700 border-2 border-zinc-400 dark:border-zinc-500 text-zinc-900 dark:text-white"
											: "bg-zinc-100 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-800 text-zinc-500 hover:border-zinc-400 dark:hover:border-zinc-600"
									} ${isRunning ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
								>
									<span className={getProviderColor(model.id)}>
										{model.provider}
									</span>
									<span className="text-zinc-500 mx-1">/</span>
									<span className="font-mono">{model.id}</span>
								</button>
							))}
						</div>
						{selectedModels.length < 2 && (
							<p className="text-amber-600 dark:text-yellow-500 text-xs mt-2">
								Select at least 2 models to compare
							</p>
						)}
					</div>

					{/* Prompt Display */}
					<div>
						<span className="text-zinc-500 dark:text-zinc-400 block text-xs mb-2 uppercase">
							Prompt
						</span>
						<div className="bg-zinc-100 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-800 rounded-md text-zinc-700 dark:text-zinc-300 text-sm px-3 py-2">
							{FIXED_PROMPT}
						</div>
					</div>

					{/* Run Button */}
					<button
						onClick={runComparison}
						disabled={isRunning || selectedModels.length < 2}
						type="button"
						className={`rounded-md text-sm font-medium px-6 py-3 self-start ${
							isRunning || selectedModels.length < 2
								? "bg-zinc-100 dark:bg-zinc-900 text-zinc-500 dark:text-zinc-600 cursor-not-allowed"
								: "bg-cyan-500 dark:bg-cyan-400 text-white dark:text-black cursor-pointer hover:bg-cyan-400 dark:hover:bg-cyan-300"
						}`}
					>
						{isRunning ? "Running..." : "Compare Models"}
					</button>
				</div>
			</div>

			{/* Results - fixed height container to prevent layout shift during streaming */}
			{responses.length > 0 && (
				<div className="h-[500px] overflow-y-auto">
					<div className="grid grid-cols-1 md:grid-cols-2 gap-4 h-full">
						{responses.map((response) => (
							<div
								key={response.model}
								className={`bg-white dark:bg-black border rounded-lg overflow-hidden ${
									response.status === "error"
										? "border-red-300 dark:border-red-900"
										: response.status === "done"
											? "border-zinc-300 dark:border-zinc-800"
											: "border-zinc-200 dark:border-zinc-900"
								}`}
							>
								{/* Model Header */}
								<div className="border-b border-zinc-200 dark:border-zinc-900 px-4 py-3 flex justify-between items-center">
									<div>
										<span className={getProviderColor(response.model)}>
											{
												AVAILABLE_MODELS.find((m) => m.id === response.model)
													?.provider
											}
										</span>
										<span className="text-zinc-500 mx-2">/</span>
										<span className="text-zinc-900 dark:text-white">
											{getModelLabel(response.model)}
										</span>
									</div>
									<div className="flex items-center gap-2">
										{response.status === "streaming" && (
											<>
												<span className="text-zinc-500 dark:text-zinc-600 text-xs">
													{response.tokens} tokens (est.)
												</span>
												<div className="w-2 h-2 rounded-full bg-cyan-500 dark:bg-cyan-400 animate-pulse" />
											</>
										)}
										{response.status === "done" && (
											<span className="text-zinc-500 text-xs">
												{response.tokens} tokens
												{response.isEstimate ? " (est.)" : ""} ·{" "}
												{response.duration}ms
											</span>
										)}
										{response.status === "error" && (
											<span className="text-red-600 dark:text-red-400 text-xs">Error</span>
										)}
									</div>
								</div>

								{/* Response Content */}
								<div className="p-4 h-[350px] overflow-y-auto">
									{response.status === "pending" && (
										<div className="text-zinc-500 dark:text-zinc-600 text-sm">Waiting...</div>
									)}
									{response.status === "error" && (
										<div className="text-red-600 dark:text-red-400 text-sm">{response.error}</div>
									)}
									{(response.status === "streaming" ||
										response.status === "done") && (
										<div className="text-zinc-700 dark:text-zinc-300 text-sm">
											<Markdown
												components={{
													p: ({ children }) => (
														<p className="my-2">{children}</p>
													),
													h1: ({ children }) => (
														<h1 className="text-lg font-semibold my-3 text-zinc-900 dark:text-white">
															{children}
														</h1>
													),
													h2: ({ children }) => (
														<h2 className="text-base font-semibold my-3 text-zinc-900 dark:text-white">
															{children}
														</h2>
													),
													h3: ({ children }) => (
														<h3 className="text-sm font-semibold my-2 text-zinc-900 dark:text-white">
															{children}
														</h3>
													),
													ul: ({ children }) => (
														<ul className="list-disc pl-5 my-2">{children}</ul>
													),
													ol: ({ children }) => (
														<ol className="list-decimal pl-5 my-2">
															{children}
														</ol>
													),
													li: ({ children }) => (
														<li className="my-0.5">{children}</li>
													),
													strong: ({ children }) => (
														<strong className="font-semibold text-zinc-900 dark:text-white">
															{children}
														</strong>
													),
													em: ({ children }) => (
														<em className="italic">{children}</em>
													),
													code: ({ children }) => (
														<code className="bg-zinc-200 dark:bg-zinc-800 px-1 py-0.5 rounded text-cyan-700 dark:text-cyan-400 text-xs">
															{children}
														</code>
													),
												}}
											>
												{response.content}
											</Markdown>
											{response.status === "streaming" && (
												<span className="inline-block w-0.5 h-4 bg-cyan-500 dark:bg-cyan-400 ml-0.5 animate-pulse" />
											)}
										</div>
									)}
								</div>
							</div>
						))}
					</div>
				</div>
			)}

		</div>
	);
}
