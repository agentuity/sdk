import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { spawn } from 'child_process';
import { getCliClient, CliClient, type SandboxInfo } from './cliClient';

/** Default remote path for sandbox file operations */
export const DEFAULT_SANDBOX_PATH = CliClient.SANDBOX_HOME;

/**
 * Represents a sandbox linked to the current workspace.
 */
export interface LinkedSandbox {
	sandboxId: string;
	name?: string;
	linkedAt: string;
	lastSyncedAt?: string;
	remotePath: string;
}

/**
 * Options for syncing files to a sandbox.
 */
export interface SyncOptions {
	remotePath?: string;
	clean?: boolean;
}

/**
 * Result of a sync operation.
 */
export interface SyncResult {
	filesUploaded: number;
	bytesTransferred: number;
	duration: number;
}

const LINKED_SANDBOXES_KEY = 'agentuity.linkedSandboxes';

let _sandboxManager: SandboxManager | undefined;
const _onLinkedSandboxesChanged = new vscode.EventEmitter<LinkedSandbox[]>();
export const onLinkedSandboxesChanged = _onLinkedSandboxesChanged.event;

/**
 * Manages sandbox linking and file synchronization for workspaces.
 */
export class SandboxManager {
	private context: vscode.ExtensionContext;
	private cliClient: CliClient;

	constructor(context: vscode.ExtensionContext) {
		this.context = context;
		this.cliClient = getCliClient();
	}

	/**
	 * Get all sandboxes linked to the current workspace.
	 */
	getLinkedSandboxes(): LinkedSandbox[] {
		const workspaceKey = this.getWorkspaceKey();
		if (!workspaceKey) return [];

		const allLinked = this.context.workspaceState.get<Record<string, LinkedSandbox[]>>(
			LINKED_SANDBOXES_KEY,
			{}
		);
		return allLinked[workspaceKey] || [];
	}

	/**
	 * Link a sandbox to the current workspace.
	 */
	async linkSandbox(
		sandboxId: string,
		options: { name?: string; remotePath?: string } = {}
	): Promise<void> {
		const workspaceKey = this.getWorkspaceKey();
		if (!workspaceKey) {
			throw new Error('No workspace folder open');
		}

		// Verify sandbox exists
		const result = await this.cliClient.sandboxGet(sandboxId);
		if (!result.success) {
			throw new Error(`Failed to verify sandbox: ${result.error}`);
		}

		const allLinked = this.context.workspaceState.get<Record<string, LinkedSandbox[]>>(
			LINKED_SANDBOXES_KEY,
			{}
		);
		const workspaceLinks = allLinked[workspaceKey] || [];

		// Check if already linked
		const existingIndex = workspaceLinks.findIndex((l) => l.sandboxId === sandboxId);
		if (existingIndex >= 0) {
			// Update existing link
			workspaceLinks[existingIndex] = {
				...workspaceLinks[existingIndex],
				name: options.name ?? workspaceLinks[existingIndex].name,
				remotePath: options.remotePath ?? workspaceLinks[existingIndex].remotePath,
			};
		} else {
			// Add new link
			workspaceLinks.push({
				sandboxId,
				name: options.name,
				linkedAt: new Date().toISOString(),
				remotePath: options.remotePath ?? DEFAULT_SANDBOX_PATH,
			});
		}

		allLinked[workspaceKey] = workspaceLinks;
		await this.context.workspaceState.update(LINKED_SANDBOXES_KEY, allLinked);
		_onLinkedSandboxesChanged.fire(workspaceLinks);
	}

	/**
	 * Unlink a sandbox from the current workspace.
	 */
	async unlinkSandbox(sandboxId: string): Promise<void> {
		const workspaceKey = this.getWorkspaceKey();
		if (!workspaceKey) return;

		const allLinked = this.context.workspaceState.get<Record<string, LinkedSandbox[]>>(
			LINKED_SANDBOXES_KEY,
			{}
		);
		const workspaceLinks = allLinked[workspaceKey] || [];

		const filtered = workspaceLinks.filter((l) => l.sandboxId !== sandboxId);
		allLinked[workspaceKey] = filtered;
		await this.context.workspaceState.update(LINKED_SANDBOXES_KEY, allLinked);
		_onLinkedSandboxesChanged.fire(filtered);
	}

	/**
	 * Check if a sandbox is linked to the current workspace.
	 */
	isLinked(sandboxId: string): boolean {
		return this.getLinkedSandboxes().some((l) => l.sandboxId === sandboxId);
	}

	/**
	 * Get linked sandbox info by ID.
	 */
	getLinkedSandbox(sandboxId: string): LinkedSandbox | undefined {
		return this.getLinkedSandboxes().find((l) => l.sandboxId === sandboxId);
	}

