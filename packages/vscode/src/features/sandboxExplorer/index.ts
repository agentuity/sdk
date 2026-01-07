import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { SandboxTreeDataProvider, SandboxTreeItem } from './sandboxTreeData';
import { onAuthStatusChanged } from '../../core/auth';
import {
	getCliClient,
	type SandboxCreateOptions,
	type SandboxInfo,
	type SnapshotInfo,
	CliClient,
} from '../../core/cliClient';
import {
	getSandboxManager,
	initSandboxManager,
	onLinkedSandboxesChanged,
	formatBytes,
	DEFAULT_SANDBOX_PATH,
} from '../../core/sandboxManager';
import { openReadonlyDocument } from '../../core/readonlyDocument';
import {
	createSandboxStatusBar,
	updateStatusBar,
	showSyncProgress,
	hideSyncProgress,
	showSyncSuccess,
	showSyncError,
	disposeSandboxStatusBar,
} from './statusBar';

let sandboxTerminals: Map<string, vscode.Terminal> = new Map();

// Track sandbox files opened for editing: localPath -> { sandboxId, remotePath }
interface SandboxFileMapping {
	sandboxId: string;
	remotePath: string;
}
const sandboxFileMap: Map<string, SandboxFileMapping> = new Map();
let saveListener: vscode.Disposable | undefined;

// Debounce timers for file uploads
const uploadDebounceTimers: Map<string, NodeJS.Timeout> = new Map();
const UPLOAD_DEBOUNCE_MS = 1000; // 1 second debounce

export function registerSandboxExplorer(
	context: vscode.ExtensionContext
): SandboxTreeDataProvider {
	// Initialize sandbox manager
	initSandboxManager(context);

	const provider = new SandboxTreeDataProvider();

	const treeView = vscode.window.createTreeView('agentuity.sandboxes', {
		treeDataProvider: provider,
		showCollapseAll: true,
	});

	// Create status bar
	createSandboxStatusBar(context);

	// Refresh on auth changes
	const authSub = onAuthStatusChanged(() => {
		provider.refresh();
		updateStatusBar();
	});

	// Refresh when linked sandboxes change
	const linkedSub = onLinkedSandboxesChanged(() => {
		provider.refresh();
		updateStatusBar();
	});

	// Register sandbox-specific commands (refresh is registered in extension.ts)
	registerCommands(context, provider);

	// Set up save listener for sandbox files with debouncing
	saveListener = vscode.workspace.onDidSaveTextDocument((doc) => {
		const mapping = sandboxFileMap.get(doc.uri.fsPath);
		if (mapping) {
			// Clear any existing timer for this file
			const existingTimer = uploadDebounceTimers.get(doc.uri.fsPath);
			if (existingTimer) {
				clearTimeout(existingTimer);
			}

			// Set new debounced upload
			const timer = setTimeout(async () => {
				uploadDebounceTimers.delete(doc.uri.fsPath);
				await uploadSavedFile(mapping.sandboxId, doc.uri.fsPath, mapping.remotePath, provider);
			}, UPLOAD_DEBOUNCE_MS);

			uploadDebounceTimers.set(doc.uri.fsPath, timer);
		}
	});

	// Clean up file mappings and pending uploads when documents are closed
	const closeListener = vscode.workspace.onDidCloseTextDocument((doc) => {
		sandboxFileMap.delete(doc.uri.fsPath);
		const timer = uploadDebounceTimers.get(doc.uri.fsPath);
		if (timer) {
			clearTimeout(timer);
			uploadDebounceTimers.delete(doc.uri.fsPath);
		}
	});

	context.subscriptions.push(
		treeView,
		authSub,
		linkedSub,
		saveListener,
		closeListener,
		{ dispose: () => provider.dispose() },
		{ dispose: () => disposeTerminals() },
		{ dispose: () => disposeSandboxStatusBar() },
		{ dispose: () => sandboxFileMap.clear() },
		{
			dispose: () => {
				// Clear all pending upload timers
				for (const timer of uploadDebounceTimers.values()) {
					clearTimeout(timer);
				}
				uploadDebounceTimers.clear();
			},
		}
	);

	return provider;
}

