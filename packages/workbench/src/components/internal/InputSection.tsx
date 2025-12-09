import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
	CheckIcon,
	ChevronsUpDownIcon,
	FileJson,
	SendIcon,
	Loader2Icon,
	Sparkles,
} from 'lucide-react';
import { init } from 'modern-monaco';
import type * as Monaco from 'modern-monaco/editor-core';
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
	const [agentSelectOpen, setAgentSelectOpen] = useState(false);
	const monacoEditorRef = useRef<HTMLDivElement>(null);
	const editorInstanceRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);

	const selectedAgentData = agents[selectedAgent];

	// Determine input type for switch case
	const inputType = useMemo(() => {
		const schema = selectedAgentData?.schema?.input?.json;
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

			// Update Monaco editor directly if it exists
			if (editorInstanceRef.current) {
				editorInstanceRef.current.setValue(sampleJson);
				editorInstanceRef.current.layout();
			}
		} catch (error) {
			console.error('Failed to generate sample JSON:', error);
		}
	};

	useEffect(() => {
		if (!isObjectSchema || !monacoEditorRef.current) {
			if (editorInstanceRef.current) {
				editorInstanceRef.current.dispose();
				editorInstanceRef.current = null;
			}
			return;
		}

		let isMounted = true;
		let disposed = false;
		let resizeObserver: ResizeObserver | null = null;

		init({
			theme: 'vitesse-dark',
			langs: ['json'],
		}).then((monaco) => {
			if (!isMounted || !monacoEditorRef.current) return;

			if (editorInstanceRef.current) {
				editorInstanceRef.current.dispose();
			}

			// Configure JSON schema if available
			const jsonSchema = selectedAgentData?.schema.input?.json;
			if (jsonSchema) {
				// Parse schema if it's a string, otherwise use directly
				const schemaObject =
					typeof jsonSchema === 'string' ? JSON.parse(jsonSchema) : jsonSchema;

				// Access json namespace directly from monaco
				if ('json' in monaco && typeof monaco.json === 'object' && monaco.json !== null) {
					const jsonModule = monaco.json;
					if (
						'jsonDefaults' in jsonModule &&
						typeof jsonModule.jsonDefaults === 'object' &&
						jsonModule.jsonDefaults !== null
					) {
						const jsonDefaults = jsonModule.jsonDefaults;
						if (
							'setDiagnosticsOptions' in jsonDefaults &&
							typeof jsonDefaults.setDiagnosticsOptions === 'function'
						) {
							jsonDefaults.setDiagnosticsOptions({
								validate: true,
								schemas: [
									{
										// URI is just an identifier, doesn't need to be a real URL
										uri: `agentuity://schema/${selectedAgentData.metadata.id}/input`,
										fileMatch: ['*'],
										schema: schemaObject,
									},
								],
							});
						}
					}
				}
			}

			// Set initial height
			const container = monacoEditorRef.current;
			container.style.height = '64px'; // min-h-16 = 4rem = 64px

			const editor = monaco.editor.create(container, {
				value: value || '{}',
				language: 'json',
				minimap: { enabled: false },
				autoIndentOnPaste: true,
				overviewRulerBorder: false,
				overviewRulerLanes: 0,
				hideCursorInOverviewRuler: true,
				codeLens: false,
				fontSize: 14,
				lineNumbers: 'off',
				scrollBeyondLastLine: false,
				wordWrap: 'on',
				automaticLayout: true,
				scrollbar: {
					vertical: 'auto',
					horizontal: 'auto',
				},
				padding: { top: 12, bottom: 12 },
			});

			// Make background transparent
			setTimeout(() => {
				if (disposed) return;
				const editorElement = container.querySelector('.monaco-editor');
				if (editorElement) {
					(editorElement as HTMLElement).style.backgroundColor = 'transparent';
				}

				const backgroundElement = container.querySelector(
					'.monaco-editor .monaco-editor-background'
				);
				if (backgroundElement) {
					(backgroundElement as HTMLElement).style.backgroundColor = 'transparent';
				}

				const viewLines = container.querySelector('.monaco-editor .view-lines');
				if (viewLines) {
					(viewLines as HTMLElement).style.backgroundColor = 'transparent';
				}
			}, 0);

			editor.onDidChangeModelContent(() => {
				const newValue = editor.getValue();
				onChange(newValue);

				// Auto-resize based on content
				if (container) {
					const contentHeight = editor.getContentHeight();
					const maxHeight = 192; // max-h-48 = 12rem = 192px
					const minHeight = 64; // min-h-16 = 4rem = 64px
					const newHeight = Math.min(Math.max(contentHeight + 24, minHeight), maxHeight);
					container.style.height = `${newHeight}px`;
					editor.layout();
				}
			});

			// Resize observer for container size changes
			resizeObserver = new ResizeObserver(() => {
				if (!disposed && editor && isMounted) {
					editor.layout();
				}
			});
			resizeObserver.observe(container);

			// Force layout update after creation
			setTimeout(() => {
				if (disposed) return;
				editor.layout();
			}, 0);

			editorInstanceRef.current = editor;
		});

		return () => {
			isMounted = false;
			disposed = true;
			if (resizeObserver) {
				resizeObserver.disconnect();
			}
			if (editorInstanceRef.current) {
				editorInstanceRef.current.dispose();
				editorInstanceRef.current = null;
			}
		};
	}, [isObjectSchema, onChange, selectedAgentData]);

	useEffect(() => {
		if (isObjectSchema && editorInstanceRef.current) {
			const currentValue = editorInstanceRef.current.getValue();
			if (currentValue !== value) {
				editorInstanceRef.current.setValue(value || '{}');
			}
		}
	}, [value, isObjectSchema]);

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
											key={agent.metadata.identifier}
											value={agent.metadata.identifier}
											onSelect={(currentValue) => {
												setSelectedAgent(currentValue);
												setAgentSelectOpen(false);
											}}
										>
											<CheckIcon
												className={cn(
													'size-4 text-green-500',
													selectedAgent === agent.metadata.identifier
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
									<div
										ref={monacoEditorRef}
										className="w-full rounded-md bg-transparent overflow-hidden"
										style={{ minHeight: '64px', maxHeight: '192px', height: '64px' }}
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
							onClick={onSubmit}
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
