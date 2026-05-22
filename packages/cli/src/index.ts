export { createCLI, registerCommands } from './cli.ts';
export { generateAIHelp, type DashdashConfig } from './ai-help.ts';
export {
	getExecutingAgent,
	getAgentEnv,
	getAgentDisplayName,
	KNOWN_AGENTS,
	AGENT_DISPLAY_NAMES,
	type KnownAgent,
} from './agent-detection.ts';
export { validateRuntime, isBun } from './runtime.ts';
export { ensureBunOnPath } from './bun-path.ts';
export { isGitAvailable, getDefaultBranch } from './git-helper.ts';
export {
	generateCLISchema,
	type CLISchema,
	type SchemaCommand,
	type SchemaExample,
} from './schema-generator.ts';
export {
	ErrorCode,
	createError,
	exitWithError,
	formatErrorJSON,
	formatErrorHuman,
	type StructuredError,
} from './errors.ts';
export { wrapLogger, CLILogger } from './cli-logger.ts';
export {
	InternalLogger,
	createInternalLogger,
	getLatestLogSession,
	getLogsDirPath,
} from './internal-logger.ts';
export { CompositeLogger, createCompositeLogger } from './composite-logger.ts';
export {
	isJSONMode,
	isQuietMode,
	shouldDisableProgress,
	shouldDisableColors,
	outputJSON,
	outputSuccess,
	outputInfo,
	outputWarning,
	canPrompt,
	createSuccessResponse,
	createErrorResponse,
	createMetadata,
	setOutputOptions,
	getOutputOptions,
	createBatchResult,
	outputBatchResult,
	type JSONResponse,
	type ResponseMetadata,
	type BatchItemResult,
	type BatchOperationResult,
} from './output.ts';
export {
	isExplainMode,
	isDryRunMode,
	shouldExecute,
	outputExplain,
	createExplainPlan,
	outputDryRun,
	type ExplainPlan,
	type ExplainStep,
} from './explain.ts';
export { getVersion, getRevision, getPackageName, getPackage } from './version.ts';
export { requireAuth, optionalAuth } from './auth.ts';
export {
	loadConfig,
	saveConfig,
	getDefaultConfigPath,
	getDefaultConfigDir,
	getProfilePath,
	ensureConfigDir,
	saveProfile,
	getProfile,
	fetchProfiles,
	saveAuth,
	clearAuth,
	getAuth,
} from './config.ts';
export { APIClient, getAPIBaseURL, getAppBaseURL } from './api.ts';
export { getCatalystUrl } from './catalyst.ts';
export {
	ConsoleLogger,
	createLogger,
	type ColorScheme as LoggerColorScheme,
} from '@agentuity/server';
export { showBanner } from './banner.ts';
export { discoverCommands } from './cmd/index.ts';
export { detectColorScheme } from './terminal.ts';
export { getCommandPrefix, getCommand } from './command-prefix.ts';
export * as tui from './tui.ts';
export {
	createRepl,
	type ReplConfig,
	type ReplCommand,
	type ReplContext,
	type ParsedCommand,
	type CommandHandler,
	type TableColumn,
} from './repl.ts';
export { runSteps, stepSuccess, stepSkipped, stepError, StepInterruptError } from './steps.ts';
export { playSound } from './sound.ts';
export {
	downloadWithProgress,
	downloadWithSpinner,
	downloadGitHubTarball,
	type DownloadOptions as DownloadOptionsType,
	type DownloadGitHubOptions,
} from './download.ts';
export type {
	Config,
	LogLevel,
	GlobalOptions,
	CommandContext,
	SubcommandDefinition,
	CommandDefinition,
	Profile,
	AuthData,
	CommandSchemas,
	ResourceSelectionRule,
} from './types.ts';
export { createSubcommand, createCommand } from './types.ts';
export type { ColorScheme } from './terminal.ts';
export type { Step, StepOutcome, StepContext } from './steps.ts';