function registerCommands(
	context: vscode.ExtensionContext,
	provider: SandboxTreeDataProvider
): void {
	const cli = getCliClient();

	// Create sandbox
	context.subscriptions.push(
		vscode.commands.registerCommand('agentuity.sandbox.create', async () => {
			await createSandbox(provider);
		})
	);

	// Create sandbox from snapshot
	context.subscriptions.push(
		vscode.commands.registerCommand(
			'agentuity.sandbox.createFromSnapshot',
			async (item?: SandboxTreeItem) => {
				if (item?.snapshotData) {
					await createSandboxFromSnapshot(item.snapshotData.snapshotId, provider);
				} else {
					// Prompt for snapshot
					const snapshotId = await vscode.window.showInputBox({
						prompt: 'Enter snapshot ID or tag',
						placeHolder: 'snp_xxx or tag-name',
					});
					if (snapshotId) {
						await createSandboxFromSnapshot(snapshotId, provider);
					}
				}
			}
		)
	);

	// Delete sandbox
	context.subscriptions.push(
		vscode.commands.registerCommand(
			'agentuity.sandbox.delete',
			async (item?: SandboxTreeItem) => {
				if (!item?.sandboxData) return;
				await deleteSandbox(item.sandboxData.sandboxId, provider);
			}
		)
	);

	// Link sandbox
	context.subscriptions.push(
		vscode.commands.registerCommand(
			'agentuity.sandbox.link',
			async (item?: SandboxTreeItem) => {
				if (!item?.sandboxData) return;
				await linkSandbox(item.sandboxData.sandboxId, provider);
			}
		)
	);

	// Unlink sandbox
	context.subscriptions.push(
		vscode.commands.registerCommand(
			'agentuity.sandbox.unlink',
			async (item?: SandboxTreeItem) => {
				if (!item?.sandboxData) return;
				await unlinkSandbox(item.sandboxData.sandboxId, provider);
			}
		)
	);

	// Sync project to sandbox
	context.subscriptions.push(
		vscode.commands.registerCommand(
			'agentuity.sandbox.sync',
			async (item?: SandboxTreeItem) => {
				let sandboxId: string | undefined;

				if (item?.sandboxData) {
					sandboxId = item.sandboxData.sandboxId;
				} else {
					// Try to get from linked sandboxes
					const linked = getSandboxManager().getLinkedSandboxes();
					if (linked.length === 0) {
						vscode.window.showWarningMessage(
							'No sandbox linked to this workspace. Link a sandbox first.'
						);
						return;
					}
					if (linked.length === 1) {
						sandboxId = linked[0].sandboxId;
					} else {
						// Pick one
						const picked = await vscode.window.showQuickPick(
							linked.map((l) => ({
								label: l.name || l.sandboxId,
								description: l.sandboxId,
								sandboxId: l.sandboxId,
							})),
							{ placeHolder: 'Select sandbox to sync to' }
						);
						if (picked) {
							sandboxId = picked.sandboxId;
						}
					}
				}

				if (sandboxId) {
					await syncToSandbox(sandboxId, provider);
				}
			}
		)
	);

	// Execute command in sandbox
	context.subscriptions.push(
		vscode.commands.registerCommand(
			'agentuity.sandbox.exec',
			async (itemOrOptions?: SandboxTreeItem | { sandboxId: string; command?: string }) => {
				let sandboxId: string | undefined;
				let command: string | undefined;

				if (itemOrOptions instanceof SandboxTreeItem) {
					sandboxId = itemOrOptions.sandboxData?.sandboxId;
				} else if (itemOrOptions && 'sandboxId' in itemOrOptions) {
					sandboxId = itemOrOptions.sandboxId;
					command = itemOrOptions.command;
				}

				if (!sandboxId) return;
				await execInSandbox(sandboxId, command);
			}
		)
	);

	// View file
	context.subscriptions.push(
		vscode.commands.registerCommand(
			'agentuity.sandbox.viewFile',
			async (item?: SandboxTreeItem) => {
				if (!item?.parentSandboxId || !item?.filePath) return;
				await viewSandboxFile(item.parentSandboxId, item.filePath);
			}
		)
	);

	// Download file/directory
	context.subscriptions.push(
		vscode.commands.registerCommand(
			'agentuity.sandbox.download',
			async (item?: SandboxTreeItem) => {
				if (!item?.parentSandboxId || !item?.filePath) return;
				await downloadFromSandbox(item.parentSandboxId, item.filePath, item.itemType === 'directory');
			}
		)
	);

	// Delete file
	context.subscriptions.push(
		vscode.commands.registerCommand(
			'agentuity.sandbox.deleteFile',
			async (item?: SandboxTreeItem) => {
				if (!item?.parentSandboxId || !item?.filePath) return;
				await deleteFile(item.parentSandboxId, item.filePath, item.itemType === 'directory', provider);
			}
		)
	);

	// Create new file in sandbox
	context.subscriptions.push(
		vscode.commands.registerCommand(
			'agentuity.sandbox.createFile',
			async (item?: SandboxTreeItem) => {
				// Get sandbox ID from item or category
				const sandboxId = item?.parentSandboxId || item?.sandboxData?.sandboxId;
				if (!sandboxId) return;

				// Get parent directory path
				let parentDir = '';
				if (item?.itemType === 'directory' && item.filePath) {
					parentDir = item.filePath;
				} else if (item?.itemType === 'file' && item.filePath) {
					parentDir = path.dirname(item.filePath);
				}

				await createSandboxFile(sandboxId, parentDir, provider);
			}
		)
	);

	// Create new folder in sandbox
	context.subscriptions.push(
		vscode.commands.registerCommand(
			'agentuity.sandbox.createFolder',
			async (item?: SandboxTreeItem) => {
				// Get sandbox ID from item or category
				const sandboxId = item?.parentSandboxId || item?.sandboxData?.sandboxId;
				if (!sandboxId) return;

				// Get parent directory path
				let parentDir = '';
				if (item?.itemType === 'directory' && item.filePath) {
					parentDir = item.filePath;
				} else if (item?.itemType === 'file' && item.filePath) {
					parentDir = path.dirname(item.filePath);
				}

				await createSandboxFolder(sandboxId, parentDir, provider);
			}
		)
	);

	// Copy path
	context.subscriptions.push(
		vscode.commands.registerCommand(
			'agentuity.sandbox.copyPath',
			async (item?: SandboxTreeItem) => {
				if (!item?.filePath) return;
				await vscode.env.clipboard.writeText(item.filePath);
				vscode.window.showInformationMessage(`Copied: ${item.filePath}`);
			}
		)
	);

	// View execution
	context.subscriptions.push(
		vscode.commands.registerCommand(
			'agentuity.sandbox.viewExecution',
			async (item?: SandboxTreeItem) => {
				if (!item?.executionData) return;
				await viewExecution(item.executionData.executionId);
			}
		)
	);

	// Set environment variable
	context.subscriptions.push(
		vscode.commands.registerCommand(
			'agentuity.sandbox.setEnv',
			async (item?: SandboxTreeItem) => {
				if (!item?.sandboxData) return;
				await setEnvVar(item.sandboxData.sandboxId);
			}
		)
	);

	// View environment
	context.subscriptions.push(
		vscode.commands.registerCommand(
			'agentuity.sandbox.viewEnv',
			async (item?: SandboxTreeItem) => {
				if (!item?.sandboxData) return;
				await viewEnv(item.sandboxData.sandboxId);
			}
		)
	);

	// Sync .env file
	context.subscriptions.push(
		vscode.commands.registerCommand(
			'agentuity.sandbox.syncEnvFile',
			async (item?: SandboxTreeItem) => {
				if (!item?.sandboxData) return;
				await syncEnvFile(item.sandboxData.sandboxId);
			}
		)
	);

	// Create snapshot
	context.subscriptions.push(
		vscode.commands.registerCommand(
			'agentuity.sandbox.snapshot.create',
			async (item?: SandboxTreeItem) => {
				if (!item?.sandboxData) return;
				await createSnapshot(item.sandboxData.sandboxId, provider);
			}
		)
	);

	// Delete snapshot
	context.subscriptions.push(
		vscode.commands.registerCommand(
			'agentuity.sandbox.snapshot.delete',
			async (item?: SandboxTreeItem) => {
				if (!item?.snapshotData) return;
				await deleteSnapshot(item.snapshotData.snapshotId, provider);
			}
		)
	);

	// Tag snapshot
	context.subscriptions.push(
		vscode.commands.registerCommand(
			'agentuity.sandbox.snapshot.tag',
			async (item?: SandboxTreeItem) => {
				if (!item?.snapshotData) return;
				await tagSnapshot(item.snapshotData.snapshotId, provider);
			}
		)
	);

	// View snapshot details (JSON)
	context.subscriptions.push(
		vscode.commands.registerCommand(
			'agentuity.sandbox.snapshot.viewDetails',
			async (item?: SandboxTreeItem) => {
				if (!item?.snapshotData) return;
				await viewSnapshotDetails(item.snapshotData.snapshotId);
			}
		)
	);

	// View snapshot file (readonly)
	context.subscriptions.push(
		vscode.commands.registerCommand(
			'agentuity.sandbox.snapshot.viewFile',
			async (item?: SandboxTreeItem) => {
				if (!item?.snapshotData || !item?.filePath) return;
				await viewSnapshotFile(item.snapshotData, item.filePath);
			}
		)
	);

	// Upload from explorer (context menu)
	context.subscriptions.push(
		vscode.commands.registerCommand(
			'agentuity.sandbox.upload',
			async (uri?: vscode.Uri) => {
				if (!uri) return;
				await uploadToSandbox(uri);
			}
		)
	);
}

