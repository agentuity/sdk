import '../../styles.css';
import React, { useState } from 'react';
import { ChevronRight, Copy, Loader, RefreshCcw } from 'lucide-react';
import { Action, Actions } from '../ai-elements/actions';
import {
	Conversation,
	ConversationContent,
	ConversationScrollButton,
} from '../ai-elements/conversation';
import { Message, MessageContent } from '../ai-elements/message';
import { InputSection } from './InputSection';
import { Shimmer } from '../ai-elements/shimmer';
import { cn } from '../../lib/utils';
import { useWorkbench } from './WorkbenchProvider';
import { useLogger } from '../../hooks/useLogger';

export interface ChatProps {
	className?: string;
}

/**
 * Chat component - conversation and input area (everything except header)
 * Must be used within WorkbenchProvider
 */
export function Chat({ className: _className }: ChatProps) {
	const logger = useLogger('Chat');
	const {
		agents,
		suggestions,
		messages,
		selectedAgent,
		setSelectedAgent,
		isLoading,
		submitMessage,
		schemaPanel,
	} = useWorkbench();

	const [value, setValue] = useState('');

	const handleSubmit = async () => {
		logger.debug('🎯 Chat handleSubmit - selectedAgent:', selectedAgent, 'value:', value);
		const selectedAgentData = Object.values(agents).find(
			(agent) => agent.metadata.agentId === selectedAgent
		);
		logger.debug('📊 Chat handleSubmit - selectedAgentData:', selectedAgentData);
		const hasInputSchema = selectedAgentData?.schema?.input?.json;
		logger.debug('📝 Chat handleSubmit - hasInputSchema:', hasInputSchema);

		// If agent has no input schema, submit without requiring input
		if (!hasInputSchema) {
			await submitMessage('');
			return;
		}

		// For agents with input schema, require input
		if (!value.trim()) return;
		await submitMessage(value);
		setValue('');
	};

	return (
		<div className="flex flex-col flex-1 overflow-hidden">
				<Conversation className="flex-1 overflow-y-auto">
					<ConversationContent className="pb-0">
						{messages.map((message) => {
							const { role, parts, id } = message;
							const isStreaming = parts.some(
								(part) => part.type === 'text' && part.state === 'streaming'
							);
							const tokens =
								'tokens' in message ? (message as { tokens?: string }).tokens : undefined;
							const duration =
								'duration' in message
									? (message as { duration?: string }).duration
									: undefined;

							return (
								<div key={id} className="mb-2">
									{role === 'assistant' && (
										<div
											className={cn(
												'w-fit flex items-center mb-2 text-muted-foreground text-sm transition-colors',
												!isStreaming && 'hover:text-foreground cursor-pointer'
											)}
										>
											<Loader
												className={cn(
													'size-4 transition-all',
													isStreaming || isLoading ? 'animate-spin mr-2' : 'w-0 mr-2.5'
												)}
											/>

											{isStreaming || isLoading ? (
												<Shimmer duration={1}>Running...</Shimmer>
											) : (
												<>
													{duration && (
														<>
															Ran for
															<span className="mx-1">{duration}</span>
														</>
													)}
													{duration && tokens && ` and consumed  ${tokens} tokens`}
													{(duration || tokens) && <ChevronRight className="size-4" />}
												</>
											)}
										</div>
									)}

									{(role === 'user' || !(isStreaming || isLoading)) && (
										<>
											<Message
												key={id}
												from={role as 'user' | 'system' | 'assistant'}
												className="p-0"
											>
												<MessageContent>
													{parts.map((part, index) => {
														switch (part.type) {
															case 'text':
																return (
																	<div key={`${id}-${part.text}-${index}`}>
																		{part.text || ''}
																	</div>
																);
														}
													})}
												</MessageContent>
											</Message>

											<Actions
												className={cn('mt-1 gap-0', role === 'user' && 'justify-end')}
											>
												{role === 'user' && (
													<Action
														label="Retry"
														className="size-8 hover:bg-transparent!"
														onClick={() =>
															setValue(
																parts
																	.filter((part) => part.type === 'text')
																	.map((part) => part.text)
																	.join('')
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
																.filter((part) => part.type === 'text')
																.map((part) => part.text)
																.join('')
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

					<ConversationScrollButton />
				</Conversation>
				<InputSection
					value={value}
					onChange={setValue}
					onSubmit={handleSubmit}
					isLoading={isLoading}
					agents={agents}
					selectedAgent={selectedAgent}
					setSelectedAgent={setSelectedAgent}
					suggestions={suggestions}
					isSchemaOpen={schemaPanel.isOpen}
					onSchemaToggle={schemaPanel.toggle}
				/>
		</div>
	);
}

export default Chat;
