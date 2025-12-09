import * as vscode from 'vscode';
import { AgentCodeLensProvider, type AgentCodeLensInfo } from './agentCodeLensProvider';
import { getDevServerManager } from '../devServer';
import { getCurrentProject } from '../../core/project';
import { getLogsPanelProvider } from '../logsPanel';

const WORKBENCH_BASE_URL = 'https://app.agentuity.com';

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

				const project = getCurrentProject();
				if (!project) {
					vscode.window.showErrorMessage('No Agentuity project found');
					return;
				}

				let url = `${WORKBENCH_BASE_URL}/projects/${project.projectId}/workbench`;
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
				const logsPanel = getLogsPanelProvider();

				if (!logsPanel) {
					vscode.window.showErrorMessage('Session logs panel not available');
					return;
				}

				if (info.identifier) {
					logsPanel.setFilter({
						agentIdentifier: info.identifier,
						count: 50,
					});
				}

				await vscode.commands.executeCommand('agentuity.sessionLogsPanel.focus');

				const agentName = info.name || info.identifier || 'agent';
				vscode.window.showInformationMessage(`Showing sessions for ${agentName}`);
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