// ==================== Command Implementations ====================

async function createSandbox(provider: SandboxTreeDataProvider): Promise<void> {
	const config = vscode.workspace.getConfiguration('agentuity');
	const defaultMemory = config.get<string>('sandbox.defaultMemory', '512Mi');
	const defaultCpu = config.get<string>('sandbox.defaultCpu', '500m');
	const defaultNetwork = config.get<boolean>('sandbox.defaultNetwork', false);

	// Quick pick for basic vs advanced
	const mode = await vscode.window.showQuickPick(
		[
			{ label: 'Quick Create', description: 'Use default settings' },
			{ label: 'Custom', description: 'Configure resources and options' },
		],
		{ placeHolder: 'How do you want to create the sandbox?' }
	);

	if (!mode) return;

	let options: SandboxCreateOptions = {};

	if (mode.label === 'Custom') {
		// Memory
		const memory = await vscode.window.showInputBox({
			prompt: 'Memory limit',
			value: defaultMemory,
			placeHolder: 'e.g., 512Mi, 1Gi, 2Gi',
		});
		if (memory === undefined) return;
		options.memory = memory || undefined;

		// CPU
		const cpu = await vscode.window.showInputBox({
			prompt: 'CPU limit (millicores)',
			value: defaultCpu,
			placeHolder: 'e.g., 500m, 1000m',
		});
		if (cpu === undefined) return;
		options.cpu = cpu || undefined;

		// Network
		const network = await vscode.window.showQuickPick(
			[
				{ label: 'Disabled', description: 'No outbound network access', value: false },
				{ label: 'Enabled', description: 'Allow outbound network access', value: true },
			],
			{ placeHolder: 'Network access' }
		);
		if (!network) return;
		options.network = network.value;

		// Dependencies
		const deps = await vscode.window.showInputBox({
			prompt: 'APT packages to install (optional)',
			placeHolder: 'e.g., python3 nodejs git',
		});
		if (deps) {
			options.dependencies = deps.split(/\s+/).filter(Boolean);
		}
	} else {
		options = {
			memory: defaultMemory,
			cpu: defaultCpu,
			network: defaultNetwork,
		};
	}

	await vscode.window.withProgress(
		{
			location: vscode.ProgressLocation.Notification,
			title: 'Creating sandbox...',
			cancellable: false,
		},
		async () => {
			const cli = getCliClient();
			const result = await cli.sandboxCreate(options);

			if (result.success && result.data) {
				vscode.window.showInformationMessage(`Sandbox created: ${result.data.sandboxId}`);
				await provider.forceRefresh();
			} else {
				vscode.window.showErrorMessage(`Failed to create sandbox: ${result.error}`);
			}
		}
	);
}

