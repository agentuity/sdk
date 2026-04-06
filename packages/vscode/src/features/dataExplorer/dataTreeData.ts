import * as vscode from 'vscode';
import {
	getCliClient,
	type VectorSearchResult,
	type StreamInfo,
	type QueueInfo,
} from '../../core/cliClient';
import { getAuthStatus } from '../../core/auth';
import { hasProject } from '../../core/project';

export type DataItemType =
	| 'category'
	| 'namespace'
	| 'key'
	| 'message'
	| 'database'
	| 'vectorSearchGroup'
	| 'vectorResult'
	| 'storageBucket'
	| 'storageFile'
	| 'streamItem'
	| 'queueItem'
	| 'queueSection'
	| 'queueMessage'
	| 'dlqMessage'
	| 'queueDestination';

export type DataCategory = 'kv' | 'db' | 'vector' | 'storage' | 'stream' | 'queue';

export interface VectorSearchGroup {
	id: string;
	label: string;
	namespace: string;
	query: string;
	results: VectorSearchResult[];
}

export class DataTreeItem extends vscode.TreeItem {
	public messageId?: string;
	public destinationId?: string;

	constructor(
		public readonly label: string,
		public readonly collapsibleState: vscode.TreeItemCollapsibleState,
		public readonly itemType: DataItemType,
		public readonly category?: DataCategory,
		public readonly parentName?: string,
		public readonly vectorResult?: VectorSearchResult,
		public readonly streamInfo?: StreamInfo,
		public readonly queueInfo?: QueueInfo
	) {
		super(label, collapsibleState);
		this.setIcon();
		// Set contextValue - special case for Vectors category to enable inline search button
		if (itemType === 'category' && category === 'vector') {
			this.contextValue = 'category-vector';
		} else {
			this.contextValue = itemType;
		}
	}

	private setIcon(): void {
		switch (this.itemType) {
			case 'category':
				if (this.label === 'Key-Value') {
					this.iconPath = new vscode.ThemeIcon('database');
				} else if (this.label === 'Databases') {
					this.iconPath = new vscode.ThemeIcon('server');
				} else if (this.label === 'Vectors') {
					this.iconPath = new vscode.ThemeIcon('symbol-numeric');
				} else if (this.label === 'Storage') {
					this.iconPath = new vscode.ThemeIcon('cloud');
				} else if (this.label === 'Streams') {
					this.iconPath = new vscode.ThemeIcon('pulse');
				} else if (this.label === 'Queues') {
					this.iconPath = new vscode.ThemeIcon('mail');
				}
				break;
			case 'namespace':
				this.iconPath = new vscode.ThemeIcon('folder');
				break;
			case 'key':
				this.iconPath = new vscode.ThemeIcon('symbol-key');
				break;
			case 'database':
				this.iconPath = new vscode.ThemeIcon('database');
				break;
			case 'vectorSearchGroup':
				this.iconPath = new vscode.ThemeIcon('search');
				break;
			case 'vectorResult':
				this.iconPath = new vscode.ThemeIcon('file-text');
				break;
			case 'storageBucket':
				this.iconPath = new vscode.ThemeIcon('package');
				break;
			case 'storageFile':
				this.iconPath = new vscode.ThemeIcon('file');
				break;
			case 'streamItem':
				this.iconPath = new vscode.ThemeIcon('broadcast');
				break;
			case 'queueItem':
				this.iconPath = new vscode.ThemeIcon('mail');
				break;
			case 'queueSection':
				if (this.label === 'Messages') {
					this.iconPath = new vscode.ThemeIcon('inbox');
				} else if (this.label === 'Dead Letter Queue') {
					this.iconPath = new vscode.ThemeIcon('warning');
				} else if (this.label === 'Destinations') {
					this.iconPath = new vscode.ThemeIcon('link-external');
				}
				break;
			case 'queueMessage':
				this.iconPath = new vscode.ThemeIcon('mail');
				break;
			case 'dlqMessage':
				this.iconPath = new vscode.ThemeIcon('warning');
				break;
			case 'queueDestination':
				this.iconPath = new vscode.ThemeIcon('link-external');
				break;
			case 'message':
				this.iconPath = new vscode.ThemeIcon('info');
				break;
		}
	}
}

