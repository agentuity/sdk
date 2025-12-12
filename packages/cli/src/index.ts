export { createCLI, registerCommands } from './cli';
export { validateRuntime, isBun } from './runtime';
export { ensureBunOnPath } from './bun-path';
export { isGitAvailable, getDefaultBranch } from './git-helper';
export {
	generateCLISchema,
	type CLISchema,
	type SchemaCommand,
	type SchemaExample,
} from './schema-generator';
export {
	ErrorCode,
	createError,
	exitWithError,
	formatErrorJSON,
	formatErrorHuman,
	type StructuredError,
} from './errors';
export { wrapLogger, CLILogger } from './cli-logger';
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
} from './output';
export {
	isExplainMode,
	isDryRunMode,
	shouldExecute,
	outputExplain,
	createExplainPlan,
	outputDryRun,
	type ExplainPlan,
	type ExplainStep,
} from './explain';
export { getVersion, getRevision, getPackageName, getPackage } from './version';
export { requireAuth, optionalAuth } from './auth';
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
} from './config';
export { APIClient, getAPIBaseURL, getAppBaseURL } from './api';
export {
	ConsoleLogger,
	createLogger,
	type ColorScheme as LoggerColorScheme,
} from '@agentuity/server';
export { showBanner } from './banner';
export { discoverCommands } from './cmd';
export { detectColorScheme } from './terminal';
export { getCommandPrefix, getCommand } from './command-prefix';
export {
	bootstrapRuntimeEnv,
	type RuntimeBootstrapOptions,
	type RuntimeBootstrapResult,
} from './runtime-bootstrap';
export * as tui from './tui';
export {
	createRepl,
	type ReplConfig,
	type ReplCommand,
	type ReplContext,
	type ParsedCommand,
	type CommandHandler,
	type TableColumn,
} from './repl';
export { runSteps, stepSuccess, stepSkipped, stepError } from './steps';
export { playSound } from './sound';
export {
	downloadWithProgress,
	downloadWithSpinner,
	downloadGitHubTarball,
	type DownloadOptions as DownloadOptionsType,
	type DownloadGitHubOptions,
} from './download';
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
	BuildPhase,
	BuildContext,
	BuildConfig,
	BuildConfigFunction,
} from './types';
export { createSubcommand, createCommand } from './types';
export type { ColorScheme } from './terminal';
export type { Step, StepOutcome, StepContext } from './steps';