async function createSandboxFromSnapshot(
	snapshotId: string,
	provider: SandboxTreeDataProvider
): Promise<void> {
	await vscode.window.withProgress(
		{
			location: vscode.ProgressLocation.Notification,
			title: 'Creating sandbox from snapshot...',
			cancellable: false,
		},
		async () => {
			const cli = getCliClient();
			const result = await cli.sandboxCreate({ snapshot: snapshotId });

			if (result.success && result.data) {
				vscode.window.showInformationMessage(`Sandbox created: ${result.data.sandboxId}`);
				await provider.forceRefresh();
			} else {
				vscode.window.showErrorMessage(`Failed to create sandbox: ${result.error}`);
			}
		}
	);
}

async function deleteSandbox(sandboxId: string, provider: SandboxTreeDataProvider): Promise<void> {
	const confirm = await vscode.window.showWarningMessage(
		`Are you sure you want to delete sandbox ${sandboxId}?`,
		{ modal: true },
		'Delete'
	);

	if (confirm !== 'Delete') return;

	await vscode.window.withProgress(
		{
			location: vscode.ProgressLocation.Notification,
			title: 'Deleting sandbox...',
			cancellable: false,
		},
		async () => {
			const cli = getCliClient();
			const result = await cli.sandboxDelete(sandboxId);

			if (result.success) {
				// Also unlink if linked
				try {
					await getSandboxManager().unlinkSandbox(sandboxId);
				} catch {
					// Ignore if not linked
				}
				vscode.window.showInformationMessage('Sandbox deleted');
				await provider.forceRefresh();
			} else {
				vscode.window.showErrorMessage(`Failed to delete sandbox: ${result.error}`);
			}
		}
	);
}

async function linkSandbox(sandboxId: string, provider: SandboxTreeDataProvider): Promise<void> {
	const name = await vscode.window.showInputBox({
		prompt: 'Enter a friendly name for this sandbox (optional)',
		placeHolder: 'my-dev-sandbox',
	});

	const remotePath = await vscode.window.showInputBox({
		prompt: 'Remote path for synced files',
		value: DEFAULT_SANDBOX_PATH,
		placeHolder: DEFAULT_SANDBOX_PATH,
	});

	if (remotePath === undefined) return;

	try {
		await getSandboxManager().linkSandbox(sandboxId, {
			name: name || undefined,
			remotePath: remotePath || DEFAULT_SANDBOX_PATH,
		});
		vscode.window.showInformationMessage(`Sandbox linked to workspace`);
		provider.refresh();
	} catch (err) {
		vscode.window.showErrorMessage(
			`Failed to link sandbox: ${err instanceof Error ? err.message : 'Unknown error'}`
		);
	}
}

async function unlinkSandbox(sandboxId: string, provider: SandboxTreeDataProvider): Promise<void> {
	try {
		await getSandboxManager().unlinkSandbox(sandboxId);
		vscode.window.showInformationMessage('Sandbox unlinked from workspace');
		provider.refresh();
	} catch (err) {
		vscode.window.showErrorMessage(
			`Failed to unlink sandbox: ${err instanceof Error ? err.message : 'Unknown error'}`
		);
	}
}

async function syncToSandbox(sandboxId: string, provider: SandboxTreeDataProvider): Promise<void> {
	// Show status bar sync indicator
	showSyncProgress('Syncing to sandbox...');

	await vscode.window.withProgress(
		{
			location: vscode.ProgressLocation.Notification,
			title: 'Syncing files to sandbox...',
			cancellable: false,
		},
		async () => {
			try {
				const manager = getSandboxManager();
				const result = await manager.syncToSandbox(sandboxId);

				vscode.window.showInformationMessage(
					`Synced ${result.filesUploaded} files (${formatBytes(result.bytesTransferred)}) in ${(result.duration / 1000).toFixed(1)}s`
				);

				// Show success in status bar
				showSyncSuccess(result.filesUploaded, result.bytesTransferred);

				// Refresh files cache
				provider.clearSandboxCache(sandboxId);
				provider.refresh();
				updateStatusBar();
			} catch (err) {
				const errorMessage = err instanceof Error ? err.message : 'Unknown error';
				vscode.window.showErrorMessage(`Failed to sync: ${errorMessage}`);
				showSyncError(errorMessage);
			}
		}
	);
}

async function execInSandbox(sandboxId: string, prefilledCommand?: string): Promise<void> {
	const command = prefilledCommand ?? await vscode.window.showInputBox({
		prompt: 'Enter command to execute',
		placeHolder: 'npm test',
	});

	if (!command) return;

	executeInTerminal(sandboxId, command);
}