export class DataTreeDataProvider implements vscode.TreeDataProvider<DataTreeItem> {
	private _onDidChangeTreeData = new vscode.EventEmitter<
		DataTreeItem | undefined | null | undefined
	>();
	readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

	private vectorSearchGroups: VectorSearchGroup[] = [];
	private messageLimits: Map<string, number> = new Map();
	private dlqLimits: Map<string, number> = new Map();
	private readonly MESSAGE_PAGE_SIZE = 25;

	refresh(): void {
		this._onDidChangeTreeData.fire(undefined);
	}

	refreshQueueMessages(queueName: string): void {
		this.messageLimits.delete(queueName);
		this.dlqLimits.delete(queueName);
		this._onDidChangeTreeData.fire(undefined);
	}

	loadMoreMessages(queueName: string): void {
		const currentLimit = this.messageLimits.get(queueName) || this.MESSAGE_PAGE_SIZE;
		this.messageLimits.set(queueName, currentLimit + this.MESSAGE_PAGE_SIZE);
		this._onDidChangeTreeData.fire(undefined);
	}

	loadMoreDlqMessages(queueName: string): void {
		const currentLimit = this.dlqLimits.get(queueName) || this.MESSAGE_PAGE_SIZE;
		this.dlqLimits.set(queueName, currentLimit + this.MESSAGE_PAGE_SIZE);
		this._onDidChangeTreeData.fire(undefined);
	}

	addVectorSearchGroup(group: VectorSearchGroup): void {
		this.vectorSearchGroups.unshift(group);
		this.refresh();
	}

	clearVectorSearchGroups(): void {
		this.vectorSearchGroups = [];
		this.refresh();
	}

	getTreeItem(element: DataTreeItem): vscode.TreeItem {
		return element;
	}

	async getChildren(element?: DataTreeItem): Promise<DataTreeItem[]> {
		const authStatus = getAuthStatus();
		if (authStatus.state === 'unknown') {
			return [
				new DataTreeItem('Checking auth...', vscode.TreeItemCollapsibleState.None, 'message'),
			];
		}

		if (authStatus.state === 'cli-missing') {
			return [
				new DataTreeItem('CLI not installed', vscode.TreeItemCollapsibleState.None, 'message'),
			];
		}

		if (authStatus.state === 'unauthenticated') {
			return [
				new DataTreeItem('Not logged in', vscode.TreeItemCollapsibleState.None, 'message'),
			];
		}

		if (!hasProject()) {
			return [
				new DataTreeItem(
					'No project detected',
					vscode.TreeItemCollapsibleState.None,
					'message'
				),
			];
		}

		if (!element) {
			return [
				new DataTreeItem(
					'Key-Value',
					vscode.TreeItemCollapsibleState.Collapsed,
					'category',
					'kv'
				),
				new DataTreeItem(
					'Databases',
					vscode.TreeItemCollapsibleState.Collapsed,
					'category',
					'db'
				),
				new DataTreeItem(
					'Vectors',
					vscode.TreeItemCollapsibleState.Collapsed,
					'category',
					'vector'
				),
				new DataTreeItem(
					'Storage',
					vscode.TreeItemCollapsibleState.Collapsed,
					'category',
					'storage'
				),
				new DataTreeItem(
					'Streams',
					vscode.TreeItemCollapsibleState.Collapsed,
					'category',
					'stream'
				),
				new DataTreeItem(
					'Queues',
					vscode.TreeItemCollapsibleState.Collapsed,
					'category',
					'queue'
				),
			];
		}

		if (element.itemType === 'category') {
			return this.loadCategoryChildren(element);
		}

		if (element.itemType === 'namespace' && element.category === 'kv') {
			return this.loadKvKeys(element.label);
		}

		if (element.itemType === 'vectorSearchGroup' && element.category === 'vector') {
			return this.loadVectorSearchResults(element.parentName!);
		}

		if (element.itemType === 'storageBucket' && element.category === 'storage') {
			return this.loadStorageFiles(element.label);
		}

		if (element.itemType === 'queueItem' && element.queueInfo) {
			return this.loadQueueSections(element.queueInfo.name);
		}

		if (element.itemType === 'queueSection' && element.parentName) {
			const sectionLabel = element.label as string;
			if (sectionLabel === 'Messages') {
				return this.loadQueueMessages(element.parentName);
			} else if (sectionLabel === 'Dead Letter Queue') {
				return this.loadDlqMessages(element.parentName);
			} else if (sectionLabel === 'Destinations') {
				return this.loadQueueDestinations(element.parentName);
			}
		}

		return [];
	}

