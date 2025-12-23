import * as vscode from 'vscode';
import { spawn, type ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as jsonc from 'jsonc-parser';

export interface StructuredCliError {
	_tag?: string;
	message: string;
	code?: string;
	details?: Record<string, unknown>;
}

export interface CliResult<T = unknown> {
	success: boolean;
	data?: T;
	error?: string;
	structuredError?: StructuredCliError;
	exitCode: number;
}

export interface CliOptions {
	cwd?: string;
	timeout?: number;
	format?: 'json' | 'text';
}

export class CliClient {
	private outputChannel: vscode.OutputChannel;

	constructor() {
		this.outputChannel = vscode.window.createOutputChannel('Agentuity CLI');
	}

	/**
	 * Get the CLI executable path from settings, local project, common install locations, or PATH.
	 */
	getCliPath(): string {
		const config = vscode.workspace.getConfiguration('agentuity');
		const customPath = config.get<string>('cliPath');
		if (customPath && customPath.trim() !== '') {
			return customPath;
		}

		// Check for local CLI in project's node_modules/.bin first
		const projectDir = this.getProjectCwd();
		if (projectDir) {
			const localCliPath = path.join(projectDir, 'node_modules', '.bin', 'agentuity');
			if (fs.existsSync(localCliPath)) {
				return localCliPath;
			}
		}

		// Check common install location: ~/.agentuity/bin/agentuity
		const homeDir = os.homedir();
		const defaultInstallPath = path.join(homeDir, '.agentuity', 'bin', 'agentuity');
		if (fs.existsSync(defaultInstallPath)) {
			return defaultInstallPath;
		}

		// Fall back to PATH lookup
		return 'agentuity';
	}

	private getProjectCwd(): string | undefined {
		const workspaceFolders = vscode.workspace.workspaceFolders;
		if (!workspaceFolders || workspaceFolders.length === 0) {
			return undefined;
		}
		return workspaceFolders[0].uri.fsPath;
	}

	/**
	 * Read the region from the project's agentuity.json file.
	 */
	private getProjectRegion(): string | undefined {
		const projectDir = this.getProjectCwd();
		if (!projectDir) return undefined;

		const configPath = path.join(projectDir, 'agentuity.json');
		if (!fs.existsSync(configPath)) return undefined;

		try {
			const content = fs.readFileSync(configPath, 'utf-8');
			const config = jsonc.parse(content) as Record<string, unknown>;
			return config.region as string | undefined;
		} catch {
			return undefined;
		}
	}

	/**
	 * Append --dir flag to args if we have a project directory.
	 * Used for commands that accept --dir (those with requires/optional project).
	 * The --dir flag is a subcommand option, so it must come after the command.
	 */
	private withProjectDir(args: string[]): string[] {
		const projectDir = this.getProjectCwd();
		if (projectDir) {
			return [...args, '--dir', projectDir];
		}
		return args;
	}

	/**
	 * Append --region flag to args using region from agentuity.json.
	 * Used for commands that require region but don't accept --dir.
	 * The --region flag is a subcommand option, so it must come after the command.
	 */
	private withRegion(args: string[]): string[] {
		const region = this.getProjectRegion();
		if (region) {
			return [...args, '--region', region];
		}
		return args;
	}

	/**
	 * Get the environment variables for CLI execution.
	 * Sets TERM_PROGRAM=vscode to ensure CLI disables interactive mode.
	 */
	getCliEnv(): NodeJS.ProcessEnv {
		return {
			...process.env,
			TERM_PROGRAM: 'vscode',
		};
	}

	/**
	 * Try to parse a structured error from CLI output.
	 * The CLI may emit JSON errors with _tag, message, code, and details fields.
	 */
	private tryParseStructuredError(output: string): StructuredCliError | undefined {
		if (!output) return undefined;

		try {
			const trimmed = output.trim();
			if (!trimmed.startsWith('{')) return undefined;

			const parsed = JSON.parse(trimmed);
			if (parsed && typeof parsed === 'object' && 'message' in parsed) {
				return {
					_tag: parsed._tag,
					message: parsed.message,
					code: parsed.code,
					details: parsed.details,
				};
			}
		} catch {
			// Not valid JSON, ignore
		}

		return undefined;
	}

	async exec<T = unknown>(args: string[], options: CliOptions = {}): Promise<CliResult<T>> {
		const cliPath = this.getCliPath();
		const cwd = options.cwd ?? this.getProjectCwd();
		const timeout = options.timeout ?? 30000;

		if (options.format === 'json') {
			args = ['--json', ...args];
		}

		return new Promise((resolve) => {
			let stdout = '';
			let stderr = '';
			let resolved = false;

			const resolveOnce = (result: CliResult<T>) => {
				if (!resolved) {
					resolved = true;
					resolve(result);
				}
			};

			this.outputChannel.appendLine(`$ ${cliPath} ${args.join(' ')}`);

			const child: ChildProcess = spawn(cliPath, args, {
				cwd,
				shell: true,
				env: this.getCliEnv(),
			});

			const timeoutId = setTimeout(() => {
				child.kill();
				resolveOnce({
					success: false,
					error: `Command timed out after ${timeout}ms`,
					exitCode: -1,
				});
			}, timeout);

			child.stdout?.on('data', (data: Buffer) => {
				stdout += data.toString();
			});

			child.stderr?.on('data', (data: Buffer) => {
				stderr += data.toString();
			});

			child.on('error', (err: Error) => {
				clearTimeout(timeoutId);
				this.outputChannel.appendLine(`Error: ${err.message}`);
				resolveOnce({
					success: false,
					error: err.message,
					exitCode: -1,
				});
			});

			child.on('close', (code: number | null) => {
				clearTimeout(timeoutId);
				const exitCode = code ?? 0;

				if (stdout) {
					this.outputChannel.appendLine(stdout);
				}
				if (stderr) {
					this.outputChannel.appendLine(`stderr: ${stderr}`);
				}

				if (exitCode !== 0) {
					// Try to parse structured error from CLI output
					const structuredError = this.tryParseStructuredError(
						options.format === 'json' ? stdout : stderr || stdout
					);
					resolveOnce({
						success: false,
						error:
							structuredError?.message ||
							stderr ||
							stdout ||
							`Command failed with exit code ${exitCode}`,
						structuredError,
						exitCode,
					});
					return;
				}

				if (options.format === 'json') {
					try {
						// Handle CLI bug where some commands output JSON twice
						// Try to parse the first valid JSON object/array
						const trimmed = stdout.trim();
						let jsonStr = trimmed;

						// If output contains multiple JSON values, take the first one
						if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
							const firstChar = trimmed[0];
							const closeChar = firstChar === '[' ? ']' : '}';
							let depth = 0;
							let endIdx = 0;

							for (let i = 0; i < trimmed.length; i++) {
								if (trimmed[i] === firstChar) depth++;
								if (trimmed[i] === closeChar) depth--;
								if (depth === 0) {
									endIdx = i + 1;
									break;
								}
							}

							if (endIdx > 0) {
								jsonStr = trimmed.substring(0, endIdx);
							}
						}

						const data = JSON.parse(jsonStr) as T;
						resolveOnce({ success: true, data, exitCode });
					} catch {
						resolveOnce({
							success: false,
							error: `Failed to parse JSON: ${stdout}`,
							exitCode,
						});
					}
				} else {
					resolveOnce({
						success: true,
						data: stdout.trim() as unknown as T,
						exitCode,
					});
				}
			});
		});
	}

	async version(): Promise<CliResult<string>> {
		return this.exec<string>(['--version'], { format: 'text' });
	}

	async whoami(): Promise<CliResult<WhoamiResponse>> {
		return this.exec<WhoamiResponse>(['auth', 'whoami'], { format: 'json' });
	}

	async listAgents(): Promise<CliResult<AgentListResponse>> {
		return this.exec<AgentListResponse>(['cloud', 'agent', 'list'], { format: 'json' });
	}

	async listKvNamespaces(): Promise<CliResult<KvNamespaceListResponse>> {
		return this.exec<KvNamespaceListResponse>(['cloud', 'keyvalue', 'list-namespaces'], {
			format: 'json',
		});
	}

	async listKvKeys(namespace: string): Promise<CliResult<KvKeysResponse>> {
		return this.exec<KvKeysResponse>(['cloud', 'keyvalue', 'keys', namespace], {
			format: 'json',
		});
	}

	async getKvValue(namespace: string, key: string): Promise<CliResult<KvGetResponse>> {
		return this.exec<KvGetResponse>(['cloud', 'keyvalue', 'get', namespace, key], {
			format: 'json',
		});
	}

	async getAiCapabilities(): Promise<CliResult<AiCapabilitiesResponse>> {
		return this.exec<AiCapabilitiesResponse>(['ai', 'capabilities', 'show'], { format: 'json' });
	}

	async getAiSchema(): Promise<CliResult<AiSchemaResponse>> {
		return this.exec<AiSchemaResponse>(['ai', 'schema', 'show'], { format: 'json' });
	}

	async getAiPrompt(): Promise<CliResult<string>> {
		return this.exec<string>(['ai', 'prompt', 'llm'], { format: 'text' });
	}

	// Database methods (require region - pass --region from agentuity.json)
	async listDatabases(): Promise<CliResult<DbListResponse>> {
		return this.exec<DbListResponse>(this.withRegion(['cloud', 'db', 'list']), {
			format: 'json',
		});
	}

	async getDatabase(name: string): Promise<CliResult<DbInfo>> {
		return this.exec<DbInfo>(this.withRegion(['cloud', 'db', 'get', name]), {
			format: 'json',
		});
	}

	async getDbLogs(
		name: string,
		opts?: { limit?: number; hasError?: boolean; sessionId?: string }
	): Promise<CliResult<DbQueryLog[]>> {
		const args = ['cloud', 'db', 'logs', name];
		if (opts?.limit) {
			args.push('--limit', String(opts.limit));
		}
		if (opts?.hasError) {
			args.push('--has-error');
		}
		if (opts?.sessionId) {
			args.push('--session-id', opts.sessionId);
		}
		return this.exec<DbQueryLog[]>(this.withRegion(args), { format: 'json', timeout: 60000 });
	}

	// Storage methods (require region - pass --region from agentuity.json)
	async listStorageBuckets(): Promise<CliResult<StorageListResponse>> {
		return this.exec<StorageListResponse>(this.withRegion(['cloud', 'storage', 'list']), {
			format: 'json',
		});
	}

	async listStorageFiles(
		bucket: string,
		prefix?: string
	): Promise<CliResult<StorageListResponse>> {
		const args = ['cloud', 'storage', 'list', bucket];
		if (prefix) {
			args.push(prefix);
		}
		return this.exec<StorageListResponse>(this.withRegion(args), { format: 'json' });
	}

	async getStorageFileMetadata(
		bucket: string,
		filename: string
	): Promise<CliResult<StorageFileMetadataResponse>> {
		return this.exec<StorageFileMetadataResponse>(
			this.withRegion(['cloud', 'storage', 'download', bucket, filename, '--metadata']),
			{ format: 'json' }
		);
	}

	// Stream methods
	async listStreams(opts?: {
		size?: number;
		name?: string;
	}): Promise<CliResult<StreamListResponse>> {
		const args = ['cloud', 'stream', 'list'];
		if (opts?.size) {
			args.push('--size', String(opts.size));
		}
		if (opts?.name) {
			args.push('--name', opts.name);
		}
		return this.exec<StreamListResponse>(args, { format: 'json' });
	}

	async getStream(id: string): Promise<CliResult<StreamInfo>> {
		return this.exec<StreamInfo>(['cloud', 'stream', 'get', id], { format: 'json' });
	}

	async deleteStream(id: string): Promise<CliResult<void>> {
		return this.exec<void>(['cloud', 'stream', 'delete', id], { format: 'json' });
	}

	// Profile methods
	async getCurrentProfile(): Promise<CliResult<string>> {
		return this.exec<string>(['profile', 'current'], { format: 'json' });
	}

	// Vector methods
	async vectorSearch(
		namespace: string,
		query: string,
		opts?: { limit?: number; similarity?: number }
	): Promise<CliResult<VectorSearchResponse>> {
		const args = ['cloud', 'vector', 'search', namespace, query];
		if (opts?.limit) {
			args.push('--limit', String(opts.limit));
		}
		if (opts?.similarity) {
			args.push('--similarity', String(opts.similarity));
		}
		return this.exec<VectorSearchResponse>(args, { format: 'json' });
	}

	async getVector(namespace: string, key: string): Promise<CliResult<VectorGetResponse>> {
		return this.exec<VectorGetResponse>(['cloud', 'vector', 'get', namespace, key], {
			format: 'json',
		});
	}

	async deploy(): Promise<CliResult<DeployResponse>> {
		return this.exec<DeployResponse>(['cloud', 'deploy'], { format: 'json', timeout: 120000 });
	}

	async listDeployments(count?: number): Promise<CliResult<DeploymentListResponse>> {
		const args = ['cloud', 'deployment', 'list'];
		if (count) {
			args.push('--count', String(count));
		}
		return this.exec<DeploymentListResponse>(args, { format: 'json' });
	}

	async getDeployment(deploymentId: string): Promise<CliResult<DeploymentShowResponse>> {
		return this.exec<DeploymentShowResponse>(['cloud', 'deployment', 'show', deploymentId], {
			format: 'json',
		});
	}

	async getDeploymentLogs(
		deploymentId: string,
		limit?: number
	): Promise<CliResult<DeploymentLog[]>> {
		const args = ['cloud', 'deployment', 'logs', deploymentId];
		if (limit) {
			args.push('--limit', String(limit));
		}
		return this.exec<DeploymentLog[]>(args, { format: 'json', timeout: 60000 });
	}

	// Session methods (require region - use --dir to ensure CLI finds agentuity.json)
	async listSessions(opts?: SessionListOptions): Promise<CliResult<SessionListResponse>> {
		const args = ['cloud', 'session', 'list'];
		if (opts?.count) {
			args.push('--count', String(opts.count));
		}
		if (opts?.deploymentId) {
			args.push('--deployment-id', opts.deploymentId);
		}
		if (opts?.agentIdentifier) {
			args.push('--agent-identifier', opts.agentIdentifier);
		}
		if (opts?.success !== undefined) {
			args.push('--success', String(opts.success));
		}
		if (opts?.devmode !== undefined) {
			args.push('--devmode', String(opts.devmode));
		}
		if (opts?.trigger) {
			args.push('--trigger', opts.trigger);
		}
		if (opts?.env) {
			args.push('--env', opts.env);
		}
		return this.exec<SessionListResponse>(this.withProjectDir(args), { format: 'json' });
	}

	async getSession(sessionId: string): Promise<CliResult<SessionGetResponse>> {
		return this.exec<SessionGetResponse>(
			this.withProjectDir(['cloud', 'session', 'get', sessionId]),
			{ format: 'json' }
		);
	}

	async getSessionLogs(sessionId: string): Promise<CliResult<SessionLog[]>> {
		return this.exec<SessionLog[]>(this.withProjectDir(['cloud', 'session', 'logs', sessionId]), {
			format: 'json',
			timeout: 60000,
		});
	}

	dispose(): void {
		this.outputChannel.dispose();
	}
}