function executeInTerminal(sandboxId: string, command: string): void {
	const cli = getCliClient();
	const cliPath = cli.getCliPath();

	// Get or create terminal
	let terminal = sandboxTerminals.get(sandboxId);
	if (!terminal || terminal.exitStatus !== undefined) {
		terminal = vscode.window.createTerminal({
			name: `Sandbox: ${sandboxId.slice(0, 8)}`,
			iconPath: new vscode.ThemeIcon('vm'),
		});
		sandboxTerminals.set(sandboxId, terminal);
	}

	terminal.show();
	terminal.sendText(`${cliPath} cloud sandbox exec ${sandboxId} --region ${cli.getSandboxRegion()} -- ${command}`);
}

function disposeTerminals(): void {
	for (const terminal of sandboxTerminals.values()) {
		terminal.dispose();
	}
	sandboxTerminals.clear();
}

async function viewSandboxFile(sandboxId: string, filePath: string): Promise<void> {
	await vscode.window.withProgress(
		{
			location: vscode.ProgressLocation.Notification,
			title: 'Fetching file...',
			cancellable: false,
		},
		async () => {
			const cli = getCliClient();
			// Use a stable temp directory for sandbox files
			const sandboxTmpDir = path.join(os.tmpdir(), 'agentuity-sandbox', sandboxId.slice(0, 12));
			fs.mkdirSync(sandboxTmpDir, { recursive: true });

			const fileName = path.basename(filePath);
			const localPath = path.join(sandboxTmpDir, fileName);

			// Build full remote path under sandbox home
			const fullRemotePath = filePath.startsWith('/')
				? filePath
				: `${CliClient.SANDBOX_HOME}/${filePath}`;

			const result = await cli.sandboxCpFromSandbox(sandboxId, fullRemotePath, localPath);

			if (result.success) {
				// Track this file for save-back
				sandboxFileMap.set(localPath, {
					sandboxId,
					remotePath: fullRemotePath,
				});

				const doc = await vscode.workspace.openTextDocument(localPath);
				await vscode.window.showTextDocument(doc, { preview: false });
			} else {
				vscode.window.showErrorMessage(`Failed to fetch file: ${result.error}`);
			}
		}
	);
}

async function uploadSavedFile(
	sandboxId: string,
	localPath: string,
	remotePath: string,
	provider: SandboxTreeDataProvider
): Promise<void> {
	const cli = getCliClient();
	const result = await cli.sandboxCpToSandbox(sandboxId, localPath, remotePath);

	if (result.success) {
		vscode.window.showInformationMessage(`Saved to sandbox: ${path.basename(remotePath)}`);
		provider.clearSandboxCache(sandboxId);
		provider.refresh();
	} else {
		vscode.window.showErrorMessage(`Failed to save to sandbox: ${result.error}`);
	}
}

async function createSandboxFile(
	sandboxId: string,
	parentDir: string,
	provider: SandboxTreeDataProvider
): Promise<void> {
	const fileName = await vscode.window.showInputBox({
		prompt: 'Enter new file name',
		placeHolder: 'newfile.ts',
		validateInput: (value) => {
			if (!value || value.trim() === '') {
				return 'File name cannot be empty';
			}
			if (value.includes('/') || value.includes('\\')) {
				return 'File name cannot contain path separators';
			}
			return undefined;
		},
	});

	if (!fileName) return;

	// Create temp file locally
	const sandboxTmpDir = path.join(os.tmpdir(), 'agentuity-sandbox', sandboxId.slice(0, 12));
	fs.mkdirSync(sandboxTmpDir, { recursive: true });
	const localPath = path.join(sandboxTmpDir, fileName);

	// Create empty file
	fs.writeFileSync(localPath, '');

	// Build remote path
	const remotePath = parentDir
		? `${CliClient.SANDBOX_HOME}/${parentDir}/${fileName}`
		: `${CliClient.SANDBOX_HOME}/${fileName}`;

	// Track this file for save-back
	sandboxFileMap.set(localPath, {
		sandboxId,
		remotePath,
	});

	// Open in editor - file will be uploaded on first save
	const doc = await vscode.workspace.openTextDocument(localPath);
	await vscode.window.showTextDocument(doc, { preview: false });

	vscode.window.showInformationMessage(
		`New file will be created at ${remotePath} when you save`
	);
}

async function createSandboxFolder(
	sandboxId: string,
	parentDir: string,
	provider: SandboxTreeDataProvider
): Promise<void> {
	const folderName = await vscode.window.showInputBox({
		prompt: 'Enter new folder name',
		placeHolder: 'newfolder',
		validateInput: (value) => {
			if (!value || value.trim() === '') {
				return 'Folder name cannot be empty';
			}
			if (value.includes('/') || value.includes('\\')) {
				return 'Folder name cannot contain path separators';
			}
			return undefined;
		},
	});

	if (!folderName) return;

	const remotePath = parentDir
		? `${CliClient.SANDBOX_HOME}/${parentDir}/${folderName}`
		: `${CliClient.SANDBOX_HOME}/${folderName}`;

	const cli = getCliClient();
	const result = await cli.sandboxMkdir(sandboxId, remotePath, true);

	if (result.success) {
		vscode.window.showInformationMessage(`Created folder: ${folderName}`);
		provider.clearSandboxCache(sandboxId);
		provider.refresh();
	} else {
		vscode.window.showErrorMessage(`Failed to create folder: ${result.error}`);
	}
}

