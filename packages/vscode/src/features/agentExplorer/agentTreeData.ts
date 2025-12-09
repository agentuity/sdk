import * as vscode from 'vscode';
import * as path from 'path';
import { getCliClient, type Agent } from '../../core/cliClient';
import { getCurrentProject } from '../../core/project';
import { BaseTreeDataProvider } from '../../core/baseTreeDataProvider';

export class AgentTreeItem extends vscode.TreeItem {
	constructor(
		public readonly label: string,
		public readonly collapsibleState: vscode.TreeItemCollapsibleState,
		public readonly itemType: 'agent' | 'route' | 'message',
		public readonly agentData?: Agent
	) {
		super(label, collapsibleState);

		if (itemType === 'agent') {
			this.iconPath = new vscode.ThemeIcon('robot');
			this.contextValue = 'agent';
			this.tooltip = this.buildAgentTooltip(agentData);
			if (agentData?.metadata?.filename) {
				const project = getCurrentProject();
				if (project) {
					const filePath = path.join(project.rootPath, agentData.metadata.filename);
					this.command = {
						command: 'vscode.open',
						title: 'Open Agent',
						arguments: [vscode.Uri.file(filePath)],
					};
				}
			}
		} else if (itemType === 'route') {
			this.iconPath = new vscode.ThemeIcon('symbol-method');
			this.contextValue = 'route';
		} else if (itemType === 'message') {
			this.iconPath = new vscode.ThemeIcon('info');
			this.contextValue = 'message';
		}
	}

	private buildAgentTooltip(agent?: Agent): string {
		const lines: string[] = [];
		if (agent?.name) {
			lines.push(`Name: ${agent.name}`);
		}
		if (agent?.description) {
			lines.push(`Description: ${agent.description}`);
		}
		if (agent?.identifier) {
			lines.push(`Identifier: ${agent.identifier}`);
		}
		if (agent?.metadata?.filename) {
			lines.push(`File: ${agent.metadata.filename}`);
		}
		lines.push('');
		lines.push('Right-click for more actions');
		return lines.join('\n');
	}
}

export class AgentTreeDataProvider extends BaseTreeDataProvider<AgentTreeItem> {
	private agents: Agent[] = [];

	protected createMessageItem(message: string): AgentTreeItem {
		return new AgentTreeItem(message, vscode.TreeItemCollapsibleState.None, 'message');
	}

	async getChildren(element?: AgentTreeItem): Promise<AgentTreeItem[]> {
		if (element) {
			return [];
		}

		const authProjectCheck = this.checkAuthAndProject();
		if (authProjectCheck) {
			return authProjectCheck;
		}

		if (this.loading) {
			return this.getLoadingItems();
		}

		if (this.error) {
			return this.getErrorItems();
		}

		if (this.agents.length === 0) {
			await this.loadData();
		}

		if (this.agents.length === 0) {
			return this.getEmptyItems('No agents found');
		}

		return this.agents.map(
			(agent) =>
				new AgentTreeItem(agent.name, vscode.TreeItemCollapsibleState.None, 'agent', agent)
		);
	}

	protected async loadData(): Promise<void> {
		this.loading = true;
		this.error = undefined;

		try {
			const cli = getCliClient();
			const result = await cli.listAgents();

			if (result.success && result.data) {
				this.agents = Array.isArray(result.data) ? result.data : [];
			} else {
				// Check for deployment-related errors
				const errorLower = (result.error || '').toLowerCase();
				if (
					errorLower.includes('no deployment') ||
					errorLower.includes('not deployed') ||
					errorLower.includes('deployment not found') ||
					errorLower.includes('no agents')
				) {
					this.error = 'Deploy first to see agents';
				} else {
					this.error = result.error || 'Failed to load agents';
				}
				this.agents = [];
			}
		} catch (err) {
			this.error = err instanceof Error ? err.message : 'Unknown error';
			this.agents = [];
		} finally {
			this.loading = false;
		}
	}

	async forceRefresh(): Promise<void> {
		this.agents = [];
		await super.forceRefresh();
	}

	getAgents(): Agent[] {
		return this.agents;
	}

	findAgentByIdentifier(identifier: string): Agent | undefined {
		return this.agents.find(
			(a) =>
				a.metadata?.identifier === identifier ||
				a.identifier === identifier ||
				a.name === identifier
		);
	}
}
