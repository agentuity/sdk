import React, { useMemo, useState, useCallback, useEffect } from 'react';
import {
	CheckIcon,
	ChevronsUpDownIcon,
	FileJson,
	SendIcon,
	Loader2Icon,
	Sparkles,
	Trash2,
} from 'lucide-react';
import { MonacoJsonEditor } from './MonacoJsonEditor';
import {
	PromptInput,
	PromptInputBody,
	PromptInputFooter,
	PromptInputTextarea,
} from '../ai-elements/prompt-input';
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
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';
import { cn } from '../../lib/utils';
import type { AgentSchemaData } from '../../hooks/useAgentSchemas';
import { useLogger } from '../../hooks/useLogger';
import type { JSONSchema7 } from 'ai';
import { useWorkbench } from './WorkbenchProvider';
import { convertJsonSchemaToZod } from 'zod-from-json-schema';

export interface InputSectionProps {
	value: string;
	onChange: (value: string) => void;
	onSubmit: () => void | Promise<void>;
	isLoading: boolean;
	agents: Record<string, AgentSchemaData>;
	selectedAgent: string;
	setSelectedAgent: (agentId: string) => void;
	suggestions: string[];
	isSchemaOpen: boolean;
	onSchemaToggle: () => void;
	clearAgentState?: (agentId: string) => Promise<void>;
}

function isSchemaRootObject(schemaJson?: JSONSchema7): boolean {
	if (!schemaJson) return false;
	try {
		return (
			schemaJson.type === 'object' ||
			(schemaJson.type === undefined && schemaJson.properties !== undefined)
		);
	} catch {
		return false;
	}
}

