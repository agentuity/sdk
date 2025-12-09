import React, { useMemo, useState } from 'react';
import {
	CheckIcon,
	ChevronsUpDownIcon,
	FileJson,
	SendIcon,
	Loader2Icon,
	Sparkles,
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
import { cn } from '../../lib/utils';
import type { AgentSchemaData } from '../../hooks/useAgentSchemas';
import { useLogger } from '../../hooks/useLogger';
import type { JSONSchema7 } from 'ai';
import { convertJsonSchemaToZod } from 'zod-from-json-schema';
import { zocker } from 'zocker';

export interface InputSectionProps {
	value: string;
	onChange: (value: string) => void;
	onSubmit: () => void | Promise<void>;
	isLoading: boolean;
	agents: Record<string, AgentSchemaData>;
	selectedAgent: string;
	setSelectedAgent: (agentId: string) => void;
	suggestions: string[];
	onSchemaOpen: () => void;
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
	onSchemaOpen,
}: InputSectionProps) {
	const logger = useLogger('InputSection');
	const [agentSelectOpen, setAgentSelectOpen] = useState(false);

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
	}, [selectedAgentData?.schema.input?.json]);

	const isObjectSchema = inputType === 'object';

	const handleGenerateSample = () => {
		if (!selectedAgentData?.schema.input?.json || !isObjectSchema) return;

		try {
			const jsonSchema = selectedAgentData.schema.input.json;
			const schemaObject = typeof jsonSchema === 'string' ? JSON.parse(jsonSchema) : jsonSchema;

			const zodSchema = convertJsonSchemaToZod(schemaObject);
			const sampleData = zocker(zodSchema).generate();
			const sampleJson = JSON.stringify(sampleData, null, 2);
			onChange(sampleJson);
		} catch (error) {
			console.error('Failed to generate sample JSON:', error);
		}
	};



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
										logger.debug(
											'🔍 Dropdown render - agent:',
											agent.metadata.name,
											'agentId:',
											agent.metadata.agentId,
											'selectedAgent:',
											selectedAgent,
											'isSelected:',
											isSelected
										);
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

				{isObjectSchema && (
					<Button
						aria-label="Generate Sample JSON"
						size="sm"
						variant="outline"
						className="bg-none font-normal"
						onClick={handleGenerateSample}
					>
						<Sparkles className="size-4" /> Sample
					</Button>
				)}

				<Button
					aria-label="View Schema"
					size="sm"
					variant="outline"
					className="bg-none font-normal"
					onClick={onSchemaOpen}
				>
					<FileJson className="size-4" /> Schema
				</Button>
			</div>

			<PromptInput onSubmit={onSubmit} className="px-3 pb-3">
				<PromptInputBody>
					{(() => {
						switch (inputType) {
							case 'object':
								return (
									<MonacoJsonEditor
										value={value}
										onChange={onChange}
										schema={selectedAgentData?.schema.input?.json}
										schemaUri={`agentuity://schema/${selectedAgentData?.metadata.id}/input`}
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
					})()}
				</PromptInputBody>
				<PromptInputFooter>
					{inputType !== 'none' && (
						<Button
							aria-label="Submit"
							size="icon"
							variant="default"
							disabled={isLoading || (inputType === 'string' && !value.trim())}
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
