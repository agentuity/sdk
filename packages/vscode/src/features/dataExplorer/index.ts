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
		} else if (item.itemType === 'queueMessage' && item.parentName) {
			await vscode.commands.executeCommand('agentuity.queue.viewMessage', item);
		} else if (item.itemType === 'queueItem' && item.queueInfo) {
			await openQueueDetails(item);
		} else if (
			item.itemType === 'message' &&
			item.contextValue === 'loadMoreMessages' &&
			item.parentName
		) {
			provider.loadMoreMessages(item.parentName);
		} else if (
			item.itemType === 'message' &&
			item.contextValue === 'loadMoreDlqMessages' &&
			item.parentName
		) {
			provider.loadMoreDlqMessages(item.parentName);
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
							const sql = log.sql.length > 200 ? log.sql.substring(0, 200) + '...' : log.sql;
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

	// Queue commands
	context.subscriptions.push(
		vscode.commands.registerCommand('agentuity.queue.create', async () => {
			const cli = getCliClient();

			const queueType = await vscode.window.showQuickPick(
				[
					{
						label: 'Worker',
						description: 'Point-to-point queue with acknowledgment',
						value: 'worker',
					},
					{
						label: 'Pub/Sub',
						description: 'Publish-subscribe with multiple consumers',
						value: 'pubsub',
					},
				],
				{ placeHolder: 'Select queue type' }
			);
			if (!queueType) return;

			const name = await vscode.window.showInputBox({
				prompt: 'Queue name',
				placeHolder: 'my-queue',
				validateInput: (value) => {
					if (!value || value.trim() === '') return 'Queue name is required';
					if (!/^[a-zA-Z0-9_-]+$/.test(value))
						return 'Only letters, numbers, dashes, and underscores allowed';
					return null;
				},
			});
			if (!name) return;

			const ttlStr = await vscode.window.showInputBox({
				prompt: 'Message TTL in seconds (optional)',
				placeHolder: '86400 (24 hours)',
			});
			const ttl = ttlStr ? parseInt(ttlStr, 10) : undefined;

			const result = await cli.createQueue(queueType.value as 'worker' | 'pubsub', name, {
				ttl,
			});
			if (result.success) {
				vscode.window.showInformationMessage(`Created ${queueType.value} queue: ${name}`);
				provider.refresh();
			} else {
				vscode.window.showErrorMessage(`Failed to create queue: ${result.error}`);
			}
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('agentuity.queue.delete', async (item: DataTreeItem) => {
			if (item?.itemType !== 'queueItem' || !item.queueInfo) return;

			const queueName = item.queueInfo.name;
			const confirm = await vscode.window.showInputBox({
				prompt: `Type "${queueName}" to confirm deletion`,
				placeHolder: queueName,
			});

			if (confirm !== queueName) {
				vscode.window.showWarningMessage('Queue deletion cancelled');
				return;
			}

			const cli = getCliClient();
			const result = await cli.deleteQueue(queueName);
			if (result.success) {
				vscode.window.showInformationMessage(`Deleted queue: ${queueName}`);
				provider.refresh();
			} else {
				vscode.window.showErrorMessage(`Failed to delete queue: ${result.error}`);
			}
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('agentuity.queue.pause', async (item: DataTreeItem) => {
			if (item?.itemType !== 'queueItem' || !item.queueInfo) return;

			const cli = getCliClient();
			const result = await cli.pauseQueue(item.queueInfo.name);
			if (result.success) {
				vscode.window.showInformationMessage(`Paused queue: ${item.queueInfo.name}`);
				provider.refresh();
			} else {
				vscode.window.showErrorMessage(`Failed to pause queue: ${result.error}`);
			}
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('agentuity.queue.resume', async (item: DataTreeItem) => {
			if (item?.itemType !== 'queueItem' || !item.queueInfo) return;

			const cli = getCliClient();
			const result = await cli.resumeQueue(item.queueInfo.name);
			if (result.success) {
				vscode.window.showInformationMessage(`Resumed queue: ${item.queueInfo.name}`);
				provider.refresh();
			} else {
				vscode.window.showErrorMessage(`Failed to resume queue: ${result.error}`);
			}
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('agentuity.queue.publish', async (item: DataTreeItem) => {
			let queueName: string;

			if (item?.itemType === 'queueItem' && item.queueInfo) {
				queueName = item.queueInfo.name;
			} else {
				// If not called from context menu, show queue picker
				const cli = getCliClient();
				const queuesResult = await cli.listQueues();
				if (!queuesResult.success || !queuesResult.data?.queues?.length) {
					vscode.window.showErrorMessage('No queues available');
					return;
				}
				const queuePick = await vscode.window.showQuickPick(
					queuesResult.data.queues.map((q) => ({ label: q.name, description: q.queue_type })),
					{ placeHolder: 'Select queue' }
				);
				if (!queuePick) return;
				queueName = queuePick.label;
			}

			const payloadStr = await vscode.window.showInputBox({
				prompt: 'Message payload (JSON)',
				placeHolder: '{"key": "value"}',
				validateInput: (value) => {
					if (!value) return 'Payload is required';
					try {
						JSON.parse(value);
						return null;
					} catch {
						return 'Invalid JSON';
					}
				},
			});
			if (!payloadStr) return;

			const metadataStr = await vscode.window.showInputBox({
				prompt: 'Message metadata (JSON, optional)',
				placeHolder: '{"priority": "high"}',
				validateInput: (value) => {
					if (!value) return null;
					try {
						JSON.parse(value);
						return null;
					} catch {
						return 'Invalid JSON';
					}
				},
			});

			const cli = getCliClient();
			const result = await cli.publishQueueMessage(queueName, payloadStr, {
				metadata: metadataStr || undefined,
			});

			if (result.success && result.data) {
				vscode.window.showInformationMessage(`Published message: ${result.data.id}`);
				provider.refresh();
			} else {
				vscode.window.showErrorMessage(`Failed to publish message: ${result.error}`);
			}
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('agentuity.queue.viewMessage', async (item: DataTreeItem) => {
			if (item?.itemType !== 'queueMessage' || !item.parentName) return;

			const messageId = item.messageId;
			if (!messageId) return;

			const cli = getCliClient();
			const result = await cli.getQueueMessage(item.parentName, messageId);

			if (result.success && result.data?.message) {
				const msg = result.data.message;
				const content = JSON.stringify(
					{
						id: msg.id,
						queue_id: msg.queue_id,
						offset: msg.offset,
						state: msg.state,
						delivery_attempts: msg.delivery_attempts,
						partition_key: msg.partition_key,
						idempotency_key: msg.idempotency_key,
						published_at: msg.published_at,
						created_at: msg.created_at,
						delivered_at: msg.delivered_at,
						acknowledged_at: msg.acknowledged_at,
						expires_at: msg.expires_at,
						payload: msg.payload,
						metadata: msg.metadata,
					},
					null,
					2
				);

				await openReadonlyDocument(
					content,
					'json',
					`queue-message-${messageId.substring(0, 8)}`
				);
			} else {
				vscode.window.showErrorMessage(`Failed to get message: ${result.error}`);
			}
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand(
			'agentuity.queue.copyMessageId',
			async (item: DataTreeItem) => {
				if (item?.itemType !== 'queueMessage' && item?.itemType !== 'dlqMessage') return;
				const messageId = item.messageId;
				if (!messageId) return;

				await vscode.env.clipboard.writeText(messageId);
				vscode.window.showInformationMessage('Message ID copied to clipboard');
			}
		)
	);

	context.subscriptions.push(
		vscode.commands.registerCommand(
			'agentuity.queue.refreshMessages',
			async (item: DataTreeItem) => {
				let queueName: string | undefined;

				if (item?.itemType === 'queueItem' && item.queueInfo) {
					queueName = item.queueInfo.name;
				} else if (item?.itemType === 'queueSection' && item.parentName) {
					queueName = item.parentName;
				}

				if (queueName) {
					provider.refreshQueueMessages(queueName);
					vscode.window.showInformationMessage(`Refreshed messages for queue: ${queueName}`);
				}
			}
		)
	);

	// DLQ commands
	context.subscriptions.push(
		vscode.commands.registerCommand('agentuity.queue.dlq.replay', async (item: DataTreeItem) => {
			if (item?.itemType !== 'dlqMessage' || !item.parentName) return;
			const messageId = item.messageId;
			if (!messageId) return;

			const cli = getCliClient();
			const result = await cli.replayDlqMessage(item.parentName, messageId);
			if (result.success) {
				vscode.window.showInformationMessage(`Replayed message: ${messageId}`);
				provider.refreshQueueMessages(item.parentName);
			} else {
				vscode.window.showErrorMessage(`Failed to replay message: ${result.error}`);
			}
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('agentuity.queue.dlq.purge', async (item: DataTreeItem) => {
			let queueName: string;

			if (
				item?.itemType === 'queueSection' &&
				item.parentName &&
				item.label === 'Dead Letter Queue'
			) {
				queueName = item.parentName;
			} else if (item?.itemType === 'queueItem' && item.queueInfo) {
				queueName = item.queueInfo.name;
			} else {
				return;
			}

			const confirm = await vscode.window.showInputBox({
				prompt: `Type "purge ${queueName}" to confirm DLQ purge`,
				placeHolder: `purge ${queueName}`,
			});

			if (confirm !== `purge ${queueName}`) {
				vscode.window.showWarningMessage('DLQ purge cancelled');
				return;
			}

			const cli = getCliClient();
			const result = await cli.purgeDlq(queueName);
			if (result.success) {
				vscode.window.showInformationMessage(`Purged DLQ for: ${queueName}`);
				provider.refreshQueueMessages(queueName);
			} else {
				vscode.window.showErrorMessage(`Failed to purge DLQ: ${result.error}`);
			}
		})
	);

	// Destination commands
	context.subscriptions.push(
		vscode.commands.registerCommand(
			'agentuity.queue.destination.create',
			async (item: DataTreeItem) => {
				let queueName: string;

				if (
					item?.itemType === 'queueSection' &&
					item.parentName &&
					item.label === 'Destinations'
				) {
					queueName = item.parentName;
				} else if (item?.itemType === 'queueItem' && item.queueInfo) {
					queueName = item.queueInfo.name;
				} else {
					return;
				}

				const url = await vscode.window.showInputBox({
					prompt: 'Webhook URL',
					placeHolder: 'https://example.com/webhook',
					validateInput: (value) => {
						if (!value) return 'URL is required';
						try {
							new URL(value);
							return null;
						} catch {
							return 'Invalid URL';
						}
					},
				});
				if (!url) return;

				const method = await vscode.window.showQuickPick(['POST', 'PUT', 'PATCH'], {
					placeHolder: 'HTTP method (default: POST)',
				});

				const cli = getCliClient();
				const result = await cli.createQueueDestination(queueName, url, {
					method: method || 'POST',
				});

				if (result.success) {
					vscode.window.showInformationMessage(
						`Created destination: ${url} - refresh to see updated state`
					);
				} else {
					vscode.window.showErrorMessage(`Failed to create destination: ${result.error}`);
				}
			}
		)
	);

	context.subscriptions.push(
		vscode.commands.registerCommand(
			'agentuity.queue.destination.delete',
			async (item: DataTreeItem) => {
				if (item?.itemType !== 'queueDestination' || !item.parentName) return;
				const destinationId = item.destinationId;
				if (!destinationId) return;

				const confirm = await vscode.window.showWarningMessage(
					`Delete destination: ${item.label}?`,
					{ modal: true },
					'Delete'
				);
				if (confirm !== 'Delete') return;

				const cli = getCliClient();
				const result = await cli.deleteQueueDestination(item.parentName, destinationId);
				if (result.success) {
					vscode.window.showInformationMessage(
						'Destination deleted - refresh to see updated state'
					);
				} else {
					vscode.window.showErrorMessage(`Failed to delete destination: ${result.error}`);
				}
			}
		)
	);

	context.subscriptions.push(
		vscode.commands.registerCommand(
			'agentuity.queue.destination.toggle',
			async (item: DataTreeItem) => {
				if (item?.itemType !== 'queueDestination' || !item.parentName) return;
				const destinationId = item.destinationId;
				if (!destinationId) return;

				const isEnabled = item.description === 'enabled';
				const cli = getCliClient();
				const result = await cli.updateQueueDestination(item.parentName, destinationId, {
					enabled: !isEnabled,
					disabled: isEnabled,
				});

				if (result.success) {
					vscode.window.showInformationMessage(
						`Destination ${isEnabled ? 'disabled' : 'enabled'} - refresh to see updated state`
					);
				} else {
					vscode.window.showErrorMessage(`Failed to update destination: ${result.error}`);
				}
			}
		)
	);

	context.subscriptions.push(
		vscode.commands.registerCommand(
			'agentuity.queue.destination.copyUrl',
			async (item: DataTreeItem) => {
				if (item?.itemType !== 'queueDestination') return;
				await vscode.env.clipboard.writeText(item.label as string);
				vscode.window.showInformationMessage('URL copied to clipboard');
			}
		)
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
	lines.push(`Key: ${result.data.key ?? '(unknown)'}`);
	lines.push(`ID: ${result.data.id ?? '(unknown)'}`);
	if (result.data.metadata && Object.keys(result.data.metadata).length > 0) {
		lines.push(`Metadata: ${JSON.stringify(result.data.metadata, null, 2)}`);
	}

	lines.push('');
	lines.push('=== Document ===');
	lines.push('');
	lines.push(result.data.document ?? '(no document)');

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
			namespace: stream.namespace,
			url: stream.url,
			sizeBytes: stream.sizeBytes,
			metadata: stream.metadata,
		},
		null,
		2
	);

	await openReadonlyDocument(content, 'json', `stream-${stream.namespace}`);
}

async function openQueueDetails(item: DataTreeItem): Promise<void> {
	const cli = getCliClient();
	const queueName = item.queueInfo!.name;
	const result = await cli.getQueue(queueName);

	if (result.success && result.data?.queue) {
		const queue = result.data.queue;
		const content = JSON.stringify(
			{
				name: queue.name,
				id: queue.id,
				queue_type: queue.queue_type,
				description: queue.description,
				message_count: queue.message_count,
				dlq_count: queue.dlq_count,
				next_offset: queue.next_offset,
				paused_at: queue.paused_at,
				created_at: queue.created_at,
				updated_at: queue.updated_at,
			},
			null,
			2
		);

		await openReadonlyDocument(content, 'json', `queue-${queueName}`);
	} else {
		vscode.window.showErrorMessage(`Failed to get queue details: ${result.error}`);
	}
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