	private getErrorMessage(error: string | undefined, category: string): string {
		const errorLower = (error || '').toLowerCase();
		if (
			errorLower.includes('no deployment') ||
			errorLower.includes('not deployed') ||
			errorLower.includes('deployment not found') ||
			errorLower.includes('requires deployment') ||
			errorLower.includes('project not found')
		) {
			return `Deploy first to see ${category}`;
		}
		return error || `Failed to load ${category}`;
	}

	private async loadCategoryChildren(element: DataTreeItem): Promise<DataTreeItem[]> {
		const cli = getCliClient();

		try {
			if (element.category === 'kv') {
				const result = await cli.listKvNamespaces();
				if (result.success && Array.isArray(result.data)) {
					if (result.data.length === 0) {
						return [
							new DataTreeItem(
								'No namespaces',
								vscode.TreeItemCollapsibleState.None,
								'message'
							),
						];
					}
					return result.data.map((ns) => {
						return new DataTreeItem(
							ns,
							vscode.TreeItemCollapsibleState.Collapsed,
							'namespace',
							'kv'
						);
					});
				}
				return [
					new DataTreeItem(
						this.getErrorMessage(result.error, 'namespaces'),
						vscode.TreeItemCollapsibleState.None,
						'message'
					),
				];
			} else if (element.category === 'db') {
				const result = await cli.listDatabases();
				if (result.success && result.data?.databases) {
					if (result.data.databases.length === 0) {
						return [
							new DataTreeItem(
								'No databases',
								vscode.TreeItemCollapsibleState.None,
								'message'
							),
						];
					}
					return result.data.databases.map((db) => {
						const item = new DataTreeItem(
							db.name,
							vscode.TreeItemCollapsibleState.None,
							'database',
							'db'
						);
						item.tooltip = db.url;
						return item;
					});
				}
				return [
					new DataTreeItem(
						this.getErrorMessage(result.error, 'databases'),
						vscode.TreeItemCollapsibleState.None,
						'message'
					),
				];
			} else if (element.category === 'vector') {
				const items: DataTreeItem[] = [];

				// Add search results first if any
				if (this.vectorSearchGroups.length > 0) {
					for (const group of this.vectorSearchGroups) {
						const item = new DataTreeItem(
							group.label,
							vscode.TreeItemCollapsibleState.Collapsed,
							'vectorSearchGroup',
							'vector',
							group.id
						);
						item.description = `${group.results.length} results`;
						items.push(item);
					}
				}

				// Load and show namespaces
				const result = await cli.listVectorNamespaces();
				if (result.success && Array.isArray(result.data) && result.data.length > 0) {
					// Add a separator if we have search results
					if (items.length > 0) {
						const separator = new DataTreeItem(
							'─── Namespaces ───',
							vscode.TreeItemCollapsibleState.None,
							'message'
						);
						items.push(separator);
					}

					for (const ns of result.data) {
						const item = new DataTreeItem(
							ns,
							vscode.TreeItemCollapsibleState.None,
							'namespace',
							'vector'
						);
						item.tooltip = `Vector namespace: ${ns}\nRight-click to search`;
						items.push(item);
					}
				}

				if (items.length === 0) {
					const item = new DataTreeItem(
						'No namespaces found',
						vscode.TreeItemCollapsibleState.None,
						'message'
					);
					item.tooltip = 'Deploy your project to create vector namespaces';
					return [item];
				}

				return items;
			} else if (element.category === 'storage') {
				const result = await cli.listStorageBuckets();
				if (result.success && result.data?.buckets) {
					if (result.data.buckets.length === 0) {
						return [
							new DataTreeItem(
								'No buckets',
								vscode.TreeItemCollapsibleState.None,
								'message'
							),
						];
					}
					return result.data.buckets.map((bucket) => {
						const item = new DataTreeItem(
							bucket.bucket_name,
							vscode.TreeItemCollapsibleState.Collapsed,
							'storageBucket',
							'storage'
						);
						if (bucket.region) {
							item.description = bucket.region;
						}
						return item;
					});
				}
				return [
					new DataTreeItem(
						this.getErrorMessage(result.error, 'storage'),
						vscode.TreeItemCollapsibleState.None,
						'message'
					),
				];
			} else if (element.category === 'stream') {
				const result = await cli.listStreams();
				if (result.success && result.data?.streams) {
					if (result.data.streams.length === 0) {
						return [
							new DataTreeItem(
								'No streams',
								vscode.TreeItemCollapsibleState.None,
								'message'
							),
						];
					}
					return result.data.streams.map((stream) => {
						const item = new DataTreeItem(
							stream.namespace || stream.id,
							vscode.TreeItemCollapsibleState.None,
							'streamItem',
							'stream',
							undefined,
							undefined,
							stream
						);
						item.description = this.formatFileSize(stream.sizeBytes);
						item.tooltip = `ID: ${stream.id}\nURL: ${stream.url}`;
						return item;
					});
				}
				return [
					new DataTreeItem(
						this.getErrorMessage(result.error, 'streams'),
						vscode.TreeItemCollapsibleState.None,
						'message'
					),
				];
			} else if (element.category === 'queue') {
				const result = await cli.listQueues();
				if (result.success && result.data?.queues) {
					if (result.data.queues.length === 0) {
						return [
							new DataTreeItem('No queues', vscode.TreeItemCollapsibleState.None, 'message'),
						];
					}
					return result.data.queues.map((queue) => {
						const item = new DataTreeItem(
							queue.name,
							vscode.TreeItemCollapsibleState.Collapsed,
							'queueItem',
							'queue',
							undefined,
							undefined,
							undefined,
							queue
						);
						item.description = `${queue.queue_type} • ${queue.message_count} msgs`;
						item.tooltip = [
							`Name: ${queue.name}`,
							`Type: ${queue.queue_type}`,
							`Messages: ${queue.message_count}`,
							`DLQ: ${queue.dlq_count}`,
							`Created: ${new Date(queue.created_at).toLocaleString()}`,
						].join('\n');
						return item;
					});
				}
				return [
					new DataTreeItem(
						this.getErrorMessage(result.error, 'queues'),
						vscode.TreeItemCollapsibleState.None,
						'message'
					),
				];
			}
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Failed to load';
			return [new DataTreeItem(message, vscode.TreeItemCollapsibleState.None, 'message')];
		}

		return [new DataTreeItem('Failed to load', vscode.TreeItemCollapsibleState.None, 'message')];
	}

