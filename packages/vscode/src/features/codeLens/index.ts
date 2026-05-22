import * as vscode from 'vscode';
import { AgentCodeLensProvider, type AgentCodeLensInfo } from './agentCodeLensProvider';
import { getDevServerManager } from '../devServer';
import { getCurrentProject } from '../../core/project';
import { getAgentProvider } from '../agentExplorer';
import { getSessionsUrl } from '../../core/urls';

export function registerCodeLens(context: vscode.ExtensionContext): AgentCodeLensProvider {
	const provider = new AgentCodeLensProvider();

	const selector: vscode.DocumentSelector = [
		{ language: 'typescript', scheme: 'file' },
		{ language: 'javascript', scheme: 'file' },
	];

	context.subscriptions.push(vscode.languages.registerCodeLensProvider(selector, provider));

	context.subscriptions.push(
		vscode.commands.registerCommand(
			'agentuity.codeLens.viewSessions',
			async (info: AgentCodeLensInfo) => {
				const project = getCurrentProject();
				if (!project) {
					vscode.window.showErrorMessage('No Agentuity project found');
					return;
				}

				if (!info.identifier) {
					vscode.window.showErrorMessage('Could not determine agent identifier');
					return;
				}

				const agentProvider = getAgentProvider();
				if (!agentProvider) {
					vscode.window.showErrorMessage('Agent explorer not initialized');
					return;
				}

				const agent = agentProvider.findAgentByIdentifier(info.identifier);

				if (!agent) {
					vscode.window.showWarningMessage(
						`Agent "${info.identifier}" not found. Deploy your project first to view sessions.`
					);
					return;
				}

				const url = getSessionsUrl(project.projectId, agent.id);
				await vscode.env.openExternal(vscode.Uri.parse(url));
			}
		)
	);

	const devServer = getDevServerManager();
	devServer.onStateChanged(() => {
		provider.refresh();
	});

	context.subscriptions.push({ dispose: () => provider.dispose() });

	return provider;
}

export { AgentCodeLensProvider, type AgentCodeLensInfo };
