import * as vscode from 'vscode';
import { getCliClient, type Deployment } from '../../core/cliClient';
import { getAuthStatus } from '../../core/auth';
import { hasProject } from '../../core/project';

export type DeploymentItemType = 'deployment' | 'info' | 'message';

export class DeploymentTreeItem extends vscode.TreeItem {
	constructor(
		public readonly label: string,
		public readonly collapsibleState: vscode.TreeItemCollapsibleState,
		public readonly itemType: DeploymentItemType,
		public readonly deploymentData?: Deployment
	) {
		super(label, collapsibleState);
		this.setIcon();
		this.contextValue = itemType;
	}

	private setIcon(): void {
		switch (this.itemType) {
			case 'deployment':
				if (this.deploymentData?.active) {
					this.iconPath = new vscode.ThemeIcon(
						'rocket',
						new vscode.ThemeColor('charts.green')
					);
				} else {
					this.iconPath = new vscode.ThemeIcon('history');
				}
				break;
			case 'info':
			case 'message':
				this.iconPath = new vscode.ThemeIcon('info');
				break;
		}
	}
}

export class DeploymentTreeDataProvider implements vscode.TreeDataProvider<DeploymentTreeItem> {
	private _onDidChangeTreeData = new vscode.EventEmitter<
		DeploymentTreeItem | undefined | null | void
	>();
	readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

	private deployments: Deployment[] = [];
	private loading = false;
	private error: string | undefined;

	refresh(): void {
		this._onDidChangeTreeData.fire();
	}

	getTreeItem(element: DeploymentTreeItem): vscode.TreeItem {
		return element;
	}

	async getChildren(element?: DeploymentTreeItem): Promise<DeploymentTreeItem[]> {
		if (element) {
			if (element.itemType === 'deployment' && element.deploymentData) {
				return this.getDeploymentDetails(element.deploymentData);
			}
			return [];
		}

		const authStatus = getAuthStatus();
		if (authStatus.state === 'unknown') {
			return [
				new DeploymentTreeItem(
					'Checking auth...',
					vscode.TreeItemCollapsibleState.None,
					'message'
				),
			];
		}

		if (authStatus.state === 'cli-missing') {
			return [
				new DeploymentTreeItem(
					'CLI not installed',
					vscode.TreeItemCollapsibleState.None,
					'message'
				),
			];
		}

		if (authStatus.state === 'unauthenticated') {
			return [
				new DeploymentTreeItem(
					'Not logged in',
					vscode.TreeItemCollapsibleState.None,
					'message'
				),
			];
		}

		if (!hasProject()) {
			return [
				new DeploymentTreeItem(
					'No project detected',
					vscode.TreeItemCollapsibleState.None,
					'message'
				),
			];
		}

		if (this.loading) {
			return [
				new DeploymentTreeItem('Loading...', vscode.TreeItemCollapsibleState.None, 'message'),
			];
		}

		if (this.error) {
			return [
				new DeploymentTreeItem(
					`Error: ${this.error}`,
					vscode.TreeItemCollapsibleState.None,
					'message'
				),
			];
		}

		if (this.deployments.length === 0) {
			await this.loadDeployments();
		}

		if (this.deployments.length === 0) {
			return [
				new DeploymentTreeItem(
					'No deployments found',
					vscode.TreeItemCollapsibleState.None,
					'message'
				),
			];
		}

		return this.deployments.map((dep) => {
			const label = dep.active ? `${dep.id} (active)` : dep.id;
			const item = new DeploymentTreeItem(
				label,
				vscode.TreeItemCollapsibleState.Collapsed,
				'deployment',
				dep
			);
			item.description = dep.state || '';
			item.tooltip = this.formatTooltip(dep);
			return item;
		});
	}

	private getDeploymentDetails(dep: Deployment): DeploymentTreeItem[] {
		const items: DeploymentTreeItem[] = [];

		items.push(
			new DeploymentTreeItem(
				`State: ${dep.state || 'unknown'}`,
				vscode.TreeItemCollapsibleState.None,
				'info'
			)
		);
		items.push(
			new DeploymentTreeItem(
				`Created: ${new Date(dep.createdAt).toLocaleString()}`,
				vscode.TreeItemCollapsibleState.None,
				'info'
			)
		);
		if (dep.message) {
			items.push(
				new DeploymentTreeItem(
					`Message: ${dep.message}`,
					vscode.TreeItemCollapsibleState.None,
					'info'
				)
			);
		}
		if (dep.tags.length > 0) {
			items.push(
				new DeploymentTreeItem(
					`Tags: ${dep.tags.join(', ')}`,
					vscode.TreeItemCollapsibleState.None,
					'info'
				)
			);
		}

		return items;
	}

	private formatTooltip(dep: Deployment): string {
		const lines = [
			`ID: ${dep.id}`,
			`State: ${dep.state || 'unknown'}`,
			`Active: ${dep.active ? 'Yes' : 'No'}`,
			`Created: ${new Date(dep.createdAt).toLocaleString()}`,
		];
		if (dep.message) {
			lines.push(`Message: ${dep.message}`);
		}
		if (dep.tags.length > 0) {
			lines.push(`Tags: ${dep.tags.join(', ')}`);
		}
		return lines.join('\n');
	}

	private async loadDeployments(): Promise<void> {
		this.loading = true;
		this.error = undefined;

		try {
			const cli = getCliClient();
			const result = await cli.listDeployments(10);

			if (result.success && result.data) {
				this.deployments = Array.isArray(result.data) ? result.data : [];
			} else {
				this.error = result.error || 'Failed to load deployments';
				this.deployments = [];
			}
		} catch (err) {
			this.error = err instanceof Error ? err.message : 'Unknown error';
			this.deployments = [];
		} finally {
			this.loading = false;
		}
	}

	async forceRefresh(): Promise<void> {
		this.deployments = [];
		this.error = undefined;
		await this.loadDeployments();
		this.refresh();
	}

	dispose(): void {
		this._onDidChangeTreeData.dispose();
	}
}
