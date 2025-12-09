import * as vscode from 'vscode';
import { LogsPanelProvider, type SessionFilter } from './LogsPanelProvider';

let logsPanelProvider: LogsPanelProvider | undefined;

export function registerLogsPanel(context: vscode.ExtensionContext): LogsPanelProvider {
	logsPanelProvider = new LogsPanelProvider(context.extensionUri);

	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(LogsPanelProvider.viewType, logsPanelProvider)
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('agentuity.sessionLogs.show', async () => {
			await vscode.commands.executeCommand('agentuity.sessionLogsPanel.focus');
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('agentuity.sessionLogs.refresh', () => {
			logsPanelProvider?.refresh();
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('agentuity.sessionLogs.filter', async () => {
			const options = [
				{ label: 'All Sessions', filter: {} },
				{ label: 'Success Only', filter: { success: true } },
				{ label: 'Failed Only', filter: { success: false } },
				{ label: 'API Trigger', filter: { trigger: 'api' as const } },
				{ label: 'Cron Trigger', filter: { trigger: 'cron' as const } },
				{ label: 'Webhook Trigger', filter: { trigger: 'webhook' as const } },
			];

			const selected = await vscode.window.showQuickPick(options, {
				placeHolder: 'Select a filter',
			});

			if (selected && logsPanelProvider) {
				logsPanelProvider.setFilter({ ...selected.filter, count: 50 });
			}
		})
	);

	return logsPanelProvider;
}

export function getLogsPanelProvider(): LogsPanelProvider | undefined {
	return logsPanelProvider;
}

export { LogsPanelProvider, type SessionFilter };
