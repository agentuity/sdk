import * as vscode from 'vscode';
import { getAuthStatus, type AuthStatus } from './auth';
import { hasProject } from './project';

export abstract class BaseTreeItem extends vscode.TreeItem {
	constructor(
		public readonly label: string,
		public readonly collapsibleState: vscode.TreeItemCollapsibleState
	) {
		super(label, collapsibleState);
	}
}

export interface TreeDataProviderState {
	loading: boolean;
	error: string | undefined;
}

export abstract class BaseTreeDataProvider<T extends BaseTreeItem>
	implements vscode.TreeDataProvider<T>
{
	protected _onDidChangeTreeData = new vscode.EventEmitter<T | undefined | null | void>();
	readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

	protected loading = false;
	protected error: string | undefined;

	refresh(): void {
		this._onDidChangeTreeData.fire();
	}

	getTreeItem(element: T): vscode.TreeItem {
		return element;
	}

	abstract getChildren(element?: T): Promise<T[]>;

	protected abstract createMessageItem(message: string): T;

	protected abstract loadData(): Promise<void>;

	protected checkAuthAndProject(): T[] | null {
		const authStatus = getAuthStatus();

		if (authStatus.state === 'unknown') {
			return [this.createMessageItem('Checking auth...')];
		}

		if (authStatus.state === 'cli-missing') {
			return [this.createMessageItem('CLI not installed')];
		}

		if (authStatus.state === 'unauthenticated') {
			return [this.createMessageItem('Not logged in')];
		}

		if (!hasProject()) {
			return [this.createMessageItem('No project detected')];
		}

		return null;
	}

	protected getLoadingItems(): T[] {
		return [this.createMessageItem('Loading...')];
	}

	protected getErrorItems(): T[] {
		return [this.createMessageItem(`Error: ${this.error}`)];
	}

	protected getEmptyItems(message = 'No items found'): T[] {
		return [this.createMessageItem(message)];
	}

	async forceRefresh(): Promise<void> {
		this.error = undefined;
		await this.loadData();
		this.refresh();
	}

	getState(): TreeDataProviderState {
		return {
			loading: this.loading,
			error: this.error,
		};
	}

	dispose(): void {
		this._onDidChangeTreeData.dispose();
	}
}