	private loadVectorSearchResults(groupId: string): DataTreeItem[] {
		const group = this.vectorSearchGroups.find((g) => g.id === groupId);
		if (!group) {
			return [];
		}

		if (group.results.length === 0) {
			return [new DataTreeItem('No results', vscode.TreeItemCollapsibleState.None, 'message')];
		}

		return group.results.map((result) => {
			const item = new DataTreeItem(
				result.key ?? '(unknown)',
				vscode.TreeItemCollapsibleState.None,
				'vectorResult',
				'vector',
				group.namespace,
				result
			);
			item.description = `${(result.similarity * 100).toFixed(1)}%`;
			item.tooltip = `Similarity: ${(result.similarity * 100).toFixed(2)}%\nID: ${result.id ?? '(unknown)'}`;
			return item;
		});
	}

	private async loadKvKeys(namespace: string): Promise<DataTreeItem[]> {
		const cli = getCliClient();

		try {
			const result = await cli.listKvKeys(namespace);
			if (result.success && result.data?.keys) {
				if (result.data.keys.length === 0) {
					return [
						new DataTreeItem('No keys', vscode.TreeItemCollapsibleState.None, 'message'),
					];
				}
				return result.data.keys.map(
					(key) =>
						new DataTreeItem(
							key,
							vscode.TreeItemCollapsibleState.None,
							'key',
							'kv',
							namespace
						)
				);
			}
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Failed to load keys';
			return [new DataTreeItem(message, vscode.TreeItemCollapsibleState.None, 'message')];
		}

		return [
			new DataTreeItem('Failed to load keys', vscode.TreeItemCollapsibleState.None, 'message'),
		];
	}

