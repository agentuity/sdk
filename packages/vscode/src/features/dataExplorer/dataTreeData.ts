import * as vscode from 'vscode';
import { getCliClient, type VectorSearchResult, type StreamInfo } from '../../core/cliClient';
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
	| 'streamItem';

export type DataCategory = 'kv' | 'db' | 'vector' | 'storage' | 'stream';

export interface VectorSearchGroup {
	id: string;
	label: string;
	namespace: string;
	query: string;
	results: VectorSearchResult[];
}

export class DataTreeItem extends vscode.TreeItem {
	constructor(
		public readonly label: string,
		public readonly collapsibleState: vscode.TreeItemCollapsibleState,
		public readonly itemType: DataItemType,
		public readonly category?: DataCategory,
		public readonly parentName?: string,
		public readonly vectorResult?: VectorSearchResult,
		public readonly streamInfo?: StreamInfo
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
			case 'message':
				this.iconPath = new vscode.ThemeIcon('info');
				break;
		}
	}
}

export class DataTreeDataProvider implements vscode.TreeDataProvider<DataTreeItem> {
	private _onDidChangeTreeData = new vscode.EventEmitter<DataTreeItem | undefined | null | void>();
	readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

	private vectorSearchGroups: VectorSearchGroup[] = [];

	refresh(): void {
		this._onDidChangeTreeData.fire();
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
				if (this.vectorSearchGroups.length === 0) {
					const item = new DataTreeItem(
						'Use "Search Vectors..." to search',
						vscode.TreeItemCollapsibleState.None,
						'message'
					);
					item.tooltip = 'Right-click on Vectors or use the command palette';
					return [item];
				}
				return this.vectorSearchGroups.map((group) => {
					const item = new DataTreeItem(
						group.label,
						vscode.TreeItemCollapsibleState.Collapsed,
						'vectorSearchGroup',
						'vector',
						group.id
					);
					item.description = `${group.results.length} results`;
					return item;
				});
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
							stream.name || stream.id,
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
				result.key,
				vscode.TreeItemCollapsibleState.None,
				'vectorResult',
				'vector',
				group.namespace,
				result
			);
			item.description = `${(result.similarity * 100).toFixed(1)}%`;
			item.tooltip = `Similarity: ${(result.similarity * 100).toFixed(2)}%\nID: ${result.id}`;
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

	dispose(): void {
		this._onDidChangeTreeData.dispose();
	}
}
