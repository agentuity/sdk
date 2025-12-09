import * as vscode from 'vscode';
import { DataTreeDataProvider, DataTreeItem } from './dataTreeData';
import { onAuthStatusChanged } from '../../core/auth';
import { onProjectChanged } from '../../core/project';
import { getCliClient } from '../../core/cliClient';
import { openReadonlyDocument } from '../../core/readonlyDocument';

export function registerDataExplorer(context: vscode.ExtensionContext): DataTreeDataProvider {
	const provider = new DataTreeDataProvider();

	const treeView = vscode.window.createTreeView('agentuity.data', {
		treeDataProvider: provider,
		showCollapseAll: true,
	});

	treeView.onDidChangeSelection(async (e) => {
		if (e.selection.length === 0) return;
		const item = e.selection[0];

		if (item.itemType === 'key' && item.parentName) {
			await openDataValue(item);
		} else if (item.itemType === 'database') {
			await copyDatabaseConnectionString(item);
		} else if (item.itemType === 'vectorResult' && item.parentName) {
			await openVectorDocument(item);
		} else if (item.itemType === 'storageFile' && item.parentName) {
			await openStorageFile(item);
		} else if (item.itemType === 'streamItem' && item.streamInfo) {
			await openStreamDetails(item);
		}
	});

	const authSub = onAuthStatusChanged(() => {
		provider.refresh();
	});

	const projectSub = onProjectChanged(() => {
		provider.refresh();
	});

	// Database commands
	context.subscriptions.push(
		vscode.commands.registerCommand(
			'agentuity.db.copyConnectionString',
			async (item: DataTreeItem) => {
				if (item?.itemType === 'database') {
					await copyDatabaseConnectionString(item);
				}
			}
		)
	);

	context.subscriptions.push(
		vscode.commands.registerCommand(
			'agentuity.db.openConnectionUri',
			async (item: DataTreeItem) => {
				if (item?.itemType !== 'database') return;

				const cli = getCliClient();
				const name = String(item.label);
				const result = await cli.getDatabase(name);

				if (!result.success || !result.data) {
					vscode.window.showErrorMessage(
						`Failed to get database "${name}": ${result.error ?? 'Unknown error'}`
					);
					return;
				}

				try {
					await vscode.env.openExternal(vscode.Uri.parse(result.data.url));
				} catch {
					vscode.window.showErrorMessage(`Could not open URI: ${result.data.url}`);
				}
			}
		)
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('agentuity.db.viewLogs', async (item: DataTreeItem) => {
			if (item?.itemType !== 'database') return;

			const cli = getCliClient();
			const name = String(item.label);

			await vscode.window.withProgress(
				{
					location: vscode.ProgressLocation.Notification,
					title: `Fetching database logs for "${name}"...`,
					cancellable: false,
				},
				async () => {
					const result = await cli.getDbLogs(name, { limit: 100 });

					if (!result.success || !result.data) {
						vscode.window.showErrorMessage(
							`Failed to fetch database logs: ${result.error ?? 'Unknown error'}`
						);
						return;
					}

					if (result.data.length === 0) {
						vscode.window.showInformationMessage('No logs found for this database');
						return;
					}

					const logContent = result.data
						.map((log) => {
							const timestamp = new Date(log.timestamp).toLocaleString();
							const duration = `${log.duration}ms`;
							const sql =
								log.sql.length > 200 ? log.sql.substring(0, 200) + '...' : log.sql;
							const errorLine = log.error ? `\n  ERROR: ${log.error}` : '';
							return `[${timestamp}] [${log.command}] (${duration})\n  ${sql}${errorLine}`;
						})
						.join('\n\n');

					await openReadonlyDocument(logContent, 'log', `db-logs-${name}`);
				}
			);
		})
	);

	// Vector commands
	context.subscriptions.push(
		vscode.commands.registerCommand('agentuity.vector.search', async () => {
			const cli = getCliClient();

			const namespace = await vscode.window.showInputBox({
				prompt: 'Vector namespace',
				placeHolder: 'e.g., default, products, knowledge-base',
				ignoreFocusOut: true,
			});
			if (!namespace) return;

			const query = await vscode.window.showInputBox({
				prompt: 'Search query (text to find similar vectors)',
				placeHolder: 'Enter search text...',
				ignoreFocusOut: true,
			});
			if (!query) return;

			const result = await cli.vectorSearch(namespace, query);
			if (!result.success || !result.data) {
				vscode.window.showErrorMessage(
					`Vector search failed: ${result.error ?? 'Unknown error'}`
				);
				return;
			}

			provider.addVectorSearchGroup({
				id: `${namespace}:${Date.now()}`,
				label: `"${query}" in ${namespace}`,
				namespace,
				query,
				results: result.data.results ?? [],
			});

			vscode.window.showInformationMessage(
				`Found ${result.data.count} result${result.data.count !== 1 ? 's' : ''}`
			);
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('agentuity.vector.clearSearches', () => {
			provider.clearVectorSearchGroups();
			vscode.window.showInformationMessage('Cleared vector search results');
		})
	);

	context.subscriptions.push(treeView, authSub, projectSub, { dispose: () => provider.dispose() });

	return provider;
}

async function copyDatabaseConnectionString(item: DataTreeItem): Promise<void> {
	const cli = getCliClient();
	const name = String(item.label);
	const result = await cli.getDatabase(name);

	if (!result.success || !result.data) {
		vscode.window.showErrorMessage(
			`Failed to get database "${name}": ${result.error ?? 'Unknown error'}`
		);
		return;
	}

	await vscode.env.clipboard.writeText(result.data.url);
	vscode.window.showInformationMessage(`Copied connection string for "${name}" to clipboard`);
}

async function openVectorDocument(item: DataTreeItem): Promise<void> {
	const cli = getCliClient();
	const key = item.label as string;
	const namespace = item.parentName!;

	const result = await cli.getVector(namespace, key);
	if (!result.success || !result.data) {
		vscode.window.showErrorMessage(`Failed to get vector: ${result.error}`);
		return;
	}

	if (!result.data.exists) {
		vscode.window.showWarningMessage(`Vector "${key}" does not exist`);
		return;
	}

	// Build content with metadata at top, then document
	const lines: string[] = [];

	// Add metadata section
	lines.push('=== Metadata ===');
	lines.push(`Key: ${result.data.key}`);
	lines.push(`ID: ${result.data.id}`);
	if (result.data.metadata && Object.keys(result.data.metadata).length > 0) {
		lines.push(`Metadata: ${JSON.stringify(result.data.metadata, null, 2)}`);
	}

	lines.push('');
	lines.push('=== Document ===');
	lines.push('');
	lines.push(result.data.document);

	await openReadonlyDocument(lines.join('\n'), 'plaintext', `vector-${key}`);
}

async function openDataValue(item: DataTreeItem): Promise<void> {
	const cli = getCliClient();
	const key = item.label as string;
	const namespace = item.parentName!;

	const result = await cli.getKvValue(namespace, key);
	if (result.success && result.data) {
		if (!result.data.exists) {
			vscode.window.showWarningMessage(`Key "${key}" does not exist`);
			return;
		}
		await openContent(result.data.data, result.data.contentType);
	} else {
		vscode.window.showErrorMessage(`Failed to get value: ${result.error}`);
	}
}

async function openStorageFile(item: DataTreeItem): Promise<void> {
	const cli = getCliClient();
	const filename = item.label as string;
	const bucket = item.parentName!;

	const result = await cli.getStorageFileMetadata(bucket, filename);
	if (!result.success || !result.data) {
		vscode.window.showErrorMessage(`Failed to get file metadata: ${result.error}`);
		return;
	}

	const lines: string[] = [];
	lines.push('=== Storage File Metadata ===');
	lines.push(`Bucket: ${result.data.bucket}`);
	lines.push(`Filename: ${result.data.filename}`);
	if (result.data.size !== undefined) {
		lines.push(`Size: ${formatFileSize(result.data.size)}`);
	}
	if (result.data.contentType) {
		lines.push(`Content-Type: ${result.data.contentType}`);
	}
	if (result.data.lastModified) {
		lines.push(`Last Modified: ${result.data.lastModified}`);
	}

	await openReadonlyDocument(lines.join('\n'), 'plaintext', `storage-${filename}`);
}

async function openStreamDetails(item: DataTreeItem): Promise<void> {
	const stream = item.streamInfo!;

	const content = JSON.stringify(
		{
			id: stream.id,
			name: stream.name,
			url: stream.url,
			sizeBytes: stream.sizeBytes,
			metadata: stream.metadata,
		},
		null,
		2
	);

	await openReadonlyDocument(content, 'json', `stream-${stream.name}`);
}

function formatFileSize(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function getLanguageFromContentType(contentType: string): string {
	const typeMap: Record<string, string> = {
		'application/json': 'json',
		'text/html': 'html',
		'text/xml': 'xml',
		'application/xml': 'xml',
		'text/yaml': 'yaml',
		'application/x-yaml': 'yaml',
		'text/markdown': 'markdown',
		'text/css': 'css',
		'text/javascript': 'javascript',
		'application/javascript': 'javascript',
	};

	for (const [type, lang] of Object.entries(typeMap)) {
		if (contentType.startsWith(type)) {
			return lang;
		}
	}

	if (contentType.startsWith('text/')) {
		return 'plaintext';
	}

	return 'plaintext';
}

async function openContent(data: unknown, contentType: string): Promise<void> {
	const language = getLanguageFromContentType(contentType);
	let content: string;

	if (typeof data === 'string') {
		content = data;
	} else if (isRawByteObject(data)) {
		// CLI returns binary data as {0: byte, 1: byte, ...} object
		content = bytesToString(data as Record<string, number>);
	} else {
		content = JSON.stringify(data, null, 2);
	}

	// Format JSON nicely
	if (language === 'json' && typeof data !== 'string') {
		content = JSON.stringify(data, null, 2);
	}

	await openReadonlyDocument(content, language, 'kv-value');
}

function isRawByteObject(data: unknown): boolean {
	if (typeof data !== 'object' || data === null || Array.isArray(data)) {
		return false;
	}
	const keys = Object.keys(data);
	if (keys.length === 0) return false;
	// Check if keys are numeric indices
	return keys.every((k) => /^\d+$/.test(k));
}

function bytesToString(data: Record<string, number>): string {
	const indices = Object.keys(data)
		.map(Number)
		.sort((a, b) => a - b);
	const bytes = indices.map((i) => data[String(i)]);
	return String.fromCharCode(...bytes);
}
