import * as vscode from 'vscode';
import {
	getCliClient,
	type SandboxInfo,
	type SandboxFileInfo,
	type SnapshotInfo,
	type ExecutionInfo,
	type SandboxStatus,
} from '../../core/cliClient';
import { getAuthStatus } from '../../core/auth';
import { getSandboxManager, type LinkedSandbox } from '../../core/sandboxManager';

/**
 * Types of items in the sandbox tree.
 */
export type SandboxItemType =
	| 'sandbox'
	| 'category'
	| 'file'
	| 'directory'
	| 'snapshot'
	| 'snapshotFile'
	| 'execution'
	| 'message'
	| 'createSandbox';

/**
 * A tree item in the sandbox explorer.
 */
export class SandboxTreeItem extends vscode.TreeItem {
	constructor(
		public readonly label: string,
		public readonly collapsibleState: vscode.TreeItemCollapsibleState,
		public readonly itemType: SandboxItemType,
		public readonly sandboxData?: SandboxInfo,
		public readonly fileData?: SandboxFileInfo,
		public readonly snapshotData?: SnapshotInfo,
		public readonly executionData?: ExecutionInfo,
		public readonly parentSandboxId?: string,
		public readonly categoryType?: 'files' | 'snapshots' | 'executions',
		public readonly linkedData?: LinkedSandbox,
		public readonly filePath?: string
	) {
		super(label, collapsibleState);
		this.setupItem();
	}

	private setupItem(): void {
		switch (this.itemType) {
			case 'sandbox':
				this.setupSandboxItem();
				break;
			case 'category':
				this.setupCategoryItem();
				break;
			case 'file':
			case 'directory':
				this.setupFileItem();
				break;
			case 'snapshot':
				this.setupSnapshotItem();
				break;
			case 'snapshotFile':
				this.setupSnapshotFileItem();
				break;
			case 'execution':
				this.setupExecutionItem();
				break;
			case 'createSandbox':
				this.setupCreateItem();
				break;
			case 'message':
				this.iconPath = new vscode.ThemeIcon('info');
				this.contextValue = 'message';
				break;
		}
	}

	private setupSandboxItem(): void {
		if (!this.sandboxData) return;

		const status = this.sandboxData.status;
		const isLinked = this.linkedData !== undefined;

		// Set icon based on status
		this.iconPath = new vscode.ThemeIcon(
			this.getStatusIcon(status),
			this.getStatusColor(status)
		);

		// Set context value for menu targeting
		let contextValue = `sandbox.${status}`;
		if (isLinked) {
			contextValue += '.linked';
		}
		this.contextValue = contextValue;

		// Set description
		const statusLabel = status.charAt(0).toUpperCase() + status.slice(1);
		this.description = isLinked ? `${statusLabel} [linked]` : statusLabel;

		// Set tooltip
		this.tooltip = this.formatSandboxTooltip();
	}

	private getStatusIcon(status: SandboxStatus): string {
		switch (status) {
			case 'idle':
				return 'vm';
			case 'running':
				return 'vm-running';
			case 'creating':
				return 'loading~spin';
			case 'terminated':
				return 'vm-outline';
			case 'failed':
				return 'error';
			default:
				return 'vm';
		}
	}

	private getStatusColor(status: SandboxStatus): vscode.ThemeColor | undefined {
		switch (status) {
			case 'idle':
				return new vscode.ThemeColor('charts.blue');
			case 'running':
				return new vscode.ThemeColor('charts.green');
			case 'failed':
				return new vscode.ThemeColor('charts.red');
			case 'terminated':
				return new vscode.ThemeColor('disabledForeground');
			default:
				return undefined;
		}
	}

	private formatSandboxTooltip(): string {
		if (!this.sandboxData) return '';

		const lines = [
			`ID: ${this.sandboxData.sandboxId}`,
			`Status: ${this.sandboxData.status}`,
			`Region: ${this.sandboxData.region}`,
			`Created: ${new Date(this.sandboxData.createdAt).toLocaleString()}`,
		];

		if (this.sandboxData.resources) {
			const r = this.sandboxData.resources;
			if (r.memory) lines.push(`Memory: ${r.memory}`);
			if (r.cpu) lines.push(`CPU: ${r.cpu}`);
			if (r.disk) lines.push(`Disk: ${r.disk}`);
		}

		if (this.linkedData) {
			lines.push('', '--- Linked ---');
			lines.push(`Remote Path: ${this.linkedData.remotePath}`);
			if (this.linkedData.lastSyncedAt) {
				lines.push(`Last Synced: ${new Date(this.linkedData.lastSyncedAt).toLocaleString()}`);
			}
		}

		return lines.join('\n');
	}