	private async loadStorageFiles(bucket: string): Promise<DataTreeItem[]> {
		const cli = getCliClient();

		try {
			const result = await cli.listStorageFiles(bucket);
			if (result.success && result.data?.files) {
				if (result.data.files.length === 0) {
					return [
						new DataTreeItem('No files', vscode.TreeItemCollapsibleState.None, 'message'),
					];
				}
				return result.data.files.map((file) => {
					const item = new DataTreeItem(
						file.key,
						vscode.TreeItemCollapsibleState.None,
						'storageFile',
						'storage',
						bucket
					);
					item.description = this.formatFileSize(file.size);
					return item;
				});
			}
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Failed to load files';
			return [new DataTreeItem(message, vscode.TreeItemCollapsibleState.None, 'message')];
		}

		return [
			new DataTreeItem('Failed to load files', vscode.TreeItemCollapsibleState.None, 'message'),
		];
	}

	private formatFileSize(bytes: number): string {
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
		if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
		return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
	}

	private loadQueueSections(queueName: string): DataTreeItem[] {
		const messagesItem = new DataTreeItem(
			'Messages',
			vscode.TreeItemCollapsibleState.Collapsed,
			'queueSection',
			'queue',
			queueName
		);
		messagesItem.contextValue = 'queueSection-messages';
		messagesItem.description = `${this.MESSAGE_PAGE_SIZE} latest`;

		const dlqItem = new DataTreeItem(
			'Dead Letter Queue',
			vscode.TreeItemCollapsibleState.Collapsed,
			'queueSection',
			'queue',
			queueName
		);
		dlqItem.contextValue = 'queueSection-dlq';
		dlqItem.description = `${this.MESSAGE_PAGE_SIZE} latest`;

		const destItem = new DataTreeItem(
			'Destinations',
			vscode.TreeItemCollapsibleState.Collapsed,
			'queueSection',
			'queue',
			queueName
		);
		destItem.contextValue = 'queueSection-destinations';

		return [messagesItem, dlqItem, destItem];
	}

	private async loadQueueMessages(queueName: string): Promise<DataTreeItem[]> {
		const cli = getCliClient();
		const currentLimit = this.messageLimits.get(queueName) || this.MESSAGE_PAGE_SIZE;

		try {
			const result = await cli.listQueueMessages(queueName, { limit: currentLimit });

			if (result.success && result.data?.data?.messages) {
				const messages = result.data.data.messages;
				const total = result.data.data.total || messages.length;

				if (messages.length === 0) {
					return [
						new DataTreeItem('No messages', vscode.TreeItemCollapsibleState.None, 'message'),
					];
				}

				const items = messages.map((msg) => {
					const item = new DataTreeItem(
						`${msg.id.substring(0, 16)}...`,
						vscode.TreeItemCollapsibleState.None,
						'queueMessage',
						'queue',
						queueName
					);
					item.contextValue = 'queueMessage';
					item.description = msg.state || '';
					item.tooltip = [
						`ID: ${msg.id}`,
						`Offset: ${msg.offset}`,
						`State: ${msg.state || 'unknown'}`,
						msg.created_at ? `Created: ${new Date(msg.created_at).toLocaleString()}` : '',
					]
						.filter(Boolean)
						.join('\n');
					item.messageId = msg.id;
					return item;
				});

				if (messages.length < total) {
					const remaining = total - messages.length;
					const loadMoreItem = new DataTreeItem(
						`Load ${Math.min(remaining, this.MESSAGE_PAGE_SIZE)} More... (${remaining} remaining)`,
						vscode.TreeItemCollapsibleState.None,
						'message',
						'queue',
						queueName
					);
					loadMoreItem.contextValue = 'loadMoreMessages';
					items.push(loadMoreItem);
				}

				return items;
			}
			return [
				new DataTreeItem(
					this.getErrorMessage(result.error, 'messages'),
					vscode.TreeItemCollapsibleState.None,
					'message'
				),
			];
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Failed to load messages';
			return [new DataTreeItem(message, vscode.TreeItemCollapsibleState.None, 'message')];
		}
	}

