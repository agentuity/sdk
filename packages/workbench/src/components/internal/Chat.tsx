import { ChevronRight, Copy, Loader, RefreshCcw } from "lucide-react";
import { useState } from "react";
import { useLogger } from "../../hooks/useLogger";
import { cn, formatErrorForCopy } from "../../lib/utils";
import { Action, Actions } from "../ai-elements/actions";
import { CodeBlock } from "../ai-elements/code-block";
import {
	Conversation,
	ConversationContent,
	ConversationScrollButton,
} from "../ai-elements/conversation";
import { Message, MessageContent } from "../ai-elements/message";
import { Shimmer } from "../ai-elements/shimmer";
import { InputSection } from "./InputSection";
import { useWorkbench } from "./WorkbenchProvider";

export interface ChatProps {
	className?: string;
	emptyState?: React.ReactNode;
	onSchemaToggle: () => void;
	onSessionOpen?: (sessionId: string) => void;
	schemaOpen: boolean;
}

export function Chat({
	className: _className,
	emptyState,
	onSchemaToggle,
	onSessionOpen,
	schemaOpen,
}: ChatProps) {
	const {
		agents,
		clearAgentState,
		connectionStatus,
		isLoading,
		messages,
		selectedAgent,
		setSelectedAgent,
		submitMessage,
	} = useWorkbench();
	const logger = useLogger("Chat");
	const [value, setValue] = useState("");

	const handleSubmit = async () => {
		logger.debug(
			"🎯 Chat handleSubmit - selectedAgent:",
			selectedAgent,
			"value:",
			value,
		);

		const selectedAgentData = Object.values(agents).find(
			(agent) => agent.metadata.agentId === selectedAgent,
		);

		logger.debug(
			"📊 Chat handleSubmit - selectedAgentData:",
			selectedAgentData,
		);

		const hasInputSchema = selectedAgentData?.schema?.input?.json;

		logger.debug("📝 Chat handleSubmit - hasInputSchema:", hasInputSchema);

		// If agent has no input schema, submit without requiring input
		if (!hasInputSchema) {
			await submitMessage("");

			return;
		}

		// For agents with input schema, require input
		if (!value.trim()) {
			return;
		}

		await submitMessage(value);

		setValue("");
	};

	return (
		<div className="relative flex flex-col h-full w-full overflow-hidden">
			<Conversation className="flex-1 overflow-y-auto" id="chat-conversation">
				{connectionStatus === "disconnected" && emptyState ? (
					<div className="flex flex-col h-full">{emptyState}</div>
				) : (
					<ConversationContent>
						{messages.map((message) => {
							const { role, parts, id } = message;

							const isStreaming = parts.some(
								(part) => part.type === "text" && part.state === "streaming",
							);

							const tokens =
								"tokens" in message
									? (message as { tokens?: string }).tokens
									: undefined;

							const duration =
								"duration" in message
									? (message as { duration?: string }).duration
									: undefined;

							const sessionId =
								"sessionId" in message
									? (message as { sessionId?: string }).sessionId
									: undefined;

							// Check for agent error in text content
							let errorInfo:
								| {
										message: string;
										stack?: string;
										code?: string;
										cause?: unknown;
								  }
								| undefined;

							if (parts.length === 1 && parts[0].type === "text") {
								const text = parts[0].text;

								if (text.startsWith("{") && text.includes('"__agentError"')) {
									try {
										const parsed = JSON.parse(text) as {
											__agentError?: boolean;
											message?: string;
											stack?: string;
											code?: string;
											cause?: unknown;
										};

										if (parsed.__agentError) {
											errorInfo = {
												message: parsed.message || "Unknown error",
												stack: parsed.stack,
												code: parsed.code,
												cause: parsed.cause,
											};
										}
									} catch {
										// Not valid JSON, ignore
									}
								}
							}

							return (
								<div key={id} className="mb-2">
									{role === "assistant" && (
										<div className="w-fit flex items-center mb-2 text-muted-foreground text-sm transition-colors">
											<Loader
												className={cn(
													"size-4 transition-all",
													isStreaming ? "animate-spin mr-2" : "w-0 mr-2.5",
												)}
											/>

											{isStreaming ? (
												<Shimmer duration={1}>Running...</Shimmer>
											) : (
												<button
													type="button"
													className={cn(
														"flex items-center bg-transparent border-none p-0 text-inherit",
														sessionId &&
															onSessionOpen &&
															"hover:text-foreground transition-colors cursor-pointer",
													)}
													onClick={() =>
														sessionId && onSessionOpen?.(sessionId)
													}
													tabIndex={0}
													aria-label="Open session"
													disabled={!sessionId}
													style={{ background: "none" }}
												>
													{duration ? (
														<>
															Ran for
															<span className="mx-1">{duration}</span>
														</>
													) : (
														<>Finished</>
													)}

													{duration && tokens && (
														<>
															and consumed
															<span className="mx-1">{tokens}</span> tokens
														</>
													)}

													{sessionId && onSessionOpen && (
														<ChevronRight className="size-4" />
													)}
												</button>
											)}
										</div>
									)}

									{(role === "user" || !isStreaming) && (
										<>
											<Message
												key={id}
												from={role as "user" | "system" | "assistant"}
												className="p-0"
											>
												<MessageContent
													className={cn(errorInfo && "bg-destructive/10")}
												>
													{errorInfo ? (
														errorInfo.stack ? (
															<pre className="font-mono whitespace-pre-wrap overflow-x-auto text-destructive">
																{errorInfo.stack}
															</pre>
														) : (
															<p className="font-mono whitespace-pre-wrap overflow-x-auto text-destructive">
																{errorInfo.message || "Unknown error"}
															</p>
														)
													) : (
														parts.map((part, index) => {
															switch (part.type) {
																case "text":
																	// json?
																	if (
																		part.text.startsWith("{") &&
																		part.text.endsWith("}")
																	) {
																		try {
																			const json = JSON.parse(part.text);

																			// json!
																			return (
																				<CodeBlock
																					key={`${id}-${part.text}-${index}`}
																					code={JSON.stringify(json, null, 2)}
																					language="json"
																					className="bg-transparent border-0 [&>div>div>pre]:bg-transparent! [&_pre]:p-0!"
																				/>
																			);
																		} catch (_error) {
																			// not json :(
																			return (
																				<div
																					key={`${id}-${part.text}-${index}`}
																				>
																					{part.text || ""}
																				</div>
																			);
																		}
																	}

																	// text/markdown
																	return (
																		<div key={`${id}-${part.text}-${index}`}>
																			{part.text || ""}
																		</div>
																	);
																default:
																	return null;
															}
														})
													)}
												</MessageContent>
											</Message>

											<Actions
												className={cn(
													"mt-1 gap-0",
													role === "user" && "justify-end",
												)}
											>
												{role === "user" && (
													<Action
														tooltip="Re-run"
														label="Re-run"
														className="size-8 hover:bg-transparent!"
														onClick={() =>
															setValue(
																parts
																	.filter((part) => part.type === "text")
																	.map((part) => part.text)
																	.join(""),
															)
														}
													>
														<RefreshCcw className="size-4" />
													</Action>
												)}

												<Action
													tooltip="Copy to clipboard"
													label="Copy to clipboard"
													className="size-8 hover:bg-transparent!"
													onClick={() => {
														const text = errorInfo
															? formatErrorForCopy(errorInfo)
															: parts
																	.filter((part) => part.type === "text")
																	.map((part) => part.text)
																	.join("");

														navigator.clipboard.writeText(text);
													}}
												>
													<Copy className="size-4" />
												</Action>
											</Actions>
										</>
									)}
								</div>
							);
						})}
					</ConversationContent>
				)}

				<ConversationScrollButton />
			</Conversation>

			<InputSection
				agents={agents}
				clearAgentState={clearAgentState}
				isLoading={isLoading}
				isSchemaOpen={schemaOpen}
				onChange={setValue}
				onSchemaToggle={onSchemaToggle}
				onSubmit={handleSubmit}
				selectedAgent={selectedAgent}
				setSelectedAgent={setSelectedAgent}
				value={value}
			/>
		</div>
	);
}

export default Chat;