	private setupCategoryItem(): void {
		switch (this.categoryType) {
			case 'files':
				this.iconPath = new vscode.ThemeIcon('folder');
				this.contextValue = 'sandboxCategory.files';
				break;
			case 'snapshots':
				this.iconPath = new vscode.ThemeIcon('device-camera');
				this.contextValue = 'sandboxCategory.snapshots';
				break;
			case 'executions':
				this.iconPath = new vscode.ThemeIcon('terminal');
				this.contextValue = 'sandboxCategory.executions';
				break;
		}
	}

	private setupFileItem(): void {
		if (this.itemType === 'directory') {
			this.iconPath = new vscode.ThemeIcon('folder');
			this.contextValue = 'sandboxFile.directory';
		} else {
			this.iconPath = new vscode.ThemeIcon('file');
			this.contextValue = 'sandboxFile';

			// Add click command to open file directly
			this.command = {
				command: 'agentuity.sandbox.viewFile',
				title: 'Open File',
				arguments: [this],
			};
		}

		if (this.fileData) {
			this.description = this.formatFileSize(this.fileData.size);
			this.tooltip = `${this.filePath}\nSize: ${this.formatFileSize(this.fileData.size)}\nModified: ${this.fileData.modTime}`;
		}
	}

	private formatFileSize(bytes: number): string {
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
		if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
		return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
	}

	private setupSnapshotItem(): void {
		if (!this.snapshotData) return;

		this.iconPath = new vscode.ThemeIcon('device-camera');

		if (this.snapshotData.tag) {
			this.contextValue = 'snapshot.tagged';
			this.description = `[${this.snapshotData.tag}] ${this.snapshotData.fileCount} files`;
		} else {
			this.contextValue = 'snapshot';
			this.description = `${this.snapshotData.fileCount} files`;
		}

		this.tooltip = [
			`ID: ${this.snapshotData.snapshotId}`,
			`Size: ${this.formatFileSize(this.snapshotData.sizeBytes)}`,
			`Files: ${this.snapshotData.fileCount}`,
			`Created: ${new Date(this.snapshotData.createdAt).toLocaleString()}`,
			this.snapshotData.tag ? `Tag: ${this.snapshotData.tag}` : '',
			'',
			'Click to view snapshot details',
		]
			.filter(Boolean)
			.join('\n');

		// Add click command to view snapshot details JSON
		this.command = {
			command: 'agentuity.sandbox.snapshot.viewDetails',
			title: 'View Snapshot Details',
			arguments: [this],
		};
	}

	private setupSnapshotFileItem(): void {
		this.iconPath = new vscode.ThemeIcon('file');
		this.contextValue = 'snapshotFile';

		if (this.fileData) {
			this.description = this.formatFileSize(this.fileData.size);
			this.tooltip = `${this.filePath}\nSize: ${this.formatFileSize(this.fileData.size)}\n\nClick to view file (readonly)`;
		}

		// Add click command to view snapshot file
		this.command = {
			command: 'agentuity.sandbox.snapshot.viewFile',
			title: 'View Snapshot File',
			arguments: [this],
		};
	}

	private setupExecutionItem(): void {
		if (!this.executionData) return;

		const status = this.executionData.status;
		const icon = this.getExecutionIcon(status);
		const color = this.getExecutionColor(status);

		this.iconPath = new vscode.ThemeIcon(icon, color);
		this.contextValue = status === 'running' ? 'execution.running' : 'execution';

		// Build description
		const parts: string[] = [];
		if (this.executionData.exitCode !== undefined) {
			parts.push(`exit ${this.executionData.exitCode}`);
		}
		if (this.executionData.durationMs !== undefined) {
			parts.push(`${(this.executionData.durationMs / 1000).toFixed(1)}s`);
		}
		this.description = parts.join(', ');

		this.tooltip = [
			`ID: ${this.executionData.executionId}`,
			`Status: ${status}`,
			this.executionData.exitCode !== undefined ? `Exit Code: ${this.executionData.exitCode}` : '',
			this.executionData.durationMs !== undefined
				? `Duration: ${(this.executionData.durationMs / 1000).toFixed(2)}s`
				: '',
			'',
			'Click to view execution details',
		]
			.filter(Boolean)
			.join('\n');

		// Add click command to view execution details
		this.command = {
			command: 'agentuity.sandbox.viewExecution',
			title: 'View Execution',
			arguments: [this],
		};
	}