export function InputSection({
	value,
	onChange,
	onSubmit,
	isLoading,
	agents,
	selectedAgent,
	setSelectedAgent,
	suggestions,
	isSchemaOpen,
	onSchemaToggle,
	clearAgentState,
}: InputSectionProps) {
	const logger = useLogger('InputSection');
	const { generateSample, isGeneratingSample, isAuthenticated } = useWorkbench();
	const [agentSelectOpen, setAgentSelectOpen] = useState(false);
	const [isValidInput, setIsValidInput] = useState(true);
	const [monacoHasErrors, setMonacoHasErrors] = useState<boolean | null>(null);

	const selectedAgentData = Object.values(agents).find(
		(agent) => agent.metadata.agentId === selectedAgent
	);

	// Determine input type for switch case
	const inputType = useMemo(() => {
		const schema = selectedAgentData?.schema?.input?.json;
		logger.debug(
			'🎛️ InputSection - selectedAgent:',
			selectedAgent,
			'selectedAgentData:',
			selectedAgentData,
			'schema:',
			schema
		);
		if (!schema) {
			return 'none'; // Agent has no input schema
		}
		if (isSchemaRootObject(schema)) {
			return 'object'; // Complex object schema
		}
		if (schema.type === 'string') {
			return 'string'; // String schema
		}
		return 'none'; // Default to none for other types
	}, [selectedAgentData?.schema.input?.json, logger]);

	const isObjectSchema = inputType === 'object';

	// Validate JSON input against schema using zod (fallback for non-Monaco cases)
	const validateInput = useCallback(
		(inputValue: string, schema?: JSONSchema7): boolean => {
			if (!schema || !isObjectSchema || !inputValue.trim()) {
				return true; // No validation needed or empty input
			}

			try {
				// Parse JSON first
				const parsedJson = JSON.parse(inputValue);

				// Convert schema to zod and validate
				const schemaObject = typeof schema === 'string' ? JSON.parse(schema) : schema;
				const zodSchema = convertJsonSchemaToZod(schemaObject);

				// Validate with zod
				const result = zodSchema.safeParse(parsedJson);
				return result.success;
			} catch {
				// JSON parse error or schema validation error
				return false;
			}
		},
		[isObjectSchema]
	);

	// Reset Monaco error state when schema changes
	useEffect(() => {
		if (isObjectSchema) {
			setMonacoHasErrors(null);
		}
	}, [selectedAgentData?.schema?.input?.json, isObjectSchema]);

	// Update validation state - use Monaco errors if available, otherwise fall back to zod validation
	useEffect(() => {
		if (isObjectSchema) {
			if (monacoHasErrors !== null) {
				// Monaco is handling validation, use its error state
				setIsValidInput(!monacoHasErrors);
			} else {
				// Monaco hasn't reported yet, use zod validation as fallback
				const isValid = validateInput(value, selectedAgentData?.schema?.input?.json);
				setIsValidInput(isValid);
			}
		} else {
			// No schema or not object schema
			setIsValidInput(true);
		}
	}, [
		value,
		selectedAgentData?.schema?.input?.json,
		validateInput,
		isObjectSchema,
		monacoHasErrors,
	]);

	const handleGenerateSample = async () => {
		if (!selectedAgentData?.schema.input?.json || !isObjectSchema || !selectedAgent) return;

		try {
			const sampleJson = await generateSample(selectedAgent);
			onChange(sampleJson);
		} catch (error) {
			logger.error('Failed to generate sample JSON:', error);
			console.error('Failed to generate sample JSON:', error);
		}
	};

	// Memoized submit disabled condition for readability
	const isSubmitDisabled = useMemo(() => {
		if (isLoading) return true;
		if (inputType === 'string' && !value.trim()) return true;
		if (inputType === 'object' && (!isValidInput || !value.trim())) return true;
		return false;
	}, [isLoading, inputType, value, isValidInput]);

	return (
		<>
			<div className="flex items-center gap-2 py-2 px-3">
				<Popover open={agentSelectOpen} onOpenChange={setAgentSelectOpen}>
					<PopoverTrigger asChild>
						<Button
							aria-expanded={agentSelectOpen}
							className="font-normal bg-transparent dark:bg-transparent"
							variant="outline"
							size="sm"
						>
							{Object.values(agents).find(
								(agent) => agent.metadata.agentId === selectedAgent
							)?.metadata.name || 'Select agent'}
							<ChevronsUpDownIcon className="size-4 shrink-0 opacity-50" />
						</Button>
					</PopoverTrigger>
					<PopoverContent className="w-fit p-0">
						<Command>
							<CommandInput placeholder="Search agents..." />
							<CommandList>
								<CommandEmpty>No agents found.</CommandEmpty>
								<CommandGroup>
									{Object.values(agents)
										.sort((a, b) => a.metadata.name.localeCompare(b.metadata.name))
										.map((agent) => {
											const isSelected = selectedAgent === agent.metadata.agentId;
											// Use name for search but include agentId to ensure uniqueness
											const searchValue = `${agent.metadata.name}|${agent.metadata.agentId}`;
											return (
												<CommandItem
													key={agent.metadata.agentId}
													value={searchValue}
													onSelect={(currentValue) => {
														// Extract agentId from the compound value
														const agentId = currentValue.split('|')[1];
														const selectedAgentData = Object.values(agents).find(
															(a) => a.metadata.agentId === agentId
														);
														if (selectedAgentData) {
															logger.debug(
																'🎯 Agent selected by name:',
																agent.metadata.name,
																'agentId:',
																agentId
															);
															setSelectedAgent(agentId);
														}
														setAgentSelectOpen(false);
													}}
												>
													<CheckIcon
														className={cn(
															'size-4 text-green-500',
															isSelected ? 'opacity-100' : 'opacity-0'
														)}
													/>
													{agent.metadata.name}
												</CommandItem>
											);
										})}
								</CommandGroup>
							</CommandList>
						</Command>
					</PopoverContent>
				</Popover>

				{suggestions.length > 0 && (
					<Select onValueChange={(value) => onChange(value)}>
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

				{isObjectSchema &&
					(isAuthenticated ? (
						<Button
							aria-label="Generate Sample JSON"
							size="sm"
							variant="outline"
							className="bg-none font-normal"
							onClick={handleGenerateSample}
							disabled={isGeneratingSample || !isAuthenticated}
						>
							{isGeneratingSample ? (
								<Loader2Icon className="size-4 animate-spin" />
							) : (
								<Sparkles className="size-4" />
							)}{' '}
							Sample
						</Button>
					) : (
						<Tooltip>
							<TooltipTrigger asChild>
								<span className="inline-flex">
									<Button
										aria-label="Generate Sample JSON"
										size="sm"
										variant="outline"
										className="bg-none font-normal"
										onClick={handleGenerateSample}
										disabled={isGeneratingSample || !isAuthenticated}
									>
										{isGeneratingSample ? (
											<Loader2Icon className="size-4 animate-spin" />
										) : (
											<Sparkles className="size-4" />
										)}{' '}
										Sample
									</Button>
								</span>
							</TooltipTrigger>
							<TooltipContent>
								<p>Login to generate a sample</p>
							</TooltipContent>
						</Tooltip>
					))}

				<Button
					aria-label={isSchemaOpen ? 'Hide Schema' : 'View Schema'}
					size="sm"
					variant={isSchemaOpen ? 'default' : 'outline'}
					className={cn('font-normal', isSchemaOpen ? 'bg-primary' : 'bg-none')}
					onClick={onSchemaToggle}
				>
					<FileJson className="size-4" /> Schema
				</Button>

				{clearAgentState && selectedAgent && (
					<Button
						aria-label="Clear conversation history"
						size="sm"
						variant="outline"
						className="bg-none font-normal text-muted-foreground hover:text-destructive"
						onClick={() => clearAgentState(selectedAgent)}
					>
						<Trash2 className="size-4" /> Clear
					</Button>
				)}
			</div>

			<PromptInput onSubmit={onSubmit} className="px-3 pb-3">
				<PromptInputBody>
					{!selectedAgent ? (
						<div className="flex flex-col items-center justify-center py-8 px-4 text-center">
							<p className="text-sm text-muted-foreground">
								Select an agent to get started.
							</p>
						</div>
					) : (
						(() => {
							switch (inputType) {
								case 'object':
									return (
										<MonacoJsonEditor
											value={value}
											onChange={onChange}
											schema={selectedAgentData?.schema.input?.json}
											schemaUri={`agentuity://schema/${selectedAgentData?.metadata.id}/input`}
											aria-invalid={!isValidInput}
											onValidationChange={setMonacoHasErrors}
										/>
									);

								case 'string':
									return (
										<PromptInputTextarea
											placeholder="Enter a message to send..."
											value={value}
											onChange={(e) => onChange(e.target.value)}
										/>
									);
								default:
									return (
										<div className="flex flex-col items-center justify-center py-8 px-4 text-center ">
											<p className="text-sm text-muted-foreground">
												<span className="font-medium">
													This agent has no input schema.{' '}
												</span>
											</p>
											<Button
												aria-label="Run Agent"
												size="sm"
												variant="default"
												disabled={isLoading}
												onClick={onSubmit}
												className="mt-2"
											>
												{isLoading ? (
													<Loader2Icon className="size-4 animate-spin mr-2" />
												) : (
													<SendIcon className="size-4 mr-2" />
												)}
												Run Agent
											</Button>
										</div>
									);
							}
						})()
					)}
				</PromptInputBody>
				<PromptInputFooter>
					{selectedAgent && inputType !== 'none' && (
						<Button
							aria-label="Submit"
							size="icon"
							variant="default"
							disabled={isSubmitDisabled}
							onClick={() => {
								logger.debug(
									'🔥 Submit button clicked! inputType:',
									inputType,
									'value:',
									value
								);
								onSubmit();
							}}
							className="ml-auto"
						>
							{isLoading ? (
								<Loader2Icon className="size-4 animate-spin" />
							) : (
								<SendIcon className="size-4" />
							)}
						</Button>
					)}
				</PromptInputFooter>
			</PromptInput>
		</>
	);
}
