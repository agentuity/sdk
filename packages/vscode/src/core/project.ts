import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as jsonc from 'jsonc-parser';

export interface AgentuityProject {
	projectId: string;
	orgId: string;
	region?: string;
	rootPath: string;
}

let _currentProject: AgentuityProject | undefined;
const _onProjectChanged = new vscode.EventEmitter<AgentuityProject | undefined>();
export const onProjectChanged = _onProjectChanged.event;

export function getCurrentProject(): AgentuityProject | undefined {
	return _currentProject;
}

export function hasProject(): boolean {
	return _currentProject !== undefined;
}

function setProject(project: AgentuityProject | undefined): void {
	_currentProject = project;
	_onProjectChanged.fire(project);
	void vscode.commands.executeCommand('setContext', 'agentuity.hasProject', project !== undefined);
}

export async function detectProject(): Promise<AgentuityProject | undefined> {
	const workspaceFolders = vscode.workspace.workspaceFolders;

	if (!workspaceFolders || workspaceFolders.length === 0) {
		setProject(undefined);
		return undefined;
	}

	for (const folder of workspaceFolders) {
		const configPath = path.join(folder.uri.fsPath, 'agentuity.json');

		if (fs.existsSync(configPath)) {
			try {
				const content = fs.readFileSync(configPath, 'utf-8');
				const config = jsonc.parse(content) as Record<string, unknown>;

				const project: AgentuityProject = {
					projectId: config.projectId as string,
					orgId: config.orgId as string,
					region: config.region as string | undefined,
					rootPath: folder.uri.fsPath,
				};

				setProject(project);
				return project;
			} catch {
				// Invalid JSON, continue to next folder
			}
		}
	}

	setProject(undefined);
	return undefined;
}

export function requireProject(): boolean {
	if (!hasProject()) {
		vscode.window
			.showWarningMessage(
				'No Agentuity project found. Open a folder containing agentuity.json.',
				'Learn More'
			)
			.then((action) => {
				if (action === 'Learn More') {
					void vscode.env.openExternal(
						vscode.Uri.parse('https://agentuity.com/docs/getting-started')
					);
				}
			});
		return false;
	}
	return true;
}

export function watchProjectConfig(context: vscode.ExtensionContext): void {
	const watcher = vscode.workspace.createFileSystemWatcher('**/agentuity.json');

	watcher.onDidCreate(() => void detectProject());
	watcher.onDidDelete(() => void detectProject());
	watcher.onDidChange(() => void detectProject());

	context.subscriptions.push(watcher);
}

export function disposeProject(): void {
	_currentProject = undefined;
	_onProjectChanged.dispose();
}
