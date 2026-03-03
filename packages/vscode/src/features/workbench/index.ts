import * as vscode from 'vscode';
import { getCurrentProject } from '../../core/project';
import { getAppUrl, getWorkbenchUrl } from '../../core/urls';

export function registerWorkbenchCommands(context: vscode.ExtensionContext): void {
	context.subscriptions.push(
		vscode.commands.registerCommand('agentuity.workbench.open', async () => {
			const project = getCurrentProject();

			let url = getAppUrl();
			if (project) {
				url = getWorkbenchUrl(project.projectId);
			}

			await vscode.env.openExternal(vscode.Uri.parse(url));
		})
	);
}
