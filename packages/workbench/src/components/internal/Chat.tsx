/* eslint-disable @typescript-eslint/no-explicit-any */
import '../../styles.css';
import React, { useState } from 'react';
import {
	CheckIcon,
	ChevronRight,
	ChevronsUpDownIcon,
	Copy,
	Loader,
	RefreshCcw,
	FileJson,
} from 'lucide-react';
import { Action, Actions } from '../ai-elements/actions';
import {
	Conversation,
	ConversationContent,
	ConversationScrollButton,
} from '../ai-elements/conversation';
import { Message, MessageContent } from '../ai-elements/message';
import {
	PromptInput,
	PromptInputActionAddAttachments,
	PromptInputActionMenu,
	PromptInputActionMenuContent,
	PromptInputActionMenuTrigger,
	PromptInputBody,
	PromptInputFooter,
	PromptInputSubmit,
	PromptInputTextarea,
	PromptInputTools,
} from '../ai-elements/prompt-input';
import { Shimmer } from '../ai-elements/shimmer';
import { Button } from '../ui/button';
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from '../ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger } from '../ui/select';
import { cn } from '../../lib/utils';
import { useWorkbench } from './WorkbenchProvider';
import { Schema } from './Schema';

export interface ChatProps {
	className?: string;
}

/**
 * Chat component - conversation and input area (everything except header)
 * Must be used within WorkbenchProvider
 */
export function Chat({ className: _className }: ChatProps) {
	const {
		agents,
		suggestions,
		messages,
		selectedAgent,
		setSelectedAgent,
		isLoading,
		submitMessage,
	} = useWorkbench();

	const [agentSelectOpen, setAgentSelectOpen] = useState(false);
	const [value, setValue] = useState('');
	const [schemaOpen, setSchemaOpen] = useState(false);

	const handleSubmit = async () => {
		if (!value.trim()) return;
		await submitMessage(value);
		setValue('');
	};

	return (
		<div className="relative flex flex-1 overflow-hidden">
			<div
				className={cn(
					'flex flex-col flex-1 transition-all duration-300 ease-in-out min-w-0',
					schemaOpen && 'mr-[600px]'
				)}
			>
				<Conversation className="flex-1 overflow-y-auto">
					<ConversationContent className="pb-0">
						{messages.map(({ role, parts, id }) => {
							const isStreaming = parts.some(
								(part) => part.type === 'text' && part.state === 'streaming'
							);

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
													Ran for
													<span className="mx-1">2.9s</span>
													and consumed
													<span className="mx-1">124 tokens</span>
													<ChevronRight className="size-4" />
												</>
											)}
										</div>
									)}

									{!(isStreaming || isLoading) && (
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

				<div className="flex items-center gap-2 py-2 px-3">
					<Popover open={agentSelectOpen} onOpenChange={setAgentSelectOpen}>
						<PopoverTrigger asChild>
							<Button
								aria-expanded={agentSelectOpen}
								className="font-normal bg-transparent dark:bg-transparent"
								variant="outline"
								size="sm"
							>
								{agents[selectedAgent]?.metadata.name || 'Select agent'}
								<ChevronsUpDownIcon className="size-4 shrink-0 opacity-50" />
							</Button>
						</PopoverTrigger>
						<PopoverContent className="w-fit p-0">
							<Command>
								<CommandInput placeholder="Search agents..." />
								<CommandList>
									<CommandEmpty>No agents found.</CommandEmpty>
									<CommandGroup>
										{Object.values(agents).map((agent) => (
											<CommandItem
												key={agent.metadata.id}
												value={agent.metadata.id}
												onSelect={(currentValue) => {
													setSelectedAgent(currentValue);
													setAgentSelectOpen(false);
												}}
											>
												<CheckIcon
													className={cn(
														'size-4 text-green-500',
														selectedAgent === agent.metadata.id
															? 'opacity-100'
															: 'opacity-0'
													)}
												/>
												{agent.metadata.name}
											</CommandItem>
										))}
									</CommandGroup>
								</CommandList>
							</Command>
						</PopoverContent>
					</Popover>

					{suggestions.length > 0 && (
						<Select onValueChange={(value) => setValue(value)}>
							<SelectTrigger
								size="sm"
								className="ml-auto bg-transparent dark:bg-transparent text-foreground!"
							>
								Suggestions
							</SelectTrigger>
							<SelectContent className="text-sm" side="top" align="end">
								{suggestions.map((suggestion) => (
									<SelectItem key={suggestion} value={suggestion}>
										{suggestion}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					)}

					<Button
						aria-label="View Schema"
						size="sm"
						variant="outline"
						className="bg-none font-normal"
						onClick={() => setSchemaOpen(true)}
					>
						<FileJson className="size-4" /> Schema
					</Button>
				</div>

				<PromptInput onSubmit={handleSubmit} className="px-3 pb-3">
					<PromptInputBody>
						<PromptInputTextarea
							placeholder="Enter a message to send..."
							value={value}
							onChange={(e) => setValue(e.target.value)}
						/>
					</PromptInputBody>

					<PromptInputFooter>
						<PromptInputTools>
							<PromptInputActionMenu>
								<PromptInputActionMenuTrigger />
								<PromptInputActionMenuContent>
									<PromptInputActionAddAttachments />
								</PromptInputActionMenuContent>
							</PromptInputActionMenu>
						</PromptInputTools>

						<PromptInputSubmit
							disabled={isLoading}
							status={(isLoading ? 'loading' : 'ready') as any}
						/>
					</PromptInputFooter>
				</PromptInput>
			</div>

			<Schema open={schemaOpen} onOpenChange={setSchemaOpen} />
		</div>
	);
}

export default Chat;
