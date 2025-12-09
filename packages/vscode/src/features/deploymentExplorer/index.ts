import * as vscode from 'vscode';
import { DeploymentTreeDataProvider, DeploymentTreeItem } from './deploymentTreeData';
import { onAuthStatusChanged } from '../../core/auth';
import { onProjectChanged } from '../../core/project';
import { getCliClient } from '../../core/cliClient';
import { openReadonlyDocument } from '../../core/readonlyDocument';

export function registerDeploymentExplorer(
	context: vscode.ExtensionContext
): DeploymentTreeDataProvider {
	const provider = new DeploymentTreeDataProvider();

	const treeView = vscode.window.createTreeView('agentuity.deployments', {
		treeDataProvider: provider,
		showCollapseAll: true,
	});

	treeView.onDidChangeSelection(async (e) => {
		if (e.selection.length === 0) return;
		const item = e.selection[0];

		if (item.itemType === 'deployment' && item.deploymentData) {
			await showDeploymentDetails(item.deploymentData.id);
		}
	});

	const authSub = onAuthStatusChanged(() => {
		provider.refresh();
	});

	const projectSub = onProjectChanged(() => {
		void provider.forceRefresh();
	});

	context.subscriptions.push(
		vscode.commands.registerCommand(
			'agentuity.deployment.viewLogs',
			async (item: DeploymentTreeItem) => {
				if (item?.deploymentData) {
					await viewDeploymentLogs(item.deploymentData.id);
				}
			}
		)
	);

	context.subscriptions.push(
		vscode.commands.registerCommand(
			'agentuity.deployment.showDetails',
			async (item: DeploymentTreeItem) => {
				if (item?.deploymentData) {
					await showDeploymentDetails(item.deploymentData.id);
				}
			}
		)
	);

	context.subscriptions.push(treeView, authSub, projectSub, { dispose: () => provider.dispose() });

	return provider;
}

async function showDeploymentDetails(deploymentId: string): Promise<void> {
	const cli = getCliClient();
	const result = await cli.getDeployment(deploymentId);

	if (result.success && result.data) {
		const content = JSON.stringify(result.data, null, 2);
		await openReadonlyDocument(content, 'json', `deployment-${deploymentId.substring(0, 8)}`);
	} else {
		vscode.window.showErrorMessage(`Failed to get deployment details: ${result.error}`);
	}
}

async function viewDeploymentLogs(deploymentId: string): Promise<void> {
	const cli = getCliClient();

	await vscode.window.withProgress(
		{
			location: vscode.ProgressLocation.Notification,
			title: 'Fetching deployment logs...',
			cancellable: false,
		},
		async () => {
			const result = await cli.getDeploymentLogs(deploymentId, 100);

			if (result.success && result.data) {
				if (result.data.length === 0) {
					vscode.window.showInformationMessage('No logs found for this deployment');
					return;
				}

				const logContent = result.data
					.map((log) => {
						const timestamp = new Date(log.timestamp).toLocaleString();
						return `[${timestamp}] [${log.severity}] ${log.body}`;
					})
					.join('\n');

				await openReadonlyDocument(logContent, 'log', `deployment-logs-${deploymentId.substring(0, 8)}`);
			} else {
				vscode.window.showErrorMessage(`Failed to fetch logs: ${result.error}`);
			}
		}
	);
}

export { DeploymentTreeDataProvider };
