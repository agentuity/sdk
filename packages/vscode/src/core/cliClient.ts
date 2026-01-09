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

	// ==================== Sandbox Methods ====================

	/** Default region for sandbox operations when no agentuity.json is present */
	private readonly defaultSandboxRegion = 'usc';

	/**
	 * Get the region for sandbox operations.
	 * Uses region from agentuity.json if present, otherwise falls back to default.
	 */
	getSandboxRegion(): string {
		return this.getProjectRegion() ?? this.defaultSandboxRegion;
	}

	/** Default home path in sandboxes */
	static readonly SANDBOX_HOME = '/home/agentuity/app';

	/**
	 * Create a new sandbox.
	 */
	async sandboxCreate(options: SandboxCreateOptions = {}): Promise<CliResult<SandboxInfo>> {
		const args = ['cloud', 'sandbox', 'create', '--region', this.getSandboxRegion()];

		if (options.memory) {
			args.push('--memory', options.memory);
		}
		if (options.cpu) {
			args.push('--cpu', options.cpu);
		}
		if (options.disk) {
			args.push('--disk', options.disk);
		}
		if (options.network) {
			args.push('--network');
		}
		if (options.idleTimeout) {
			args.push('--idle-timeout', String(options.idleTimeout));
		}
		if (options.execTimeout) {
			args.push('--exec-timeout', String(options.execTimeout));
		}
		if (options.snapshot) {
			args.push('--snapshot', options.snapshot);
		}
		if (options.dependencies && options.dependencies.length > 0) {
			for (const dep of options.dependencies) {
				args.push('--dependency', dep);
			}
		}
		if (options.env) {
			for (const [key, value] of Object.entries(options.env)) {
				args.push('--env', `${key}=${value}`);
			}
		}
		if (options.metadata) {
			for (const [key, value] of Object.entries(options.metadata)) {
				args.push('--metadata', `${key}=${value}`);
			}
		}

		return this.exec<SandboxInfo>(args, { format: 'json', timeout: 120000 });
	}

	/**
	 * List sandboxes with optional filtering.
	 */
	async sandboxList(filter: SandboxListFilter = {}): Promise<CliResult<SandboxInfo[]>> {
		const args = ['cloud', 'sandbox', 'list', '--region', this.getSandboxRegion()];

		if (filter.status) {
			args.push('--status', filter.status);
		}
		if (filter.projectId) {
			args.push('--project-id', filter.projectId);
		}
		if (filter.limit) {
			args.push('--limit', String(filter.limit));
		}
		if (filter.offset) {
			args.push('--offset', String(filter.offset));
		}

		// CLI returns { sandboxes: [...], total: N }, extract the array
		const result = await this.exec<{ sandboxes: SandboxInfo[]; total: number }>(args, {
			format: 'json',
		});
		if (result.success && result.data) {
			return { success: true, data: result.data.sandboxes || [], exitCode: result.exitCode };
		}
		return { success: result.success, error: result.error, data: [], exitCode: result.exitCode };
	}

	/**
	 * Get detailed information about a sandbox.
	 */
	async sandboxGet(sandboxId: string): Promise<CliResult<SandboxInfo>> {
		return this.exec<SandboxInfo>(
			['cloud', 'sandbox', 'get', sandboxId, '--region', this.getSandboxRegion()],
			{ format: 'json' }
		);
	}

	/**
	 * Delete a sandbox.
	 */
	async sandboxDelete(sandboxId: string): Promise<CliResult<void>> {
		return this.exec<void>(
			[
				'cloud',
				'sandbox',
				'delete',
				sandboxId,
				'--confirm',
				'--region',
				this.getSandboxRegion(),
			],
			{ format: 'json' }
		);
	}

	/**
	 * Execute a command in a sandbox.
	 * Note: For streaming output, use sandboxExecInTerminal instead.
	 */
	async sandboxExec(
		sandboxId: string,
		command: string[],
		options: SandboxExecOptions = {}
	): Promise<CliResult<ExecutionInfo>> {
		const args = ['cloud', 'sandbox', 'exec', sandboxId, '--region', this.getSandboxRegion()];

		if (options.timeout) {
			args.push('--timeout', String(options.timeout));
		}
		if (options.timestamps) {
			args.push('--timestamps');
		}

		args.push('--');
		args.push(...command);

		return this.exec<ExecutionInfo>(args, { format: 'json', timeout: options.timeout || 300000 });
	}

	/**
	 * List files in a sandbox directory.
	 */
	async sandboxLs(sandboxId: string, remotePath?: string): Promise<CliResult<SandboxFileInfo[]>> {
		const args = ['cloud', 'sandbox', 'files', sandboxId];
		// Only add path if specified (omit for root listing)
		if (remotePath) {
			args.push(remotePath);
		}
		args.push('-l', '--region', this.getSandboxRegion());

		// CLI returns { files: [...], total: N }, extract the array and add name from path
		const result = await this.exec<{
			files: Array<Omit<SandboxFileInfo, 'name'>>;
			total: number;
		}>(args, { format: 'json' });
		if (result.success && result.data) {
			const files = (result.data.files || []).map((f) => ({
				...f,
				name: f.path.split('/').pop() || f.path, // Extract filename from path
			}));
			return { success: true, data: files, exitCode: result.exitCode };
		}
		return { success: result.success, error: result.error, data: [], exitCode: result.exitCode };
	}

	/**
	 * Upload a file or directory to a sandbox.
	 */
	async sandboxCpToSandbox(
		sandboxId: string,
		localPath: string,
		remotePath: string,
		recursive = false
	): Promise<CliResult<SandboxCpResult>> {
		const args = ['cloud', 'sandbox', 'cp', '--region', this.getSandboxRegion()];
		if (recursive) {
			args.push('-r');
		}
		args.push(localPath, `${sandboxId}:${remotePath}`);
		return this.exec<SandboxCpResult>(args, { format: 'json', timeout: 300000 });
	}

	/**
	 * Download a file or directory from a sandbox.
	 */
	async sandboxCpFromSandbox(
		sandboxId: string,
		remotePath: string,
		localPath: string,
		recursive = false
	): Promise<CliResult<SandboxCpResult>> {
		const args = ['cloud', 'sandbox', 'cp', '--region', this.getSandboxRegion()];
		if (recursive) {
			args.push('-r');
		}
		args.push(`${sandboxId}:${remotePath}`, localPath);
		return this.exec<SandboxCpResult>(args, { format: 'json', timeout: 300000 });
	}

	/**
	 * Upload an archive (tar.gz or zip) to a sandbox and extract it.
	 */
	async sandboxUpload(
		sandboxId: string,
		archivePath: string,
		destPath?: string
	): Promise<CliResult<void>> {
		const args = [
			'cloud',
			'sandbox',
			'upload',
			sandboxId,
			archivePath,
			'--region',
			this.getSandboxRegion(),
		];
		if (destPath) {
			args.push('--path', destPath);
		}
		return this.exec<void>(args, { format: 'json', timeout: 300000 });
	}

	/**
	 * Download sandbox files as an archive.
	 */
	async sandboxDownload(
		sandboxId: string,
		outputPath: string,
		sourcePath?: string
	): Promise<CliResult<void>> {
		const args = [
			'cloud',
			'sandbox',
			'download',
			sandboxId,
			outputPath,
			'--region',
			this.getSandboxRegion(),
		];
		if (sourcePath) {
			args.push('--path', sourcePath);
		}
		return this.exec<void>(args, { format: 'json', timeout: 300000 });
	}

	/**
	 * Create a directory in a sandbox.
	 */
	async sandboxMkdir(
		sandboxId: string,
		remotePath: string,
		recursive = false
	): Promise<CliResult<void>> {
		const args = [
			'cloud',
			'sandbox',
			'mkdir',
			sandboxId,
			remotePath,
			'--region',
			this.getSandboxRegion(),
		];
		if (recursive) {
			args.push('-p');
		}
		return this.exec<void>(args, { format: 'json' });
	}

	/**
	 * Remove a file from a sandbox.
	 */
	async sandboxRm(sandboxId: string, remotePath: string): Promise<CliResult<void>> {
		return this.exec<void>(
			['cloud', 'sandbox', 'rm', sandboxId, remotePath, '--region', this.getSandboxRegion()],
			{ format: 'json' }
		);
	}

	/**
	 * Remove a directory from a sandbox.
	 */
	async sandboxRmdir(
		sandboxId: string,
		remotePath: string,
		recursive = false
	): Promise<CliResult<void>> {
		const args = [
			'cloud',
			'sandbox',
			'rmdir',
			sandboxId,
			remotePath,
			'--region',
			this.getSandboxRegion(),
		];
		if (recursive) {
			args.push('-r');
		}
		return this.exec<void>(args, { format: 'json' });
	}

	/**
	 * Set environment variables in a sandbox.
	 */
	async sandboxEnvSet(
		sandboxId: string,
		vars: Record<string, string>
	): Promise<CliResult<SandboxEnvResult>> {
		const args = ['cloud', 'sandbox', 'env', sandboxId, '--region', this.getSandboxRegion()];
		for (const [key, value] of Object.entries(vars)) {
			args.push(`${key}=${value}`);
		}
		return this.exec<SandboxEnvResult>(args, { format: 'json' });
	}

	/**
	 * Delete environment variables from a sandbox.
	 */
	async sandboxEnvDelete(
		sandboxId: string,
		varNames: string[]
	): Promise<CliResult<SandboxEnvResult>> {
		const args = ['cloud', 'sandbox', 'env', sandboxId, '--region', this.getSandboxRegion()];
		for (const name of varNames) {
			args.push('--delete', name);
		}
		return this.exec<SandboxEnvResult>(args, { format: 'json' });
	}

	/**
	 * Get environment variables from a sandbox.
	 */
	async sandboxEnvGet(sandboxId: string): Promise<CliResult<SandboxEnvResult>> {
		return this.exec<SandboxEnvResult>(
			['cloud', 'sandbox', 'env', sandboxId, '--region', this.getSandboxRegion()],
			{ format: 'json' }
		);
	}

	// ==================== Snapshot Methods ====================

	/**
	 * Create a snapshot of a sandbox.
	 */
	async snapshotCreate(sandboxId: string, tag?: string): Promise<CliResult<SnapshotInfo>> {
		const args = [
			'cloud',
			'sandbox',
			'snapshot',
			'create',
			sandboxId,
			'--region',
			this.getSandboxRegion(),
		];
		if (tag) {
			args.push('--tag', tag);
		}
		return this.exec<SnapshotInfo>(args, { format: 'json', timeout: 120000 });
	}

	/**
	 * List snapshots with optional sandbox filter.
	 */
	async snapshotList(sandboxId?: string): Promise<CliResult<SnapshotInfo[]>> {
		const args = ['cloud', 'sandbox', 'snapshot', 'list', '--region', this.getSandboxRegion()];
		if (sandboxId) {
			args.push('--sandbox', sandboxId);
		}
		// CLI returns { snapshots: [], total: N }
		const result = await this.exec<{ snapshots: SnapshotInfo[]; total: number }>(args, {
			format: 'json',
		});
		if (result.success && result.data) {
			return { success: true, data: result.data.snapshots || [], exitCode: result.exitCode };
		}
		return { success: result.success, error: result.error, data: [], exitCode: result.exitCode };
	}

	/**
	 * Get detailed information about a snapshot.
	 */
	async snapshotGet(snapshotId: string): Promise<CliResult<SnapshotInfo>> {
		return this.exec<SnapshotInfo>(
			['cloud', 'sandbox', 'snapshot', 'get', snapshotId, '--region', this.getSandboxRegion()],
			{ format: 'json' }
		);
	}

	/**
	 * Delete a snapshot.
	 */
	async snapshotDelete(snapshotId: string): Promise<CliResult<void>> {
		return this.exec<void>(
			[
				'cloud',
				'sandbox',
				'snapshot',
				'delete',
				snapshotId,
				'--confirm',
				'--region',
				this.getSandboxRegion(),
			],
			{ format: 'json' }
		);
	}

	/**
	 * Tag or untag a snapshot.
	 */
	async snapshotTag(snapshotId: string, tag: string | null): Promise<CliResult<void>> {
		const args = [
			'cloud',
			'sandbox',
			'snapshot',
			'tag',
			snapshotId,
			'--region',
			this.getSandboxRegion(),
		];
		if (tag === null) {
			args.push('--clear');
		} else {
			args.push(tag);
		}
		return this.exec<void>(args, { format: 'json' });
	}

	// ==================== Execution Methods ====================

	/**
	 * List executions for a sandbox.
	 */
	async executionList(sandboxId: string): Promise<CliResult<ExecutionInfo[]>> {
		// CLI returns { executions: [] }
		const result = await this.exec<{ executions: ExecutionInfo[] }>(
			['cloud', 'sandbox', 'execution', 'list', sandboxId, '--region', this.getSandboxRegion()],
			{ format: 'json' }
		);
		if (result.success && result.data) {
			return { success: true, data: result.data.executions || [], exitCode: result.exitCode };
		}
		return { success: result.success, error: result.error, data: [], exitCode: result.exitCode };
	}

	/**
	 * Get detailed information about an execution.
	 */
	async executionGet(executionId: string): Promise<CliResult<ExecutionInfo>> {
		return this.exec<ExecutionInfo>(
			['cloud', 'sandbox', 'execution', 'get', executionId, '--region', this.getSandboxRegion()],
			{ format: 'json' }
		);
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

// Sandbox types
export type SandboxStatus = 'creating' | 'idle' | 'running' | 'terminated' | 'failed';
export type ExecutionStatus =
	| 'queued'
	| 'running'
	| 'completed'
	| 'failed'
	| 'timeout'
	| 'cancelled';

export interface SandboxResources {
	memory?: string;
	cpu?: string;
	disk?: string;
}

export interface SandboxInfo {
	sandboxId: string;
	status: SandboxStatus;
	createdAt: string;
	region?: string;
	executions?: number;
	resources?: SandboxResources;
	stdoutStreamUrl?: string;
	stderrStreamUrl?: string;
}

export interface SandboxCreateOptions {
	memory?: string;
	cpu?: string;
	disk?: string;
	network?: boolean;
	idleTimeout?: number;
	execTimeout?: number;
	env?: Record<string, string>;
	dependencies?: string[];
	metadata?: Record<string, string>;
	snapshot?: string;
}

export interface SandboxListFilter {
	status?: SandboxStatus;
	projectId?: string;
	limit?: number;
	offset?: number;
}

export interface SandboxExecOptions {
	timeout?: number;
	timestamps?: boolean;
}

export interface SandboxFileInfo {
	path: string;
	name: string;
	size: number;
	isDir: boolean;
	mode: string;
	modTime: string;
}

export interface SnapshotInfo {
	snapshotId: string;
	tag?: string | null;
	sizeBytes: number;
	fileCount: number;
	createdAt: string;
	parentSnapshotId?: string | null;
	downloadUrl?: string;
	sandboxId?: string; // Present in list context
	files?: Array<{ path: string; size: number }>; // Present in get response
}

export interface ExecutionInfo {
	executionId: string;
	status: ExecutionStatus;
	exitCode?: number;
	durationMs?: number;
	output?: string;
	sandboxId?: string;
	startedAt?: string;
	completedAt?: string;
	stdoutStreamUrl?: string;
	stderrStreamUrl?: string;
	command?: string;
}

export interface SandboxCpResult {
	filesTransferred: number;
	bytesTransferred: number;
}

export interface SandboxEnvResult {
	env: Record<string, string>;
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
