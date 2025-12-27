import { Copy, Loader, RefreshCcw } from "lucide-react";
import { useState } from "react";
import { useLogger } from "../../hooks/useLogger";
import { cn } from "../../lib/utils";
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
	schemaOpen: boolean;
}

export function Chat({
	className: _className,
	emptyState,
	onSchemaToggle,
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
		suggestions,
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

							return (
								<div key={id} className="mb-2">
									{role === "assistant" && (
										<div
											className={cn(
												"w-fit flex items-center mb-2 text-muted-foreground text-sm transition-colors",
												// !isStreaming && "hover:text-foreground cursor-pointer",
											)}
										>
											<Loader
												className={cn(
													"size-4 transition-all",
													isStreaming ? "animate-spin mr-2" : "w-0 mr-2.5",
												)}
											/>

											{isStreaming ? (
												<Shimmer duration={1}>Running...</Shimmer>
											) : (
												<>
													{duration && (
														<>
															Ran for
															<span className="mx-1">{duration}</span>
														</>
													)}
													{duration &&
														tokens &&
														`and consumed ${tokens} tokens`}

													{/* {(duration || tokens) && (
														<ChevronRight className="size-4" />
													)} */}
												</>
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
												<MessageContent>
													{parts.map((part, index) => {
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
																			<div key={`${id}-${part.text}-${index}`}>
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
													})}
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
														label="Retry"
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
													onClick={() =>
														navigator.clipboard.writeText(
															parts
																.filter((part) => part.type === "text")
																.map((part) => part.text)
																.join(""),
														)
													}
													label="Copy"
													className="size-8 hover:bg-transparent!"
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
				suggestions={suggestions}
				value={value}
			/>
		</div>
	);
}

export default Chat;