	private getExecutionIcon(status: string): string {
		switch (status) {
			case 'completed':
				return 'check';
			case 'failed':
				return 'x';
			case 'running':
				return 'loading~spin';
			case 'queued':
				return 'clock';
			case 'timeout':
				return 'watch';
			case 'cancelled':
				return 'circle-slash';
			default:
				return 'terminal';
		}
	}

	private getExecutionColor(status: string): vscode.ThemeColor | undefined {
		switch (status) {
			case 'completed':
				return new vscode.ThemeColor('charts.green');
			case 'failed':
			case 'timeout':
				return new vscode.ThemeColor('charts.red');
			case 'cancelled':
				return new vscode.ThemeColor('charts.orange');
			default:
				return undefined;
		}
	}

	private setupCreateItem(): void {
		this.iconPath = new vscode.ThemeIcon('add');
		this.contextValue = 'createSandbox';
		this.command = {
			command: 'agentuity.sandbox.create',
			title: 'Create Sandbox',
		};
	}
}

/**
 * Tree data provider for the sandbox explorer.
 */
export class SandboxTreeDataProvider implements vscode.TreeDataProvider<SandboxTreeItem> {
	private _onDidChangeTreeData = new vscode.EventEmitter<SandboxTreeItem | undefined | null | void>();
	readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

	private sandboxes: SandboxInfo[] = [];
	private loading = false;
	private sandboxesLoaded = false;
	private error: string | undefined;

	// Cache for lazy-loaded data
	private snapshotsCache: Map<string, SnapshotInfo[]> = new Map();
	private executionsCache: Map<string, ExecutionInfo[]> = new Map();
	private filesCache: Map<string, SandboxFileInfo[]> = new Map();

	refresh(): void {
		this._onDidChangeTreeData.fire();
	}

	getTreeItem(element: SandboxTreeItem): vscode.TreeItem {
		return element;
	}

	async getChildren(element?: SandboxTreeItem): Promise<SandboxTreeItem[]> {
		// Root level
		if (!element) {
			return this.getRootChildren();
		}

		// Sandbox children (categories)
		if (element.itemType === 'sandbox' && element.sandboxData) {
			return this.getSandboxCategories(element.sandboxData, element.linkedData);
		}

		// Category children
		if (element.itemType === 'category' && element.parentSandboxId) {
			switch (element.categoryType) {
				case 'files':
					// Pass undefined for root listing (CLI defaults to sandbox home)
					return this.getFilesChildren(element.parentSandboxId, undefined);
				case 'snapshots':
					return this.getSnapshotsChildren(element.parentSandboxId);
				case 'executions':
					return this.getExecutionsChildren(element.parentSandboxId);
			}
		}

		// Directory children
		if (element.itemType === 'directory' && element.parentSandboxId && element.filePath) {
			return this.getFilesChildren(element.parentSandboxId, element.filePath);
		}

		// Snapshot children (files from snapshot get)
		if (element.itemType === 'snapshot' && element.snapshotData) {
			return this.getSnapshotFilesChildren(element.snapshotData.snapshotId);
		}

		return [];
	}

	private async getRootChildren(): Promise<SandboxTreeItem[]> {
		const authStatus = getAuthStatus();

		if (authStatus.state === 'unknown') {
			return [
				new SandboxTreeItem('Checking auth...', vscode.TreeItemCollapsibleState.None, 'message'),
			];
		}

		if (authStatus.state === 'cli-missing') {
			return [
				new SandboxTreeItem('CLI not installed', vscode.TreeItemCollapsibleState.None, 'message'),
			];
		}

		if (authStatus.state === 'unauthenticated') {
			return [
				new SandboxTreeItem('Not logged in', vscode.TreeItemCollapsibleState.None, 'message'),
			];
		}

		if (this.loading) {
			return [new SandboxTreeItem('Loading...', vscode.TreeItemCollapsibleState.None, 'message')];
		}

		if (this.error) {
			return [
				new SandboxTreeItem(
					`Error: ${this.error}`,
					vscode.TreeItemCollapsibleState.None,
					'message'
				),
			];
		}

		// Load sandboxes if not loaded
		if (!this.sandboxesLoaded && !this.loading) {
			await this.loadSandboxes();
		}

		const items: SandboxTreeItem[] = [];

		// Get linked sandboxes for this workspace
		let linkedSandboxes: LinkedSandbox[] = [];
		try {
			linkedSandboxes = getSandboxManager().getLinkedSandboxes();
		} catch {
			// SandboxManager not initialized yet
		}

		// Add sandbox items
		for (const sandbox of this.sandboxes) {
			const linked = linkedSandboxes.find((l) => l.sandboxId === sandbox.sandboxId);
			const displayName = linked?.name || sandbox.sandboxId;

			items.push(
				new SandboxTreeItem(
					displayName,
					vscode.TreeItemCollapsibleState.Collapsed,
					'sandbox',
					sandbox,
					undefined,
					undefined,
					undefined,
					undefined,
					undefined,
					linked
				)
			);
		}

		// Add "Create Sandbox" action at the end
		items.push(
			new SandboxTreeItem(
				'Create Sandbox',
				vscode.TreeItemCollapsibleState.None,
				'createSandbox'
			)
		);

		if (items.length === 1) {
			// Only the "Create Sandbox" item
			return [
				new SandboxTreeItem(
					'No sandboxes found',
					vscode.TreeItemCollapsibleState.None,
					'message'
				),
				items[0],
			];
		}

		return items;
	}

