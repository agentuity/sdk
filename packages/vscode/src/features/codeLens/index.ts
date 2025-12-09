import * as vscode from 'vscode';
import { AgentCodeLensProvider, type AgentCodeLensInfo } from './agentCodeLensProvider';
import { getDevServerManager } from '../devServer';
import { getCurrentProject } from '../../core/project';
import { getAgentProvider } from '../agentExplorer';

const SESSIONS_BASE_URL = 'https://app-v1.agentuity.com';

export function registerCodeLens(context: vscode.ExtensionContext): AgentCodeLensProvider {
	const provider = new AgentCodeLensProvider();

	const selector: vscode.DocumentSelector = [
		{ language: 'typescript', scheme: 'file' },
		{ language: 'javascript', scheme: 'file' },
	];

	context.subscriptions.push(
		vscode.languages.registerCodeLensProvider(selector, provider)
	);

	context.subscriptions.push(
		vscode.commands.registerCommand(
			'agentuity.codeLens.openInWorkbench',
			async (info: AgentCodeLensInfo) => {
				const devServer = getDevServerManager();

				if (devServer.getState() !== 'running') {
					const action = await vscode.window.showWarningMessage(
						'Dev server is not running. Start it to open the Workbench.',
						'Start Dev Server',
						'Cancel'
					);

					if (action === 'Start Dev Server') {
						await vscode.commands.executeCommand('agentuity.dev.start');
						await waitForDevServer(5000);

						if (devServer.getState() !== 'running') {
							vscode.window.showErrorMessage('Failed to start dev server');
							return;
						}
					} else {
						return;
					}
				}

				const port = vscode.workspace.getConfiguration('agentuity').get<number>('devServer.port', 3500);
				let url = `http://localhost:${port}/workbench`;
				if (info.identifier) {
					url += `?agent=${encodeURIComponent(info.identifier)}`;
				}

				await vscode.env.openExternal(vscode.Uri.parse(url));
			}
		)
	);

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

				const url = `${SESSIONS_BASE_URL}/projects/${project.projectId}/sessions?agent=${agent.id}`;
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

async function waitForDevServer(timeoutMs: number): Promise<boolean> {
	const devServer = getDevServerManager();

	return new Promise((resolve) => {
		if (devServer.getState() === 'running') {
			resolve(true);
			return;
		}

		const timeout = setTimeout(() => {
			disposable.dispose();
			resolve(false);
		}, timeoutMs);

		const disposable = devServer.onStateChanged((state) => {
			if (state === 'running') {
				clearTimeout(timeout);
				disposable.dispose();
				resolve(true);
			} else if (state === 'error' || state === 'stopped') {
				clearTimeout(timeout);
				disposable.dispose();
				resolve(false);
			}
		});
	});
}

export { AgentCodeLensProvider, type AgentCodeLensInfo };