async function downloadFromSandbox(
	sandboxId: string,
	remotePath: string,
	isDirectory: boolean
): Promise<void> {
	const defaultUri = vscode.workspace.workspaceFolders?.[0]?.uri;

	const saveUri = await vscode.window.showSaveDialog({
		defaultUri: defaultUri
			? vscode.Uri.joinPath(defaultUri, path.basename(remotePath))
			: undefined,
		saveLabel: 'Download',
		filters: isDirectory ? { Archives: ['tar.gz', 'zip'] } : {},
	});

	if (!saveUri) return;

	await vscode.window.withProgress(
		{
			location: vscode.ProgressLocation.Notification,
			title: 'Downloading...',
			cancellable: false,
		},
		async () => {
			const cli = getCliClient();
			const result = await cli.sandboxCpFromSandbox(
				sandboxId,
				remotePath,
				saveUri.fsPath,
				isDirectory
			);

			if (result.success) {
				vscode.window.showInformationMessage(`Downloaded to ${saveUri.fsPath}`);
			} else {
				vscode.window.showErrorMessage(`Failed to download: ${result.error}`);
			}
		}
	);
}

async function deleteFile(
	sandboxId: string,
	filePath: string,
	isDirectory: boolean,
	provider: SandboxTreeDataProvider
): Promise<void> {
	const confirm = await vscode.window.showWarningMessage(
		`Delete ${isDirectory ? 'directory' : 'file'} ${filePath}?`,
		{ modal: true },
		'Delete'
	);

	if (confirm !== 'Delete') return;

	const cli = getCliClient();
	const result = isDirectory
		? await cli.sandboxRmdir(sandboxId, filePath, true)
		: await cli.sandboxRm(sandboxId, filePath);

	if (result.success) {
		vscode.window.showInformationMessage(`Deleted ${filePath}`);
		provider.clearSandboxCache(sandboxId);
		provider.refresh();
	} else {
		vscode.window.showErrorMessage(`Failed to delete: ${result.error}`);
	}
}

async function viewExecution(executionId: string): Promise<void> {
	await vscode.window.withProgress(
		{
			location: vscode.ProgressLocation.Notification,
			title: 'Fetching execution details...',
			cancellable: false,
		},
		async () => {
			const cli = getCliClient();
			const result = await cli.executionGet(executionId);

			if (result.success && result.data) {
				const exec = result.data;

				// Build execution details
				const lines: string[] = [
					'='.repeat(60),
					'EXECUTION DETAILS',
					'='.repeat(60),
					`Execution:  ${exec.executionId}`,
					`Sandbox:    ${exec.sandboxId || 'N/A'}`,
					`Status:     ${exec.status}`,
					`Exit Code:  ${exec.exitCode ?? 'N/A'}`,
					`Duration:   ${exec.durationMs ? `${exec.durationMs}ms` : 'N/A'}`,
					`Started:    ${exec.startedAt || 'N/A'}`,
					`Completed:  ${exec.completedAt || 'N/A'}`,
					`Command:    ${exec.command || 'N/A'}`,
				];

				// Fetch stdout stream if available
				if (exec.stdoutStreamUrl) {
					lines.push('', '='.repeat(60), 'STDOUT', '='.repeat(60));
					try {
						const stdoutContent = await fetchStreamContent(exec.stdoutStreamUrl);
						lines.push(stdoutContent || '(empty)');
					} catch (err) {
						lines.push(`(failed to fetch: ${err instanceof Error ? err.message : 'unknown error'})`);
					}
				}

				// Fetch stderr stream if available
				if (exec.stderrStreamUrl) {
					lines.push('', '='.repeat(60), 'STDERR', '='.repeat(60));
					try {
						const stderrContent = await fetchStreamContent(exec.stderrStreamUrl);
						lines.push(stderrContent || '(empty)');
					} catch (err) {
						lines.push(`(failed to fetch: ${err instanceof Error ? err.message : 'unknown error'})`);
					}
				}

				await openReadonlyDocument(lines.join('\n'), 'log', `execution-${executionId.slice(0, 8)}`);
			} else {
				vscode.window.showErrorMessage(`Failed to get execution: ${result.error}`);
			}
		}
	);
}

async function fetchStreamContent(url: string): Promise<string> {
	// Use https module to fetch stream content
	const https = await import('https');
	const http = await import('http');

	return new Promise((resolve, reject) => {
		const protocol = url.startsWith('https') ? https : http;
		const request = protocol.get(url, (response) => {
			if (response.statusCode !== 200) {
				reject(new Error(`HTTP ${response.statusCode}`));
				return;
			}

			let data = '';
			response.on('data', (chunk: Buffer) => {
				data += chunk.toString();
			});
			response.on('end', () => {
				resolve(data);
			});
			response.on('error', reject);
		});

		request.on('error', reject);
		request.setTimeout(10000, () => {
			request.destroy();
			reject(new Error('Request timeout'));
		});
	});
}

