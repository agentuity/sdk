import * as vscode from 'vscode';
import { getSandboxManager, formatBytes } from '../../core/sandboxManager';

let statusBarItem: vscode.StatusBarItem | undefined;
let syncStatusItem: vscode.StatusBarItem | undefined;

export function createSandboxStatusBar(context: vscode.ExtensionContext): void {
	// Main sandbox status bar item
	statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50);
	statusBarItem.command = 'agentuity.sandbox.showQuickPick';
	context.subscriptions.push(statusBarItem);

	// Sync status bar item (shown during sync operations)
	syncStatusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 49);
	syncStatusItem.hide();
	context.subscriptions.push(syncStatusItem);

	// Register quick pick command
	context.subscriptions.push(
		vscode.commands.registerCommand('agentuity.sandbox.showQuickPick', showSandboxQuickPick)
	);

	// Update status bar when sandbox manager changes
	updateStatusBar();
}

export function updateStatusBar(): void {
	if (!statusBarItem) {
		return;
	}

	const manager = getSandboxManager();
	const linked = manager.getLinkedSandboxes();

	if (linked.length === 0) {
		statusBarItem.text = '$(vm) No Sandbox';
		statusBarItem.tooltip = 'Click to link a sandbox';
		statusBarItem.backgroundColor = undefined;
	} else if (linked.length === 1) {
		const sandbox = linked[0];
		const name = sandbox.name || sandbox.sandboxId.slice(0, 8);
		statusBarItem.text = `$(vm) ${name}`;
		statusBarItem.tooltip = `Sandbox: ${sandbox.sandboxId}\nLinked: ${new Date(sandbox.linkedAt).toLocaleDateString()}\nLast sync: ${sandbox.lastSyncedAt ? new Date(sandbox.lastSyncedAt).toLocaleString() : 'Never'}\n\nClick for sandbox options`;
		statusBarItem.backgroundColor = undefined;
	} else {
		statusBarItem.text = `$(vm) ${linked.length} Sandboxes`;
		statusBarItem.tooltip = `${linked.length} sandboxes linked\n\nClick for sandbox options`;
		statusBarItem.backgroundColor = undefined;
	}

	statusBarItem.show();
}

export function showSyncProgress(message: string): void {
	if (!syncStatusItem) {
		return;
	}

	syncStatusItem.text = `$(sync~spin) ${message}`;
	syncStatusItem.tooltip = message;
	syncStatusItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
	syncStatusItem.show();
}

export function hideSyncProgress(): void {
	if (syncStatusItem) {
		syncStatusItem.hide();
	}
}

export function showSyncSuccess(filesUploaded: number, bytesTransferred: number): void {
	if (!syncStatusItem) {
		return;
	}

	const sizeStr = formatBytes(bytesTransferred);
	syncStatusItem.text = `$(check) Synced ${filesUploaded} files (${sizeStr})`;
	syncStatusItem.tooltip = `Successfully synced ${filesUploaded} files (${sizeStr})`;
	syncStatusItem.backgroundColor = undefined;
	syncStatusItem.show();

	// Hide after 3 seconds
	setTimeout(() => {
		hideSyncProgress();
	}, 3000);
}

export function showSyncError(error: string): void {
	if (!syncStatusItem) {
		return;
	}

	syncStatusItem.text = '$(error) Sync failed';
	syncStatusItem.tooltip = `Sync failed: ${error}`;
	syncStatusItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
	syncStatusItem.show();

	// Hide after 5 seconds
	setTimeout(() => {
		hideSyncProgress();
	}, 5000);
}

async function showSandboxQuickPick(): Promise<void> {
	const manager = getSandboxManager();
	const linked = manager.getLinkedSandboxes();

	interface SandboxQuickPickItem extends vscode.QuickPickItem {
		action: string;
		sandboxId?: string;
	}

	const items: SandboxQuickPickItem[] = [];

	// Add linked sandboxes with actions
	if (linked.length > 0) {
		items.push({
			label: 'Linked Sandboxes',
			kind: vscode.QuickPickItemKind.Separator,
			action: '',
		});

		for (const sandbox of linked) {
			const name = sandbox.name || sandbox.sandboxId.slice(0, 8);
			items.push({
				label: `$(vm) ${name}`,
				description: sandbox.sandboxId,
				detail: sandbox.lastSyncedAt
					? `Last synced: ${new Date(sandbox.lastSyncedAt).toLocaleString()}`
					: 'Never synced',
				action: 'select',
				sandboxId: sandbox.sandboxId,
			});
		}

		items.push({
			label: 'Actions',
			kind: vscode.QuickPickItemKind.Separator,
			action: '',
		});
	}

	// Add actions
	items.push({
		label: '$(add) Create New Sandbox',
		description: 'Create a new sandbox environment',
		action: 'create',
	});

	items.push({
		label: '$(link) Link Existing Sandbox',
		description: 'Link an existing sandbox to this workspace',
		action: 'link',
	});

	if (linked.length > 0) {
		items.push({
			label: '$(sync) Sync to Sandbox',
			description: 'Sync workspace files to a linked sandbox',
			action: 'sync',
		});

		items.push({
			label: '$(terminal) Execute in Sandbox',
			description: 'Run a command in a sandbox',
			action: 'exec',
		});

		items.push({
			label: '$(eye) View in Explorer',
			description: 'Open the Sandbox Explorer panel',
			action: 'explorer',
		});
	}

	const selected = await vscode.window.showQuickPick(items, {
		placeHolder: 'Select a sandbox or action',
		title: 'Agentuity Sandboxes',
	});

	if (!selected) {
		return;
	}

	switch (selected.action) {
		case 'select':
			if (selected.sandboxId) {
				await showSandboxActions(selected.sandboxId);
			}
			break;
		case 'create':
			await vscode.commands.executeCommand('agentuity.sandbox.create');
			break;
		case 'link':
			await vscode.commands.executeCommand('agentuity.sandbox.link');
			break;
		case 'sync':
			await promptAndSync();
			break;
		case 'exec':
			await promptAndExec();
			break;
		case 'explorer':
			await vscode.commands.executeCommand('agentuity.sandboxes.focus');
			break;
	}
}