// Auth types
export interface WhoamiResponse {
	userId: string;
	firstName: string;
	lastName: string;
	organizations: Array<{
		id: string;
		name: string;
	}>;
}

// Agent types
export interface AgentEval {
	id: string;
	name: string;
	description: string | null;
	identifier: string | null;
	devmode: boolean;
	createdAt: string;
	updatedAt: string;
}

export interface Agent {
	id: string;
	name: string;
	description: string | null;
	identifier: string;
	deploymentId: string | null;
	devmode: boolean;
	metadata: Record<string, unknown> | null;
	createdAt: string;
	updatedAt: string;
	evals: AgentEval[];
}

export type AgentListResponse = Agent[];

// KV types
export type KvNamespaceListResponse = string[];

export interface KvKeysResponse {
	namespace: string;
	keys: string[];
}

export interface KvGetResponse {
	exists: boolean;
	data: unknown;
	contentType: string;
}

// Database types
export interface DbInfo {
	name: string;
	url: string;
}

export interface DbListResponse {
	databases: DbInfo[];
}

export interface DbQueryLog {
	timestamp: string;
	command: string;
	sql: string;
	duration: number;
	username: string;
	sessionId?: string;
	error?: string;
}

// Storage types
export interface StorageBucket {
	bucket_name: string;
	access_key?: string;
	secret_key?: string;
	region?: string;
	endpoint?: string;
}

