import * as vscode from 'vscode';
import { getDevServerManager, disposeDevServerManager } from './devServerManager';
import { requireProject } from '../../core/project';
import { requireAuth } from '../../core/auth';

export function registerDevServerCommands(context: vscode.ExtensionContext): void {
	const manager = getDevServerManager();

	void vscode.commands.executeCommand(
		'setContext',
		'agentuity.devServerRunning',
		manager.getState() === 'running'
	);

	manager.onStateChanged((state) => {
		void vscode.commands.executeCommand('setContext', 'agentuity.devServerRunning', state === 'running');
	});

	context.subscriptions.push(
		vscode.commands.registerCommand('agentuity.dev.start', async () => {
			if (!(await requireAuth()) || !requireProject()) {
				return;
			}
			await manager.start();
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('agentuity.dev.stop', async () => {
			await manager.stop();
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('agentuity.dev.restart', async () => {
			if (!(await requireAuth()) || !requireProject()) {
				return;
			}
			await manager.restart();
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('agentuity.dev.showLogs', () => {
			manager.showLogs();
		})
	);

	context.subscriptions.push({ dispose: () => disposeDevServerManager() });
}

export { getDevServerManager, type DevServerState } from './devServerManager';