	/**
	 * Sync workspace files to a sandbox, respecting .gitignore.
	 */
	async syncToSandbox(sandboxId: string, options: SyncOptions = {}): Promise<SyncResult> {
		const workspaceFolder = this.getWorkspaceFolder();
		if (!workspaceFolder) {
			throw new Error('No workspace folder open');
		}

		const remotePath = options.remotePath ?? DEFAULT_SANDBOX_PATH;
		const startTime = Date.now();

		// Get files to sync (respecting .gitignore)
		const files = await this.getFilesToSync(workspaceFolder);
		if (files.length === 0) {
			return { filesUploaded: 0, bytesTransferred: 0, duration: Date.now() - startTime };
		}

		// Create tar.gz archive
		const archivePath = await this.createSyncArchive(files, workspaceFolder.uri.fsPath);

		try {
			// Get archive size
			const stats = fs.statSync(archivePath);
			const bytesTransferred = stats.size;

			// Upload and extract
			const uploadResult = await this.cliClient.sandboxUpload(
				sandboxId,
				archivePath,
				remotePath
			);
			if (!uploadResult.success) {
				throw new Error(`Failed to upload files: ${uploadResult.error}`);
			}

			// Update last synced time
			await this.updateLastSynced(sandboxId);

			return {
				filesUploaded: files.length,
				bytesTransferred,
				duration: Date.now() - startTime,
			};
		} finally {
			// Clean up temp archive
			try {
				fs.unlinkSync(archivePath);
			} catch {
				// Ignore cleanup errors
			}
		}
	}

	/**
	 * Download files from a sandbox to a local path.
	 */
	async downloadFromSandbox(
		sandboxId: string,
		remotePath: string,
		localPath: string
	): Promise<void> {
		const result = await this.cliClient.sandboxCpFromSandbox(
			sandboxId,
			remotePath,
			localPath,
			true
		);
		if (!result.success) {
			throw new Error(`Failed to download files: ${result.error}`);
		}
	}

	/**
	 * Get the list of files to sync, respecting .gitignore and default exclusions.
	 */
	private async getFilesToSync(workspaceFolder: vscode.WorkspaceFolder): Promise<string[]> {
		const rootPath = workspaceFolder.uri.fsPath;

		// Get default exclusions from settings
		const config = vscode.workspace.getConfiguration('agentuity');
		const defaultExclusions = config.get<string[]>('sandbox.syncExclusions', [
			'.git',
			'node_modules',
			'.agentuity',
			'dist',
			'build',
		]);

		// Use git ls-files if in a git repo, otherwise walk directory
		const isGitRepo = fs.existsSync(path.join(rootPath, '.git'));

		if (isGitRepo) {
			return this.getGitTrackedFiles(rootPath, defaultExclusions);
		} else {
			return this.walkDirectory(rootPath, defaultExclusions);
		}
	}

	/**
	 * Get files tracked by git (respects .gitignore automatically).
	 */
	private getGitTrackedFiles(rootPath: string, additionalExclusions: string[]): Promise<string[]> {
		return new Promise((resolve, reject) => {
			// Use git ls-files to get all tracked and untracked (but not ignored) files
			const child = spawn('git', ['ls-files', '-co', '--exclude-standard'], {
				cwd: rootPath,
				shell: true,
			});

			let stdout = '';
			let stderr = '';

			child.stdout?.on('data', (data: Buffer) => {
				stdout += data.toString();
			});

			child.stderr?.on('data', (data: Buffer) => {
				stderr += data.toString();
			});

			child.on('error', (err) => {
				reject(new Error(`Git command failed: ${err.message}`));
			});

			child.on('close', (code) => {
				if (code !== 0) {
					reject(new Error(`Git command failed: ${stderr}`));
					return;
				}

				const files = stdout
					.trim()
					.split('\n')
					.filter((f) => f.length > 0)
					.filter((f) => {
						// Apply additional exclusions
						for (const exclusion of additionalExclusions) {
							if (f.startsWith(exclusion + '/') || f === exclusion) {
								return false;
							}
						}
						return true;
					});

				resolve(files);
			});
		});
	}