	private getSandboxCategories(
		sandbox: SandboxInfo,
		linked?: LinkedSandbox
	): SandboxTreeItem[] {
		return [
			new SandboxTreeItem(
				'Files',
				vscode.TreeItemCollapsibleState.Collapsed,
				'category',
				sandbox,
				undefined,
				undefined,
				undefined,
				sandbox.sandboxId,
				'files',
				linked
			),
			new SandboxTreeItem(
				'Snapshots',
				vscode.TreeItemCollapsibleState.Collapsed,
				'category',
				sandbox,
				undefined,
				undefined,
				undefined,
				sandbox.sandboxId,
				'snapshots',
				linked
			),
			new SandboxTreeItem(
				'Executions',
				vscode.TreeItemCollapsibleState.Collapsed,
				'category',
				sandbox,
				undefined,
				undefined,
				undefined,
				sandbox.sandboxId,
				'executions',
				linked
			),
		];
	}

	private async getFilesChildren(sandboxId: string, dirPath?: string): Promise<SandboxTreeItem[]> {
		// Always fetch from root to get full file list, then filter
		const cacheKey = `${sandboxId}:root`;

		// Check cache first - always cache from root
		if (!this.filesCache.has(cacheKey)) {
			const cli = getCliClient();
			// Always fetch from root (no path) to get complete file list
			const result = await cli.sandboxLs(sandboxId);

			if (result.success && result.data) {
				this.filesCache.set(cacheKey, result.data);
			} else {
				return [
					new SandboxTreeItem(
						`Error: ${result.error || 'Failed to list files'}`,
						vscode.TreeItemCollapsibleState.None,
						'message'
					),
				];
			}
		}

		const allFiles = this.filesCache.get(cacheKey) || [];

		// Filter to only show direct children of the current directory
		const directChildren = allFiles.filter((file) => {
			const filePath = file.path;

			if (!dirPath) {
				// Root level: only show items without '/' in path
				return !filePath.includes('/');
			} else {
				// Subdirectory: only show direct children
				// File must start with dirPath/
				if (!filePath.startsWith(dirPath + '/')) {
					return false;
				}
				// The remaining part after dirPath/ should not contain another '/'
				const remaining = filePath.slice(dirPath.length + 1);
				return !remaining.includes('/');
			}
		});

		if (directChildren.length === 0) {
			return [
				new SandboxTreeItem('(empty)', vscode.TreeItemCollapsibleState.None, 'message'),
			];
		}

		// Sort: directories first, then files, alphabetically
		const sorted = [...directChildren].sort((a, b) => {
			if (a.isDir && !b.isDir) return -1;
			if (!a.isDir && b.isDir) return 1;
			return a.name.localeCompare(b.name);
		});

		return sorted.map((file) => {
			return new SandboxTreeItem(
				file.name,
				file.isDir
					? vscode.TreeItemCollapsibleState.Collapsed
					: vscode.TreeItemCollapsibleState.None,
				file.isDir ? 'directory' : 'file',
				undefined,
				file,
				undefined,
				undefined,
				sandboxId,
				undefined,
				undefined,
				file.path // Use the full path from CLI
			);
		});
	}

