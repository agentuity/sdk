import * as vscode from 'vscode';
import { getCliClient } from '../../core/cliClient';
import { getAuthStatus } from '../../core/auth';
import { hasProject, getCurrentProject } from '../../core/project';
import { getDevServerManager } from '../devServer';

interface AgentuityContextItem extends vscode.ChatContextItem {
	contextType: 'workspace' | 'agents' | 'deployments' | 'devServer' | 'agent-detail';
	agentId?: string;
}

const CONTEXT_PROVIDER_ID = 'agentuity.context';

export function registerChatContextProvider(context: vscode.ExtensionContext): void {
	if (!vscode.chat?.registerChatContextProvider) {
		return;
	}

	try {
		const provider = new AgentuityContextProvider();

		const disposable = vscode.chat.registerChatContextProvider(
			[{ language: 'typescript' }, { language: 'javascript' }, { pattern: '**/agentuity*.json' }],
			CONTEXT_PROVIDER_ID,
			provider
		);

		context.subscriptions.push(disposable);
		context.subscriptions.push(provider);
	} catch {
		// Chat context provider API not available
	}
}

class AgentuityContextProvider implements vscode.ChatContextProvider<AgentuityContextItem> {
	private readonly _onDidChangeWorkspaceChatContext = new vscode.EventEmitter<void>();
	readonly onDidChangeWorkspaceChatContext = this._onDidChangeWorkspaceChatContext.event;

	private _disposables: vscode.Disposable[] = [];

	constructor() {
		const devServer = getDevServerManager();
		this._disposables.push(
			devServer.onStateChanged(() => {
				this._onDidChangeWorkspaceChatContext.fire();
			})
		);
	}

	dispose(): void {
		this._onDidChangeWorkspaceChatContext.dispose();
		for (const d of this._disposables) {
			d.dispose();
		}
	}

	async provideWorkspaceChatContext(
		_token: vscode.CancellationToken
	): Promise<AgentuityContextItem[]> {
		if (!hasProject()) {
			return [];
		}

		const items: AgentuityContextItem[] = [];

		items.push({
			icon: new vscode.ThemeIcon('rocket'),
			label: 'Agentuity Project',
			modelDescription:
				'Summary of the Agentuity AI agent project including authentication, agents, deployments, and dev server status',
			contextType: 'workspace',
		});

		return items;
	}

	async provideChatContextExplicit(
		token: vscode.CancellationToken
	): Promise<AgentuityContextItem[]> {
		if (!hasProject()) {
			return [];
		}

		const items: AgentuityContextItem[] = [];

		items.push({
			icon: new vscode.ThemeIcon('rocket'),
			label: 'Agentuity: Full Project Context',
			modelDescription:
				'Complete Agentuity project context including all agents, deployments, data stores, and dev server status',
			contextType: 'workspace',
		});

		items.push({
			icon: new vscode.ThemeIcon('hubot'),
			label: 'Agentuity: Agents',
			modelDescription: 'List of all agents in this Agentuity project with their configuration',
			contextType: 'agents',
		});

		items.push({
			icon: new vscode.ThemeIcon('cloud-upload'),
			label: 'Agentuity: Deployments',
			modelDescription: 'Recent deployments and their status for this Agentuity project',
			contextType: 'deployments',
		});

		items.push({
			icon: new vscode.ThemeIcon('server-process'),
			label: 'Agentuity: Dev Server',
			modelDescription: 'Current dev server status and configuration',
			contextType: 'devServer',
		});

		if (!token.isCancellationRequested) {
			const cli = getCliClient();
			const agentsResult = await cli.listAgents();

			if (agentsResult.success && agentsResult.data) {
				for (const agent of agentsResult.data) {
					items.push({
						icon: new vscode.ThemeIcon('hubot'),
						label: `Agentuity Agent: ${agent.name}`,
						modelDescription: `Details for the "${agent.name}" agent including configuration, tools, and recent sessions`,
						contextType: 'agent-detail',
						agentId: agent.id,
					});
				}
			}
		}

		return items;
	}

	async resolveChatContext(
		item: AgentuityContextItem,
		token: vscode.CancellationToken
	): Promise<vscode.ChatContextItem> {
		let value: string;

		switch (item.contextType) {
			case 'workspace':
				value = await this.resolveWorkspaceContext(token);
				break;
			case 'agents':
				value = await this.resolveAgentsContext(token);
				break;
			case 'deployments':
				value = await this.resolveDeploymentsContext(token);
				break;
			case 'devServer':
				value = this.resolveDevServerContext();
				break;
			case 'agent-detail':
				value = await this.resolveAgentDetailContext(item.agentId!, token);
				break;
			default:
				value = 'No context available';
		}

		return {
			icon: item.icon,
			label: item.label,
			modelDescription: item.modelDescription,
			value,
		};
	}

