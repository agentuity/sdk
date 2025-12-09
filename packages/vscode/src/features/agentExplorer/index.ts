import * as vscode from 'vscode';
import * as path from 'path';
import { AgentTreeDataProvider, AgentTreeItem } from './agentTreeData';
import { onAuthStatusChanged } from '../../core/auth';
import { onProjectChanged, getCurrentProject } from '../../core/project';

const SESSIONS_BASE_URL = 'https://app-v1.agentuity.com';

let agentProvider: AgentTreeDataProvider | undefined;

export function getAgentProvider(): AgentTreeDataProvider | undefined {
	return agentProvider;
}

export function registerAgentExplorer(context: vscode.ExtensionContext): AgentTreeDataProvider {
	const provider = new AgentTreeDataProvider();
	agentProvider = provider;

	const treeView = vscode.window.createTreeView('agentuity.agents', {
		treeDataProvider: provider,
		showCollapseAll: true,
	});

	const authSub = onAuthStatusChanged(() => {
		provider.refresh();
	});

	const projectSub = onProjectChanged(() => {
		void provider.forceRefresh();
	});

	context.subscriptions.push(
		vscode.commands.registerCommand('agentuity.agent.goToFile', async (item: AgentTreeItem) => {
			if (!item?.agentData?.metadata?.filename) {
				vscode.window.showWarningMessage('No source file associated with this agent');
				return;
			}

			const project = getCurrentProject();
			if (!project) {
				vscode.window.showWarningMessage('No project detected');
				return;
			}

			const filePath = path.join(project.rootPath, item.agentData.metadata.filename);
			const uri = vscode.Uri.file(filePath);

			try {
				await vscode.window.showTextDocument(uri);
			} catch {
				vscode.window.showErrorMessage(`Could not open file: ${filePath}`);
			}
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand(
			'agentuity.agent.viewSessions',
			async (item: AgentTreeItem) => {
				const project = getCurrentProject();
				if (!project) {
					vscode.window.showErrorMessage('No Agentuity project found');
					return;
				}

				const agent = item?.agentData;
				if (!agent) {
					vscode.window.showWarningMessage('No agent selected');
					return;
				}

				const url = `${SESSIONS_BASE_URL}/projects/${project.projectId}/sessions?agent=${agent.id}`;
				await vscode.env.openExternal(vscode.Uri.parse(url));
			}
		)
	);

	context.subscriptions.push(
		vscode.commands.registerCommand(
			'agentuity.agent.viewSessionLogs',
			async (item: AgentTreeItem) => {
				const project = getCurrentProject();
				if (!project) {
					vscode.window.showErrorMessage('No Agentuity project found');
					return;
				}

				const agent = item?.agentData;
				if (!agent) {
					vscode.window.showWarningMessage('No agent selected');
					return;
				}

				const url = `${SESSIONS_BASE_URL}/projects/${project.projectId}/sessions?agent=${agent.id}`;
				await vscode.env.openExternal(vscode.Uri.parse(url));
			}
		)
	);

	context.subscriptions.push(treeView, authSub, projectSub, { dispose: () => provider.dispose() });

	return provider;
}

export { AgentTreeDataProvider };