async function setEnvVar(sandboxId: string): Promise<void> {
	const input = await vscode.window.showInputBox({
		prompt: 'Enter environment variable (KEY=value)',
		placeHolder: 'MY_VAR=my_value',
	});

	if (!input) return;

	const [key, ...valueParts] = input.split('=');
	const value = valueParts.join('=');

	if (!key || value === undefined) {
		vscode.window.showErrorMessage('Invalid format. Use KEY=value');
		return;
	}

	const cli = getCliClient();
	const result = await cli.sandboxEnvSet(sandboxId, { [key]: value });

	if (result.success) {
		vscode.window.showInformationMessage(`Set ${key}=${value}`);
	} else {
		vscode.window.showErrorMessage(`Failed to set env var: ${result.error}`);
	}
}

async function viewEnv(sandboxId: string): Promise<void> {
	await vscode.window.withProgress(
		{
			location: vscode.ProgressLocation.Notification,
			title: 'Fetching environment variables...',
			cancellable: false,
		},
		async () => {
			const cli = getCliClient();
			// Use exec to run 'env' command to get actual runtime environment
			const result = await cli.sandboxExec(sandboxId, ['env']);

			if (result.success && result.data) {
				const content = result.data.output || '(no environment variables)';
				await openReadonlyDocument(
					content,
					'properties',
					`sandbox-env-${sandboxId.slice(0, 8)}`
				);
			} else {
				vscode.window.showErrorMessage(`Failed to get env: ${result.error}`);
			}
		}
	);
}

async function syncEnvFile(sandboxId: string): Promise<void> {
	const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
	if (!workspaceFolder) {
		vscode.window.showWarningMessage('No workspace folder open');
		return;
	}

	const envPath = path.join(workspaceFolder.uri.fsPath, '.env');
	try {
		const content = await vscode.workspace.fs.readFile(vscode.Uri.file(envPath));
		const text = new TextDecoder().decode(content);

		const vars: Record<string, string> = {};
		for (const line of text.split('\n')) {
			const trimmed = line.trim();
			if (!trimmed || trimmed.startsWith('#')) continue;
			const [key, ...valueParts] = trimmed.split('=');
			if (key && valueParts.length > 0) {
				vars[key] = valueParts.join('=');
			}
		}

		if (Object.keys(vars).length === 0) {
			vscode.window.showWarningMessage('No variables found in .env file');
			return;
		}

		const cli = getCliClient();
		const result = await cli.sandboxEnvSet(sandboxId, vars);

		if (result.success) {
			vscode.window.showInformationMessage(
				`Synced ${Object.keys(vars).length} environment variables`
			);
		} else {
			vscode.window.showErrorMessage(`Failed to sync env: ${result.error}`);
		}
	} catch {
		vscode.window.showWarningMessage('No .env file found in workspace root');
	}
}

async function createSnapshot(
	sandboxId: string,
	provider: SandboxTreeDataProvider
): Promise<void> {
	const tag = await vscode.window.showInputBox({
		prompt: 'Enter a tag for this snapshot (optional)',
		placeHolder: 'v1.0 or latest',
	});

	await vscode.window.withProgress(
		{
			location: vscode.ProgressLocation.Notification,
			title: 'Creating snapshot...',
			cancellable: false,
		},
		async () => {
			const cli = getCliClient();
			const result = await cli.snapshotCreate(sandboxId, tag || undefined);

			if (result.success && result.data) {
				vscode.window.showInformationMessage(
					`Snapshot created: ${result.data.snapshotId}${tag ? ` [${tag}]` : ''}`
				);
				provider.clearSandboxCache(sandboxId);
				provider.refresh();
			} else {
				vscode.window.showErrorMessage(`Failed to create snapshot: ${result.error}`);
			}
		}
	);
}

async function deleteSnapshot(
	snapshotId: string,
	provider: SandboxTreeDataProvider
): Promise<void> {
	const confirm = await vscode.window.showWarningMessage(
		`Are you sure you want to delete snapshot ${snapshotId}?`,
		{ modal: true },
		'Delete'
	);

	if (confirm !== 'Delete') return;

	const cli = getCliClient();
	const result = await cli.snapshotDelete(snapshotId);

	if (result.success) {
		vscode.window.showInformationMessage('Snapshot deleted');
		await provider.forceRefresh();
	} else {
		vscode.window.showErrorMessage(`Failed to delete snapshot: ${result.error}`);
	}
}

async function tagSnapshot(snapshotId: string, provider: SandboxTreeDataProvider): Promise<void> {
	const tag = await vscode.window.showInputBox({
		prompt: 'Enter new tag (leave empty to remove tag)',
		placeHolder: 'v1.0 or latest',
	});

	if (tag === undefined) return;

	const cli = getCliClient();
	const result = await cli.snapshotTag(snapshotId, tag || null);

	if (result.success) {
		vscode.window.showInformationMessage(tag ? `Tagged as: ${tag}` : 'Tag removed');
		await provider.forceRefresh();
	} else {
		vscode.window.showErrorMessage(`Failed to update tag: ${result.error}`);
	}
}

async function viewSnapshotDetails(snapshotId: string): Promise<void> {
	await vscode.window.withProgress(
		{
			location: vscode.ProgressLocation.Notification,
			title: 'Fetching snapshot details...',
			cancellable: false,
		},
		async () => {
			const cli = getCliClient();
			const result = await cli.snapshotGet(snapshotId);

			if (result.success && result.data) {
				const content = JSON.stringify(result.data, null, 2);
				await openReadonlyDocument(content, 'json', `snapshot-${snapshotId.slice(0, 8)}`);
			} else {
				vscode.window.showErrorMessage(`Failed to get snapshot: ${result.error}`);
			}
		}
	);
}