	private async getSnapshotsChildren(sandboxId: string): Promise<SandboxTreeItem[]> {
		if (!this.snapshotsCache.has(sandboxId)) {
			const cli = getCliClient();
			const result = await cli.snapshotList(sandboxId);

			if (result.success && result.data) {
				this.snapshotsCache.set(sandboxId, result.data);
			} else {
				return [
					new SandboxTreeItem(
						`Error: ${result.error || 'Failed to list snapshots'}`,
						vscode.TreeItemCollapsibleState.None,
						'message'
					),
				];
			}
		}

		const snapshots = this.snapshotsCache.get(sandboxId) || [];

		if (snapshots.length === 0) {
			return [
				new SandboxTreeItem('No snapshots', vscode.TreeItemCollapsibleState.None, 'message'),
			];
		}

		return snapshots.map(
			(snap) =>
				new SandboxTreeItem(
					snap.tag || snap.snapshotId.slice(0, 12),
					// Make expandable to show files
					vscode.TreeItemCollapsibleState.Collapsed,
					'snapshot',
					undefined,
					undefined,
					snap,
					undefined,
					sandboxId
				)
		);
	}

	private async getSnapshotFilesChildren(snapshotId: string): Promise<SandboxTreeItem[]> {
		// Fetch snapshot details to get file list
		const cli = getCliClient();
		const result = await cli.snapshotGet(snapshotId);

		if (!result.success || !result.data) {
			return [
				new SandboxTreeItem(
					`Error: ${result.error || 'Failed to get snapshot'}`,
					vscode.TreeItemCollapsibleState.None,
					'message'
				),
			];
		}

		const snapshotData = result.data;
		const files = snapshotData.files || [];

		if (files.length === 0) {
			return [
				new SandboxTreeItem('(no files)', vscode.TreeItemCollapsibleState.None, 'message'),
			];
		}

		// Sort files alphabetically
		const sorted = [...files].sort((a, b) => a.path.localeCompare(b.path));

		return sorted.map((file) => {
			const fileName = file.path.split('/').pop() || file.path;
			return new SandboxTreeItem(
				fileName,
				vscode.TreeItemCollapsibleState.None,
				'snapshotFile',
				undefined,
				{ path: file.path, name: fileName, size: file.size, isDir: false, mode: '', modTime: '' },
				snapshotData, // Pass snapshot data so we have access to downloadUrl
				undefined,
				undefined,
				undefined,
				undefined,
				file.path
			);
		});
	}

	private async getExecutionsChildren(sandboxId: string): Promise<SandboxTreeItem[]> {
		if (!this.executionsCache.has(sandboxId)) {
			const cli = getCliClient();
			const result = await cli.executionList(sandboxId);

			if (result.success && result.data) {
				this.executionsCache.set(sandboxId, result.data);
			} else {
				return [
					new SandboxTreeItem(
						`Error: ${result.error || 'Failed to list executions'}`,
						vscode.TreeItemCollapsibleState.None,
						'message'
					),
				];
			}
		}

		const executions = this.executionsCache.get(sandboxId) || [];

		if (executions.length === 0) {
			return [
				new SandboxTreeItem('No executions', vscode.TreeItemCollapsibleState.None, 'message'),
			];
		}

		return executions.map(
			(exec) =>
				new SandboxTreeItem(
					exec.executionId.slice(0, 12),
					vscode.TreeItemCollapsibleState.None,
					'execution',
					undefined,
					undefined,
					undefined,
					exec,
					sandboxId
				)
		);
	}

	private async loadSandboxes(): Promise<void> {
		this.loading = true;
		this.error = undefined;

		try {
			const cli = getCliClient();
			const result = await cli.sandboxList();

			if (result.success && result.data) {
				this.sandboxes = Array.isArray(result.data) ? result.data : [];
			} else {
				this.error = result.error || 'Failed to load sandboxes';
				this.sandboxes = [];
			}
		} catch (err) {
			this.error = err instanceof Error ? err.message : 'Unknown error';
			this.sandboxes = [];
		} finally {
			this.loading = false;
			this.sandboxesLoaded = true;
		}
	}

	async forceRefresh(): Promise<void> {
		this.sandboxes = [];
		this.sandboxesLoaded = false;
		this.error = undefined;
		this.clearCaches();
		await this.loadSandboxes();
		this.refresh();
	}

	clearCaches(): void {
		this.snapshotsCache.clear();
		this.executionsCache.clear();
		this.filesCache.clear();
	}

	/**
	 * Clear cache for a specific sandbox.
	 */
	clearSandboxCache(sandboxId: string): void {
		this.snapshotsCache.delete(sandboxId);
		this.executionsCache.delete(sandboxId);

		// Clear files cache for this sandbox
		this.filesCache.delete(`${sandboxId}:root`);
	}

	dispose(): void {
		this._onDidChangeTreeData.dispose();
	}
}
