import * as vscode from 'vscode';
import { getCurrentProject } from '../../core/project';

const WORKBENCH_BASE_URL = 'https://app-v1.agentuity.com';

export function registerWorkbenchCommands(context: vscode.ExtensionContext): void {
	context.subscriptions.push(
		vscode.commands.registerCommand('agentuity.workbench.open', async () => {
			const project = getCurrentProject();

			let url = WORKBENCH_BASE_URL;
			if (project) {
				url = `${WORKBENCH_BASE_URL}/projects/${project.projectId}`;
			}

			await vscode.env.openExternal(vscode.Uri.parse(url));
		})
	);
}