export interface StorageFile {
	key: string;
	size: number;
	lastModified: string;
}

export interface StorageListResponse {
	buckets?: StorageBucket[];
	files?: StorageFile[];
}

export interface StorageFileMetadataResponse {
	success: boolean;
	bucket: string;
	filename: string;
	size?: number;
	contentType?: string;
	lastModified?: string;
}

// Stream types
export interface StreamInfo {
	id: string;
	name: string;
	metadata: Record<string, string>;
	url: string;
	sizeBytes: number;
}

export interface StreamListResponse {
	streams: StreamInfo[];
	total: number;
}

// Vector types
export interface VectorSearchResult {
	id: string;
	key: string;
	similarity: number;
	metadata?: Record<string, unknown>;
}

export interface VectorSearchResponse {
	namespace: string;
	query: string;
	results: VectorSearchResult[];
	count: number;
}

export interface VectorGetResponse {
	exists: boolean;
	key?: string;
	id?: string;
	document?: string;
	metadata?: Record<string, unknown>;
	similarity?: number;
}

// AI types
export interface AiCapabilitiesResponse {
	capabilities: unknown;
}

export interface AiSchemaResponse {
	schema: unknown;
}

// Deploy types
export interface DeployResponse {
	deploymentId: string;
	url?: string;
	status: string;
}

