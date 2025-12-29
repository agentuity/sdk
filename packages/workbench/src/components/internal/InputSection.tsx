import type { JSONSchema7 } from "ai";
import {
	ArrowUp,
	Braces,
	CheckIcon,
	ChevronDownIcon,
	ChevronsUpDownIcon,
	FileJson,
	Loader2Icon,
	SendIcon,
	Sparkles,
	SquareCode,
	Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { convertJsonSchemaToZod } from "zod-from-json-schema";
import type { AgentSchemaData } from "../../hooks/useAgentSchemas";
import { useLogger } from "../../hooks/useLogger";
import { cn, generateTemplateFromSchema } from "../../lib/utils";
import {
	PromptInput,
	PromptInputBody,
	PromptInputFooter,
	PromptInputTextarea,
} from "../ai-elements/prompt-input";
import { Button } from "../ui/button";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "../ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import { MonacoJsonEditor } from "./MonacoJsonEditor";
import { useWorkbench } from "./WorkbenchProvider";

export interface InputSectionProps {
	agents: Record<string, AgentSchemaData>;
	className?: string;
	clearAgentState?: (agentId: string) => Promise<void>;
	isLoading: boolean;
	isSchemaOpen: boolean;
	onChange: (value: string) => void;
	onSchemaToggle: () => void;
	onSubmit: () => void | Promise<void>;
	selectedAgent: string;
	setSelectedAgent: (agentId: string) => void;
	value: string;
}

function isSchemaRootObject(schemaJson?: JSONSchema7): boolean {
	if (!schemaJson) return false;

	try {
		return (
			schemaJson.type === "object" ||
			(schemaJson.type === undefined && schemaJson.properties !== undefined)
		);
	} catch {
		return false;
	}
}

export function InputSection({
	agents,
	className,
	clearAgentState,
	isLoading,
	isSchemaOpen,
	onChange,
	onSchemaToggle,
	onSubmit,
	selectedAgent,
	setSelectedAgent,
	value,
}: InputSectionProps) {
	const logger = useLogger("InputSection");
	const { generateSample, isGeneratingSample, env } = useWorkbench();
	const isAuthenticated = env.authenticated;
	const [agentSelectOpen, setAgentSelectOpen] = useState(false);
	const [prefillOpen, setPrefillOpen] = useState(false);
	const [isValidInput, setIsValidInput] = useState(true);
	const [monacoHasErrors, setMonacoHasErrors] = useState<boolean | null>(null);

	const selectedAgentData = Object.values(agents).find(
		(agent) => agent.metadata.agentId === selectedAgent,
	);

	// Determine input type for switch case
	const inputType = useMemo(() => {
		const schema = selectedAgentData?.schema?.input?.json;

		logger.debug(
			"🎛️ InputSection - selectedAgent:",
			selectedAgent,
			"selectedAgentData:",
			selectedAgentData,
			"schema:",
			schema,
		);

		if (!schema) {
			return "none"; // Agent has no input schema
		}

		if (isSchemaRootObject(schema)) {
			return "object"; // Complex object schema
		}

		if (schema.type === "string") {
			return "string"; // String schema
		}

		return "none"; // Default to none for other types
	}, [selectedAgentData, logger, selectedAgent]);

	const isObjectSchema = inputType === "object";

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
				const schemaObject =
					typeof schema === "string" ? JSON.parse(schema) : schema;
				const zodSchema = convertJsonSchemaToZod(schemaObject);

				// Validate with zod
				const result = zodSchema.safeParse(parsedJson);

				return result.success;
			} catch {
				// JSON parse error or schema validation error
				return false;
			}
		},
		[isObjectSchema],
	);

	// Reset Monaco error state when schema changes
	// biome-ignore lint/correctness/useExhaustiveDependencies: Trigger on schema change
	useEffect(() => {
		if (isObjectSchema) {
			setMonacoHasErrors(null);
		}
	}, [selectedAgentData, isObjectSchema]);

	// Update validation state - use Monaco errors if available, otherwise fall back to zod validation
	useEffect(() => {
		if (isObjectSchema) {
			if (monacoHasErrors !== null) {
				// Monaco is handling validation, use its error state
				setIsValidInput(!monacoHasErrors);
			} else {
				// Monaco hasn't reported yet, use zod validation as fallback
				const isValid = validateInput(
					value,
					selectedAgentData?.schema?.input?.json,
				);

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
		if (
			!selectedAgentData?.schema.input?.json ||
			!isObjectSchema ||
			!selectedAgent
		)
			return;

		try {
			const sampleJson = await generateSample(selectedAgent);

			onChange(sampleJson);
		} catch (error) {
			logger.error("Failed to generate sample JSON:", error);

			console.error("Failed to generate sample JSON:", error);
		}
	};

	// Memoized submit disabled condition for readability
	const isSubmitDisabled = useMemo(() => {
		if (isLoading) {
			return true;
		}

		if (inputType === "string" && !value.trim()) {
			return true;
		}

		if (inputType === "object" && (!isValidInput || !value.trim())) {
			return true;
		}

		return false;
	}, [isLoading, inputType, value, isValidInput]);

	return (
		<div className={cn("flex flex-col gap-4 p-4 z-100", className)}>
			<div className="flex items-center gap-2">
				<Popover open={agentSelectOpen} onOpenChange={setAgentSelectOpen}>
					<PopoverTrigger asChild>
						<Button
							aria-expanded={agentSelectOpen}
							variant="outline"
							size="sm"
							className="font-normal bg-background dark:bg-background hover:bg-background dark:hover:bg-background dark:hover:border-border/70"
						>
							{Object.values(agents).find(
								(agent) => agent.metadata.agentId === selectedAgent,
							)?.metadata.name || "Select agent"}
							<ChevronsUpDownIcon className="size-4 shrink-0 opacity-50" />
						</Button>
					</PopoverTrigger>
					<PopoverContent side="top" align="start" className="w-fit p-0 z-101">
						<Command>
							<CommandInput placeholder="Search agents..." />
							<CommandList>
								<CommandEmpty>No agents found.</CommandEmpty>
								<CommandGroup>
									{Object.values(agents)
										.sort((a, b) =>
											a.metadata.name.localeCompare(b.metadata.name),
										)
										.map((agent) => {
											const isSelected =
												selectedAgent === agent.metadata.agentId;

											// Use name for search but include agentId to ensure uniqueness
											const searchValue = `${agent.metadata.name}|${agent.metadata.agentId}`;

											return (
												<CommandItem
													key={agent.metadata.agentId}
													value={searchValue}
													onSelect={(currentValue) => {
														// Extract agentId from the compound value
														const agentId = currentValue.split("|")[1];
														const selectedAgentData = Object.values(
															agents,
														).find((a) => a.metadata.agentId === agentId);

														if (selectedAgentData) {
															logger.debug(
																"🎯 Agent selected by name:",
																agent.metadata.name,
																"agentId:",
																agentId,
															);

															setSelectedAgent(agentId);
														}

														setAgentSelectOpen(false);
													}}
												>
													<CheckIcon
														className={cn(
															"size-4 text-green-500",
															isSelected ? "opacity-100" : "opacity-0",
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

				<Button
					aria-label={isSchemaOpen ? "Hide Schema" : "View Schema"}
					size="sm"
					variant="outline"
					className={cn(
						"font-normal bg-background dark:bg-background hover:bg-background dark:hover:bg-background dark:hover:border-border/50",
						isSchemaOpen && "bg-secondary!",
					)}
					onClick={onSchemaToggle}
				>
					<Braces className="size-4" />
					Schema
				</Button>

				{isObjectSchema && (
					<Popover open={prefillOpen} onOpenChange={setPrefillOpen}>
						<PopoverTrigger asChild>
							<Button
								aria-expanded={prefillOpen}
								aria-label="Pre-fill input"
								size="sm"
								variant="outline"
								className="font-normal bg-background dark:bg-background hover:bg-background dark:hover:bg-background dark:hover:border-border/70"
							>
								Pre-fill
								<ChevronDownIcon className="size-4 shrink-0 opacity-50" />
							</Button>
						</PopoverTrigger>
						<PopoverContent
							side="top"
							align="start"
							className="w-fit max-w-xl p-0 z-101"
						>
							<Command>
								<CommandList>
									<CommandGroup>
										<CommandItem
											onSelect={() => {
												const template = generateTemplateFromSchema(
													selectedAgentData?.schema?.input?.json,
												);

												onChange(template);
												setPrefillOpen(false);
											}}
										>
											<SquareCode className="size-4" />
											<span>Template</span>
											<span className="ml-auto text-xs text-muted-foreground">
												Empty schema structure
											</span>
										</CommandItem>

										{isAuthenticated ? (
											<CommandItem
												disabled={isGeneratingSample}
												onSelect={() => {
													handleGenerateSample();
													setPrefillOpen(false);
												}}
											>
												{isGeneratingSample ? (
													<Loader2Icon className="size-4 animate-spin" />
												) : (
													<Sparkles className="size-4" />
												)}
												<span>Mock Input</span>
												<span className="ml-auto text-xs text-muted-foreground">
													AI-generated data
												</span>
											</CommandItem>
										) : (
											<Tooltip>
												<TooltipTrigger asChild>
													<CommandItem disabled className="opacity-50">
														<Sparkles className="size-4" />
														<span>Mock Input</span>
														<span className="ml-auto text-xs text-muted-foreground">
															Login required
														</span>
													</CommandItem>
												</TooltipTrigger>
												<TooltipContent>
													Login to generate a mock input using AI
												</TooltipContent>
											</Tooltip>
										)}
									</CommandGroup>

									{selectedAgentData?.examples &&
										selectedAgentData.examples.length > 0 && (
											<CommandGroup heading="Examples">
												{selectedAgentData.examples.map((example) => {
													const label =
														typeof example === "object" && example !== null
															? JSON.stringify(example).substring(0, 60)
															: String(example).substring(0, 60);

													return (
														<CommandItem
															key={label}
															onSelect={() => {
																const formatted =
																	typeof example === "object"
																		? JSON.stringify(example, null, 2)
																		: String(example);

																onChange(formatted);
																setPrefillOpen(false);
															}}
														>
															<FileJson className="size-4" />
															<span className="truncate font-mono">
																{label}
															</span>
														</CommandItem>
													);
												})}
											</CommandGroup>
										)}
								</CommandList>
							</Command>
						</PopoverContent>
					</Popover>
				)}

				{clearAgentState && selectedAgent && (
					<Button
						aria-label="Clear conversation history"
						size="sm"
						variant="outline"
						className="ml-auto font-normal bg-background dark:bg-background hover:bg-background dark:hover:bg-background dark:hover:border-border/50 text-foreground hover:text-destructive"
						onClick={() => clearAgentState(selectedAgent)}
					>
						<Trash2 className="size-4" />
						Clear Thread
					</Button>
				)}
			</div>

			<PromptInput onSubmit={onSubmit}>
				<PromptInputBody>
					{!selectedAgent ? (
						<div className="flex flex-col items-center justify-center py-6 px-4 text-center">
							<p className="text-sm text-muted-foreground/70">
								Select an agent to get started.
							</p>
						</div>
					) : (
						(() => {
							switch (inputType) {
								case "object":
									return (
										<MonacoJsonEditor
											aria-invalid={!isValidInput}
											onChange={onChange}
											onSubmit={onSubmit}
											onValidationChange={setMonacoHasErrors}
											schema={selectedAgentData?.schema.input?.json}
											schemaUri={`agentuity://schema/${selectedAgentData?.metadata.id}/input`}
											value={value}
										/>
									);

								case "string":
									return (
										<PromptInputTextarea
											onChange={(e) => onChange(e.target.value)}
											placeholder="Enter a message to send..."
											value={value}
										/>
									);
								default:
									return (
										<div className="flex flex-col items-center justify-center py-8 px-4 text-center ">
											<p className="text-sm text-muted-foreground">
												<span className="font-medium">
													This agent has no input schema.
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

				<PromptInputFooter className="pt-0">
					{selectedAgent && inputType !== "none" && (
						<Button
							aria-label="Submit"
							size="icon"
							variant="default"
							disabled={isSubmitDisabled}
							onClick={() => {
								logger.debug(
									"🔥 Submit button clicked! inputType:",
									inputType,
									"value:",
									value,
								);

								onSubmit();
							}}
							className={cn("ml-auto", isSubmitDisabled && "opacity-10!")}
						>
							{isLoading ? (
								<Loader2Icon className="size-4 animate-spin" />
							) : (
								<ArrowUp className="size-4" />
							)}
						</Button>
					)}
				</PromptInputFooter>
			</PromptInput>
		</div>
	);
}
