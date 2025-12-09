import * as vscode from 'vscode';
import * as path from 'path';
import { AgentTreeDataProvider, AgentTreeItem } from './agentTreeData';
import { onAuthStatusChanged } from '../../core/auth';
import { onProjectChanged, getCurrentProject } from '../../core/project';
import { getLogsPanelProvider } from '../logsPanel';

export function registerAgentExplorer(context: vscode.ExtensionContext): AgentTreeDataProvider {
	const provider = new AgentTreeDataProvider();

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
				const agent = item?.agentData;
				if (!agent) {
					vscode.window.showWarningMessage('No agent selected');
					return;
				}

				// Use metadata.identifier (human-readable) for filtering, not the hash ID
				const identifier = agent.metadata?.identifier || agent.identifier;
				if (!identifier) {
					vscode.window.showWarningMessage('Agent has no identifier');
					return;
				}

				const logsPanel = getLogsPanelProvider();
				if (logsPanel) {
					logsPanel.setFilter({ agentIdentifier: identifier, count: 50 });
					await vscode.commands.executeCommand('agentuity.sessionLogsPanel.focus');
					vscode.window.showInformationMessage(`Showing sessions for agent: ${agent.name}`);
				} else {
					vscode.window.showErrorMessage('Session logs panel not available');
				}
			}
		)
	);

	context.subscriptions.push(
		vscode.commands.registerCommand(
			'agentuity.agent.viewSessionLogs',
			async (item: AgentTreeItem) => {
				const agent = item?.agentData;
				if (!agent) {
					vscode.window.showWarningMessage('No agent selected');
					return;
				}

				// Use metadata.identifier (human-readable) for filtering, not the hash ID
				const identifier = agent.metadata?.identifier || agent.identifier;
				if (!identifier) {
					vscode.window.showWarningMessage('Agent has no identifier');
					return;
				}

				const logsPanel = getLogsPanelProvider();
				if (logsPanel) {
					logsPanel.setFilter({ agentIdentifier: identifier, count: 50 });
					await vscode.commands.executeCommand('agentuity.sessionLogsPanel.focus');
					vscode.window.showInformationMessage(`Showing session logs for agent: ${agent.name}`);
				} else {
					vscode.window.showErrorMessage('Session logs panel not available');
				}
			}
		)
	);

	context.subscriptions.push(treeView, authSub, projectSub, { dispose: () => provider.dispose() });

	return provider;
}

export { AgentTreeDataProvider };