	private async loadDlqMessages(queueName: string): Promise<DataTreeItem[]> {
		const cli = getCliClient();
		const currentLimit = this.dlqLimits.get(queueName) || this.MESSAGE_PAGE_SIZE;

		try {
			const result = await cli.listDlqMessages(queueName, { limit: currentLimit });

			if (result.success && result.data?.messages) {
				const messages = result.data.messages;
				const total = result.data.total || messages.length;

				if (messages.length === 0) {
					return [
						new DataTreeItem(
							'No DLQ messages',
							vscode.TreeItemCollapsibleState.None,
							'message'
						),
					];
				}

				const items = messages.map((msg) => {
					const item = new DataTreeItem(
						`${msg.id.substring(0, 16)}...`,
						vscode.TreeItemCollapsibleState.None,
						'dlqMessage',
						'queue',
						queueName
					);
					item.contextValue = 'dlqMessage';
					item.description = `${msg.delivery_attempts} attempts`;
					item.tooltip = [
						`ID: ${msg.id}`,
						`Offset: ${msg.offset}`,
						`Attempts: ${msg.delivery_attempts}`,
						`Reason: ${msg.failure_reason || 'Unknown'}`,
						`Moved: ${new Date(msg.moved_at).toLocaleString()}`,
					].join('\n');
					item.messageId = msg.id;
					return item;
				});

				if (messages.length < total) {
					const remaining = total - messages.length;
					const loadMoreItem = new DataTreeItem(
						`Load ${Math.min(remaining, this.MESSAGE_PAGE_SIZE)} More... (${remaining} remaining)`,
						vscode.TreeItemCollapsibleState.None,
						'message',
						'queue',
						queueName
					);
					loadMoreItem.contextValue = 'loadMoreDlqMessages';
					items.push(loadMoreItem);
				}

				return items;
			}
			return [
				new DataTreeItem(
					this.getErrorMessage(result.error, 'DLQ'),
					vscode.TreeItemCollapsibleState.None,
					'message'
				),
			];
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Failed to load DLQ';
			return [new DataTreeItem(message, vscode.TreeItemCollapsibleState.None, 'message')];
		}
	}

	private async loadQueueDestinations(queueName: string): Promise<DataTreeItem[]> {
		const cli = getCliClient();

		try {
			const result = await cli.listQueueDestinations(queueName);
			if (result.success && result.data?.destinations) {
				if (result.data.destinations.length === 0) {
					return [
						new DataTreeItem(
							'No destinations',
							vscode.TreeItemCollapsibleState.None,
							'message'
						),
					];
				}
				return result.data.destinations.map((dest) => {
					const item = new DataTreeItem(
						dest.url,
						vscode.TreeItemCollapsibleState.None,
						'queueDestination',
						'queue',
						queueName
					);
					item.contextValue = 'queueDestination';
					item.description = dest.enabled ? 'enabled' : 'disabled';
					item.tooltip = [
						`ID: ${dest.id}`,
						`Type: ${dest.destination_type}`,
						`URL: ${dest.url}`,
						`Enabled: ${dest.enabled ? 'Yes' : 'No'}`,
						`Created: ${new Date(dest.created_at).toLocaleString()}`,
					].join('\n');
					item.destinationId = dest.id;
					return item;
				});
			}
			return [
				new DataTreeItem(
					this.getErrorMessage(result.error, 'destinations'),
					vscode.TreeItemCollapsibleState.None,
					'message'
				),
			];
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Failed to load destinations';
			return [new DataTreeItem(message, vscode.TreeItemCollapsibleState.None, 'message')];
		}
	}

	dispose(): void {
		this._onDidChangeTreeData.dispose();
	}
}