async function showSandboxActions(sandboxId: string): Promise<void> {
	const manager = getSandboxManager();
	const linked = manager.getLinkedSandboxes();
	const sandbox = linked.find((s) => s.sandboxId === sandboxId);

	if (!sandbox) {
		return;
	}

	const name = sandbox.name || sandbox.sandboxId.slice(0, 8);

	interface ActionQuickPickItem extends vscode.QuickPickItem {
		action: string;
	}

	const items: ActionQuickPickItem[] = [
		{
			label: '$(sync) Sync Files',
			description: 'Sync workspace files to this sandbox',
			action: 'sync',
		},
		{
			label: '$(terminal) Execute Command',
			description: 'Run a command in this sandbox',
			action: 'exec',
		},
		{
			label: '$(save) Create Snapshot',
			description: 'Save current sandbox state',
			action: 'snapshot',
		},
		{
			label: '$(folder-opened) Browse Files',
			description: 'View files in this sandbox',
			action: 'browse',
		},
		{
			label: '$(link-external) Unlink',
			description: 'Remove this sandbox from workspace',
			action: 'unlink',
		},
	];

	const selected = await vscode.window.showQuickPick(items, {
		placeHolder: `Actions for ${name}`,
		title: `Sandbox: ${name}`,
	});

	if (!selected) {
		return;
	}

	switch (selected.action) {
		case 'sync':
			await vscode.commands.executeCommand('agentuity.sandbox.sync', { sandboxId });
			break;
		case 'exec':
			await promptAndExecForSandbox(sandboxId);
			break;
		case 'snapshot':
			await vscode.commands.executeCommand('agentuity.sandbox.snapshot.create', { sandboxId });
			break;
		case 'browse':
			await vscode.commands.executeCommand('agentuity.sandboxes.focus');
			break;
		case 'unlink':
			await vscode.commands.executeCommand('agentuity.sandbox.unlink', { sandboxId });
			break;
	}
}

async function promptAndSync(): Promise<void> {
	const manager = getSandboxManager();
	const linked = manager.getLinkedSandboxes();

	if (linked.length === 0) {
		vscode.window.showWarningMessage('No sandboxes linked. Link a sandbox first.');
		return;
	}

	let sandboxId: string;

	if (linked.length === 1) {
		sandboxId = linked[0].sandboxId;
	} else {
		// Let user pick which sandbox to sync to
		const items = linked.map((s) => ({
			label: s.name || s.sandboxId.slice(0, 8),
			description: s.sandboxId,
			sandboxId: s.sandboxId,
		}));

		const selected = await vscode.window.showQuickPick(items, {
			placeHolder: 'Select sandbox to sync to',
		});

		if (!selected) {
			return;
		}

		sandboxId = selected.sandboxId;
	}

	await vscode.commands.executeCommand('agentuity.sandbox.sync', { sandboxId });
}

async function promptAndExec(): Promise<void> {
	const manager = getSandboxManager();
	const linked = manager.getLinkedSandboxes();

	if (linked.length === 0) {
		vscode.window.showWarningMessage('No sandboxes linked. Link a sandbox first.');
		return;
	}

	let sandboxId: string;

	if (linked.length === 1) {
		sandboxId = linked[0].sandboxId;
	} else {
		const items = linked.map((s) => ({
			label: s.name || s.sandboxId.slice(0, 8),
			description: s.sandboxId,
			sandboxId: s.sandboxId,
		}));

		const selected = await vscode.window.showQuickPick(items, {
			placeHolder: 'Select sandbox to execute in',
		});

		if (!selected) {
			return;
		}

		sandboxId = selected.sandboxId;
	}

	await promptAndExecForSandbox(sandboxId);
}

async function promptAndExecForSandbox(sandboxId: string): Promise<void> {
	const command = await vscode.window.showInputBox({
		prompt: 'Enter command to execute',
		placeHolder: 'npm test',
	});

	if (!command) {
		return;
	}

	// Use the exec command which opens in terminal
	await vscode.commands.executeCommand('agentuity.sandbox.exec', { sandboxId, command });
}

export function disposeSandboxStatusBar(): void {
	if (statusBarItem) {
		statusBarItem.dispose();
		statusBarItem = undefined;
	}
	if (syncStatusItem) {
		syncStatusItem.dispose();
		syncStatusItem = undefined;
	}
}