	/**
	 * Walk directory manually (for non-git projects).
	 */
	private walkDirectory(rootPath: string, exclusions: string[]): Promise<string[]> {
		return new Promise((resolve) => {
			const files: string[] = [];

			const walk = (dir: string, relativePath: string = '') => {
				const entries = fs.readdirSync(dir, { withFileTypes: true });

				for (const entry of entries) {
					const entryRelPath = relativePath ? `${relativePath}/${entry.name}` : entry.name;

					// Check exclusions
					let excluded = false;
					for (const exclusion of exclusions) {
						if (entryRelPath.startsWith(exclusion + '/') || entryRelPath === exclusion) {
							excluded = true;
							break;
						}
					}
					if (excluded) continue;

					const fullPath = path.join(dir, entry.name);

					if (entry.isDirectory()) {
						walk(fullPath, entryRelPath);
					} else if (entry.isFile()) {
						files.push(entryRelPath);
					}
				}
			};

			walk(rootPath);
			resolve(files);
		});
	}

	/**
	 * Create a tar.gz archive of the specified files.
	 */
	private createSyncArchive(files: string[], rootPath: string): Promise<string> {
		return new Promise((resolve, reject) => {
			const tmpDir = os.tmpdir();
			const archiveName = `agentuity-sync-${Date.now()}.tar.gz`;
			const archivePath = path.join(tmpDir, archiveName);

			// Write file list to a temp file for tar
			const fileListPath = path.join(tmpDir, `agentuity-files-${Date.now()}.txt`);
			fs.writeFileSync(fileListPath, files.join('\n'));

			// Create tar.gz using tar command
			const child = spawn('tar', ['-czf', archivePath, '-T', fileListPath], {
				cwd: rootPath,
				shell: true,
			});

			let stderr = '';

			child.stderr?.on('data', (data: Buffer) => {
				stderr += data.toString();
			});

			child.on('error', (err) => {
				try {
					fs.unlinkSync(fileListPath);
				} catch {
					// Ignore
				}
				reject(new Error(`Failed to create archive: ${err.message}`));
			});

			child.on('close', (code) => {
				try {
					fs.unlinkSync(fileListPath);
				} catch {
					// Ignore
				}

				if (code !== 0) {
					reject(new Error(`Failed to create archive: ${stderr}`));
					return;
				}

				resolve(archivePath);
			});
		});
	}

	/**
	 * Update the last synced timestamp for a linked sandbox.
	 */
	private async updateLastSynced(sandboxId: string): Promise<void> {
		const workspaceKey = this.getWorkspaceKey();
		if (!workspaceKey) return;

		const allLinked = this.context.workspaceState.get<Record<string, LinkedSandbox[]>>(
			LINKED_SANDBOXES_KEY,
			{}
		);
		const workspaceLinks = allLinked[workspaceKey] || [];

		const linkIndex = workspaceLinks.findIndex((l) => l.sandboxId === sandboxId);
		if (linkIndex >= 0) {
			workspaceLinks[linkIndex].lastSyncedAt = new Date().toISOString();
			allLinked[workspaceKey] = workspaceLinks;
			await this.context.workspaceState.update(LINKED_SANDBOXES_KEY, allLinked);
		}
	}

	/**
	 * Get a unique key for the current workspace.
	 */
	private getWorkspaceKey(): string | undefined {
		const folder = this.getWorkspaceFolder();
		return folder?.uri.fsPath;
	}

	/**
	 * Get the current workspace folder.
	 */
	private getWorkspaceFolder(): vscode.WorkspaceFolder | undefined {
		const folders = vscode.workspace.workspaceFolders;
		return folders?.[0];
	}

	/**
	 * Refresh sandbox info for all linked sandboxes.
	 * Returns info about which sandboxes are still valid.
	 */
	async refreshLinkedSandboxes(): Promise<Map<string, SandboxInfo | null>> {
		const linked = this.getLinkedSandboxes();
		const results = new Map<string, SandboxInfo | null>();

		for (const link of linked) {
			const result = await this.cliClient.sandboxGet(link.sandboxId);
			if (result.success && result.data) {
				results.set(link.sandboxId, result.data);
			} else {
				results.set(link.sandboxId, null);
			}
		}

		return results;
	}

	dispose(): void {
		// Nothing to dispose currently
	}
}

/**
 * Initialize the sandbox manager.
 */
export function initSandboxManager(context: vscode.ExtensionContext): SandboxManager {
	if (!_sandboxManager) {
		_sandboxManager = new SandboxManager(context);
	}
	return _sandboxManager;
}

/**
 * Get the sandbox manager instance.
 */
export function getSandboxManager(): SandboxManager {
	if (!_sandboxManager) {
		throw new Error('SandboxManager not initialized. Call initSandboxManager first.');
	}
	return _sandboxManager;
}

/**
 * Dispose the sandbox manager.
 */
export function disposeSandboxManager(): void {
	if (_sandboxManager) {
		_sandboxManager.dispose();
		_sandboxManager = undefined;
	}
	_onLinkedSandboxesChanged.dispose();
}

/**
 * Format bytes to human-readable string.
 */
export function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}