async function viewSnapshotFile(snapshot: SnapshotInfo, filePath: string): Promise<void> {
	if (!snapshot.downloadUrl) {
		vscode.window.showErrorMessage('Snapshot does not have a download URL');
		return;
	}

	await vscode.window.withProgress(
		{
			location: vscode.ProgressLocation.Notification,
			title: `Fetching ${path.basename(filePath)}...`,
			cancellable: false,
		},
		async () => {
			try {
				// Create temp directory for snapshot files
				const snapshotTmpDir = path.join(os.tmpdir(), 'agentuity-snapshots', snapshot.snapshotId.slice(0, 12));
				fs.mkdirSync(snapshotTmpDir, { recursive: true });

				const archivePath = path.join(snapshotTmpDir, 'snapshot.tar.gz');
				const extractDir = path.join(snapshotTmpDir, 'files');

				// Download and extract the archive if not already cached
				if (!fs.existsSync(extractDir)) {
					// Download tar.gz
					await downloadFile(snapshot.downloadUrl!, archivePath);

					// Extract using tar module
					fs.mkdirSync(extractDir, { recursive: true });
					const tar = await import('tar');
					await tar.x({
						file: archivePath,
						cwd: extractDir,
					});
				}

				// Read the specific file
				const targetFile = path.join(extractDir, filePath);
				if (!fs.existsSync(targetFile)) {
					vscode.window.showErrorMessage(`File not found in snapshot: ${filePath}`);
					return;
				}

				const content = fs.readFileSync(targetFile, 'utf-8');
				const ext = path.extname(filePath).slice(1) || 'txt';
				await openReadonlyDocument(
					content,
					ext,
					`snapshot-${snapshot.snapshotId.slice(0, 8)}-${path.basename(filePath)}`
				);
			} catch (err) {
				vscode.window.showErrorMessage(
					`Failed to view snapshot file: ${err instanceof Error ? err.message : 'unknown error'}`
				);
			}
		}
	);
}

async function downloadFile(url: string, destPath: string): Promise<void> {
	const https = await import('https');
	const http = await import('http');

	return new Promise((resolve, reject) => {
		const protocol = url.startsWith('https') ? https : http;
		const file = fs.createWriteStream(destPath);

		const request = protocol.get(url, (response) => {
			// Handle redirects
			if (response.statusCode === 301 || response.statusCode === 302) {
				const redirectUrl = response.headers.location;
				if (redirectUrl) {
					file.close();
					fs.unlinkSync(destPath);
					downloadFile(redirectUrl, destPath).then(resolve).catch(reject);
					return;
				}
			}

			if (response.statusCode !== 200) {
				file.close();
				fs.unlinkSync(destPath);
				reject(new Error(`HTTP ${response.statusCode}`));
				return;
			}

			response.pipe(file);
			file.on('finish', () => {
				file.close();
				resolve();
			});
			file.on('error', (err) => {
				fs.unlinkSync(destPath);
				reject(err);
			});
		});

		request.on('error', (err) => {
			file.close();
			try { fs.unlinkSync(destPath); } catch {}
			reject(err);
		});

		request.setTimeout(60000, () => {
			request.destroy();
			file.close();
			try { fs.unlinkSync(destPath); } catch {}
			reject(new Error('Download timeout'));
		});
	});
}

async function uploadToSandbox(uri: vscode.Uri): Promise<void> {
	const linked = getSandboxManager().getLinkedSandboxes();

	if (linked.length === 0) {
		vscode.window.showWarningMessage('No sandbox linked. Link a sandbox first.');
		return;
	}

	let sandboxId: string;
	if (linked.length === 1) {
		sandboxId = linked[0].sandboxId;
	} else {
		const picked = await vscode.window.showQuickPick(
			linked.map((l) => ({
				label: l.name || l.sandboxId,
				description: l.sandboxId,
				sandboxId: l.sandboxId,
			})),
			{ placeHolder: 'Select sandbox to upload to' }
		);
		if (!picked) return;
		sandboxId = picked.sandboxId;
	}

	const remotePath = await vscode.window.showInputBox({
		prompt: 'Remote path',
		value: linked.find((l) => l.sandboxId === sandboxId)?.remotePath || DEFAULT_SANDBOX_PATH,
	});

	if (!remotePath) return;

	await vscode.window.withProgress(
		{
			location: vscode.ProgressLocation.Notification,
			title: 'Uploading...',
			cancellable: false,
		},
		async () => {
			const cli = getCliClient();
			const stats = await vscode.workspace.fs.stat(uri);
			const isDir = stats.type === vscode.FileType.Directory;

			const result = await cli.sandboxCpToSandbox(
				sandboxId,
				uri.fsPath,
				remotePath,
				isDir
			);

			if (result.success) {
				vscode.window.showInformationMessage(`Uploaded to ${remotePath}`);
			} else {
				vscode.window.showErrorMessage(`Failed to upload: ${result.error}`);
			}
		}
	);
}

export { SandboxTreeDataProvider };