	private async resolveWorkspaceContext(token: vscode.CancellationToken): Promise<string> {
		const lines: string[] = ['# Agentuity Project Context', ''];

		const authStatus = getAuthStatus();
		lines.push('## Authentication');
		if (authStatus.state === 'authenticated' && authStatus.user) {
			lines.push(`- Status: Authenticated`);
			lines.push(`- User: ${authStatus.user.firstName} ${authStatus.user.lastName}`);
		} else {
			lines.push('- Status: Not authenticated');
		}
		lines.push('');

		const project = getCurrentProject();
		lines.push('## Project');
		if (project) {
			lines.push(`- Project ID: ${project.projectId}`);
			lines.push(`- Organization ID: ${project.orgId}`);
			if (project.region) {
				lines.push(`- Region: ${project.region}`);
			}
		} else {
			lines.push('- No project configuration found');
		}
		lines.push('');

		lines.push('## Dev Server');
		const devServer = getDevServerManager();
		lines.push(`- Status: ${devServer.getState()}`);
		lines.push('');

		if (!token.isCancellationRequested && hasProject()) {
			const cli = getCliClient();

			const agentsResult = await cli.listAgents();
			if (agentsResult.success && agentsResult.data) {
				lines.push(`## Agents (${agentsResult.data.length})`);
				for (const agent of agentsResult.data) {
					lines.push(`- **${agent.name}** (${agent.identifier || agent.id})`);
					if (agent.description) {
						lines.push(`  - ${agent.description}`);
					}
				}
				lines.push('');
			}

			if (!token.isCancellationRequested) {
				const deploymentsResult = await cli.listDeployments();
				if (deploymentsResult.success && deploymentsResult.data) {
					const recent = deploymentsResult.data.slice(0, 5);
					lines.push(`## Recent Deployments (${recent.length} of ${deploymentsResult.data.length})`);
					for (const dep of recent) {
						const status = dep.active ? 'Active' : dep.state || 'Inactive';
						const date = new Date(dep.createdAt).toLocaleDateString();
						lines.push(`- ${dep.id.substring(0, 8)} - ${status} (${date})`);
					}
					lines.push('');
				}
			}
		}

		return lines.join('\n');
	}

	private async resolveAgentsContext(_token: vscode.CancellationToken): Promise<string> {
		if (!hasProject()) {
			return 'No Agentuity project found in workspace.';
		}

		const cli = getCliClient();
		const result = await cli.listAgents();

		if (!result.success || !result.data) {
			return `Failed to fetch agents: ${result.error || 'Unknown error'}`;
		}

		const lines: string[] = [`# Agentuity Agents (${result.data.length})`, ''];

		for (const agent of result.data) {
			lines.push(`## ${agent.name}`);
			lines.push(`- ID: ${agent.id}`);
			lines.push(`- Identifier: ${agent.identifier || 'N/A'}`);
			if (agent.description) {
				lines.push(`- Description: ${agent.description}`);
			}
			if (agent.metadata?.filename) {
				lines.push(`- Source File: ${agent.metadata.filename}`);
			}
			lines.push('');
		}

		return lines.join('\n');
	}

	private async resolveDeploymentsContext(_token: vscode.CancellationToken): Promise<string> {
		if (!hasProject()) {
			return 'No Agentuity project found in workspace.';
		}

		const cli = getCliClient();
		const result = await cli.listDeployments();

		if (!result.success || !result.data) {
			return `Failed to fetch deployments: ${result.error || 'Unknown error'}`;
		}

		const lines: string[] = [`# Agentuity Deployments (${result.data.length})`, ''];

		for (const dep of result.data.slice(0, 10)) {
			const status = dep.active ? 'Active' : dep.state || 'Inactive';
			const date = new Date(dep.createdAt).toLocaleString();
			lines.push(`## Deployment ${dep.id.substring(0, 8)}`);
			lines.push(`- Full ID: ${dep.id}`);
			lines.push(`- Status: ${status}`);
			lines.push(`- Created: ${date}`);
			if (dep.tags?.length) {
				lines.push(`- Tags: ${dep.tags.join(', ')}`);
			}
			lines.push('');
		}

		if (result.data.length > 10) {
			lines.push(`*...and ${result.data.length - 10} more deployments*`);
		}

		return lines.join('\n');
	}

	private resolveDevServerContext(): string {
		const devServer = getDevServerManager();
		const state = devServer.getState();

		const lines: string[] = ['# Agentuity Dev Server', ''];
		lines.push(`- Status: ${state}`);

		if (state === 'running') {
			lines.push('- The dev server is currently running and ready to handle requests');
			lines.push('- Use the Agentuity Workbench to test agents locally');
		} else if (state === 'error') {
			lines.push('- The dev server encountered an error');
			lines.push('- Check the output panel for details');
		} else {
			lines.push('- The dev server is not running');
			lines.push('- Run `agentuity dev` or use the "Start Dev Server" command to start it');
		}

		return lines.join('\n');
	}

	private async resolveAgentDetailContext(
		agentId: string,
		token: vscode.CancellationToken
	): Promise<string> {
		if (!hasProject()) {
			return 'No Agentuity project found in workspace.';
		}

		const cli = getCliClient();
		const agentsResult = await cli.listAgents();

		if (!agentsResult.success || !agentsResult.data) {
			return `Failed to fetch agent details: ${agentsResult.error || 'Unknown error'}`;
		}

		const agent = agentsResult.data.find((a) => a.id === agentId);
		if (!agent) {
			return `Agent with ID ${agentId} not found.`;
		}

		const lines: string[] = [`# Agent: ${agent.name}`, ''];
		lines.push(`- ID: ${agent.id}`);
		lines.push(`- Identifier: ${agent.identifier || 'N/A'}`);
		if (agent.description) {
			lines.push(`- Description: ${agent.description}`);
		}
		if (agent.metadata?.filename) {
			lines.push(`- Source File: ${agent.metadata.filename}`);
		}
		lines.push('');

		if (!token.isCancellationRequested) {
			const sessionsResult = await cli.listSessions({ count: 10 });
			if (sessionsResult.success && sessionsResult.data) {
				const recentSessions = sessionsResult.data.slice(0, 5);
				if (recentSessions.length > 0) {
					lines.push(`## Recent Sessions (${recentSessions.length})`);
					for (const session of recentSessions) {
						const status = session.success ? '✓' : '✗';
						const time = new Date(session.created_at).toLocaleString();
						lines.push(`- ${status} ${session.id.substring(0, 8)} - ${time} (${session.trigger})`);
					}
				}
			}
		}

		return lines.join('\n');
	}
}