// Deployment types
export interface Deployment {
	id: string;
	state?: string;
	active: boolean;
	createdAt: string;
	message?: string;
	tags: string[];
}

export type DeploymentListResponse = Deployment[];

export interface DeploymentShowResponse {
	id: string;
	state?: string;
	active: boolean;
	createdAt: string;
	updatedAt?: string;
	message?: string;
	tags: string[];
	customDomains?: string[];
	cloudRegion?: string;
	metadata?: {
		git?: {
			repo?: string;
			commit?: string;
			message?: string;
			branch?: string;
			url?: string;
			trigger?: string;
			provider?: string;
			event?: string;
			buildUrl?: string;
		};
		build?: {
			agentuity?: string;
			bun?: string;
			platform?: string;
			arch?: string;
		};
	};
}

export interface DeploymentLog {
	body: string;
	severity: string;
	timestamp: string;
	spanId?: string;
	traceId?: string;
	serviceName?: string;
}

// Session types
export interface SessionListOptions {
	count?: number;
	deploymentId?: string;
	agentIdentifier?: string;
	success?: boolean;
	devmode?: boolean;
	trigger?: 'api' | 'cron' | 'webhook';
	env?: string;
}

export interface Session {
	id: string;
	created_at: string;
	success: boolean;
	duration: number | null;
	method: string;
	url: string;
	trigger: string;
	env: string;
}

export type SessionListResponse = Session[];

export interface SessionGetResponse {
	id: string;
	created_at: string;
	start_time: string;
	end_time: string | null;
	duration: number | null;
	org_id: string;
	project_id: string;
	deployment_id: string;
	agent_ids: string[];
	trigger: string;
	env: string;
	devmode: boolean;
	pending: boolean;
	success: boolean;
	error: string | null;
	method: string;
	url: string;
	route_id: string;
	thread_id: string;
	agents: Array<{ name: string; identifier: string }>;
	eval_runs: Array<{
		id: string;
		eval_id: string;
		created_at: string;
		pending: boolean;
		success: boolean;
		error: string | null;
		result: string | null;
	}>;
	timeline?: unknown;
	route?: {
		id: string;
		method: string;
		path: string;
	} | null;
}

export interface SessionLog {
	body: string;
	severity: string;
	timestamp: string;
}

// Singleton
let _cliClient: CliClient | undefined;

export function getCliClient(): CliClient {
	if (!_cliClient) {
		_cliClient = new CliClient();
	}
	return _cliClient;
}

export function disposeCliClient(): void {
	if (_cliClient) {
		_cliClient.dispose();
		_cliClient = undefined;
	}
}
