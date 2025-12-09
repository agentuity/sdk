import * as vscode from 'vscode';
import {
	getCliClient,
	disposeCliClient,
	checkAuth,
	promptLogin,
	disposeAuth,
	detectProject,
	watchProjectConfig,
	disposeProject,
	requireAuth,
} from './core';
import { registerReadonlyDocumentProvider } from './core/readonlyDocument';
import { registerAgentExplorer } from './features/agentExplorer';
import { registerDataExplorer } from './features/dataExplorer';
import { registerDeploymentExplorer } from './features/deploymentExplorer';
import { registerDevServerCommands } from './features/devServer';
import { registerWorkbenchCommands } from './features/workbench';
import { registerChatParticipant, registerCliTool } from './features/chat';
import { registerCodeLens } from './features/codeLens';

const outputChannel = vscode.window.createOutputChannel('Agentuity');

function log(message: string): void {
	outputChannel.appendLine(`[${new Date().toISOString()}] ${message}`);
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
	log('Extension activating...');

	watchProjectConfig(context);
	registerReadonlyDocumentProvider(context);

	const project = await detectProject();
	log(`Project: ${project ? project.projectId : 'none'}`);

	const authStatus = await checkAuth();
	log(`Auth: ${authStatus.state}${authStatus.user ? ` (${authStatus.user.email})` : ''}`);

	if (authStatus.state === 'cli-missing' || authStatus.state === 'unauthenticated') {
		void promptLogin();
	}

	registerAuthCommands(context);
	registerAiCommands(context);
	registerSetupCommands(context);
	registerDeployCommand(context);

	const walkthroughShown = context.globalState.get('agentuity.walkthroughShown', false);
	if (!walkthroughShown) {
		await context.globalState.update('agentuity.walkthroughShown', true);
		void vscode.commands.executeCommand(
			'workbench.action.openWalkthrough',
			'agentuity.agentuity#gettingStarted',
			false
		);
	}

	const agentProvider = registerAgentExplorer(context);
	const dataProvider = registerDataExplorer(context);
	const deploymentProvider = registerDeploymentExplorer(context);

	registerRefreshCommands(context, {
		agents: agentProvider,
		data: dataProvider,
		deployments: deploymentProvider,
	});

	context.subscriptions.push({
		dispose: () => {
			agentProvider.dispose();
			dataProvider.dispose();
			deploymentProvider.dispose();
		},
	});

	registerDevServerCommands(context);
	registerWorkbenchCommands(context);
	registerChatParticipant(context);
	registerCliTool(context);
	registerCodeLens(context);

	log('Extension activated');
}

function registerAuthCommands(context: vscode.ExtensionContext): void {
	context.subscriptions.push(
		vscode.commands.registerCommand('agentuity.login', () => {
			const terminal = vscode.window.createTerminal('Agentuity Login');
			terminal.sendText('agentuity auth login');
			terminal.show();

			vscode.window
				.showInformationMessage(
					'Complete login in the terminal, then refresh the extension.',
					'Refresh'
				)
				.then((action) => {
					if (action === 'Refresh') {
						void checkAuth();
					}
				});
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('agentuity.logout', async () => {
			const cli = getCliClient();
			const result = await cli.exec(['auth', 'logout']);

			if (result.success) {
				vscode.window.showInformationMessage('Logged out of Agentuity');
				await checkAuth();
			} else {
				vscode.window.showErrorMessage(`Logout failed: ${result.error}`);
			}
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('agentuity.whoami', async () => {
			const cli = getCliClient();
			const result = await cli.whoami();

			if (result.success && result.data) {
				const user = result.data;
				vscode.window.showInformationMessage(
					`Logged in as: ${user.name || user.email} (${user.email})`
				);
			} else {
				vscode.window.showWarningMessage('Not logged in to Agentuity');
			}
		})
	);
}

function registerAiCommands(context: vscode.ExtensionContext): void {
	context.subscriptions.push(
		vscode.commands.registerCommand('agentuity.getAiCapabilities', async () => {
			if (!(await requireAuth())) {
				return undefined;
			}

			const cli = getCliClient();
			const result = await cli.getAiCapabilities();

			if (result.success) {
				return result.data;
			} else {
				vscode.window.showErrorMessage(`Failed to get capabilities: ${result.error}`);
				return undefined;
			}
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('agentuity.getAiSchema', async () => {
			if (!(await requireAuth())) {
				return undefined;
			}

			const cli = getCliClient();
			const result = await cli.getAiSchema();

			if (result.success) {
				return result.data;
			} else {
				vscode.window.showErrorMessage(`Failed to get schema: ${result.error}`);
				return undefined;
			}
		})
	);
}

function registerSetupCommands(context: vscode.ExtensionContext): void {
	context.subscriptions.push(
		vscode.commands.registerCommand('agentuity.installCli', () => {
			void vscode.env.openExternal(
				vscode.Uri.parse('https://agentuity.dev/Introduction/getting-started')
			);
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('agentuity.createProject', () => {
			const terminal = vscode.window.createTerminal('Agentuity');
			terminal.sendText('agentuity project new');
			terminal.show();
		})
	);
}

function registerDeployCommand(context: vscode.ExtensionContext): void {
	context.subscriptions.push(
		vscode.commands.registerCommand('agentuity.deploy', async () => {
			if (!(await requireAuth())) {
				return;
			}

			const answer = await vscode.window.showWarningMessage(
				'Deploy to Agentuity Cloud?',
				{ modal: true },
				'Deploy'
			);

			if (answer !== 'Deploy') {
				return;
			}

			const terminal = vscode.window.createTerminal('Agentuity Deploy');
			terminal.sendText('agentuity cloud deploy');
			terminal.show();
		})
	);
}

function registerRefreshCommands(
	context: vscode.ExtensionContext,
	providers: {
		agents: ReturnType<typeof registerAgentExplorer>;
		data: ReturnType<typeof registerDataExplorer>;
		deployments: ReturnType<typeof registerDeploymentExplorer>;
	}
): void {
	context.subscriptions.push(
		vscode.commands.registerCommand('agentuity.refresh', async () => {
			await checkAuth();
			await detectProject();
			providers.agents.forceRefresh();
			providers.data.refresh();
			providers.deployments.forceRefresh();
			vscode.window.showInformationMessage('Agentuity refreshed');
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('agentuity.agents.refresh', () => {
			void providers.agents.forceRefresh();
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('agentuity.deployments.refresh', () => {
			void providers.deployments.forceRefresh();
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('agentuity.data.refresh', () => {
			providers.data.refresh();
		})
	);
}

export function deactivate(): void {
	disposeCliClient();
	disposeAuth();
	disposeProject();
	outputChannel.dispose();
}
