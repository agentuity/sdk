import * as vscode from 'vscode';

export class AgentCodeLensProvider implements vscode.CodeLensProvider {
	private _onDidChangeCodeLenses = new vscode.EventEmitter<void>();
	readonly onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;

	// Match both: createAgent('name', { and createAgent({
	private createAgentRegex = /createAgent\s*\(/g;

	refresh(): void {
		this._onDidChangeCodeLenses.fire();
	}

	provideCodeLenses(
		document: vscode.TextDocument,
		_token: vscode.CancellationToken
	): vscode.CodeLens[] | Thenable<vscode.CodeLens[]> {
		const codeLenses: vscode.CodeLens[] = [];
		const text = document.getText();

		let match: RegExpExecArray | null;
		this.createAgentRegex.lastIndex = 0;

		while ((match = this.createAgentRegex.exec(text)) !== null) {
			const position = document.positionAt(match.index);
			const range = new vscode.Range(position, position);

			const agentInfo = this.extractAgentInfo(document, match.index);

			codeLenses.push(
				new vscode.CodeLens(range, {
					title: '$(play) Open in Workbench',
					command: 'agentuity.codeLens.openInWorkbench',
					arguments: [agentInfo],
					tooltip: 'Open this agent in the Agentuity Workbench (requires dev server running)',
				})
			);

			codeLenses.push(
				new vscode.CodeLens(range, {
					title: '$(pulse) View Sessions',
					command: 'agentuity.codeLens.viewSessions',
					arguments: [agentInfo],
					tooltip: 'View sessions for this agent',
				})
			);
		}

		return codeLenses;
	}

	private extractAgentInfo(document: vscode.TextDocument, startIndex: number): AgentCodeLensInfo {
		const text = document.getText();
		const afterCreateAgent = text.substring(startIndex);

		let name: string | undefined;
		let identifier: string | undefined;

		// Try to match createAgent('identifier', { pattern (first arg is the identifier)
		const firstArgMatch = afterCreateAgent.match(/createAgent\s*\(\s*['"`]([^'"`]+)['"`]/);
		if (firstArgMatch) {
			identifier = firstArgMatch[1];
			name = firstArgMatch[1];
		}

		// Also check for name property in the config object
		const nameMatch = afterCreateAgent.match(/name\s*:\s*['"`]([^'"`]+)['"`]/);
		if (nameMatch) {
			name = nameMatch[1];
		}

		// Check for explicit identifier property (overrides first arg)
		const identifierMatch = afterCreateAgent.match(/identifier\s*:\s*['"`]([^'"`]+)['"`]/);
		if (identifierMatch) {
			identifier = identifierMatch[1];
		}

		// Fallback: derive identifier from file path
		if (!identifier) {
			const relativePath = vscode.workspace.asRelativePath(document.uri);
			const pathParts = relativePath.split('/');
			const agentsIndex = pathParts.indexOf('agents');
			if (agentsIndex !== -1 && agentsIndex < pathParts.length - 1) {
				const agentPathParts = pathParts.slice(agentsIndex + 1);
				const lastPart = agentPathParts[agentPathParts.length - 1];
				if (lastPart === 'agent.ts' || lastPart === 'index.ts') {
					agentPathParts.pop();
				} else {
					agentPathParts[agentPathParts.length - 1] = lastPart.replace(/\.(ts|js)$/, '');
				}
				if (agentPathParts.length > 0) {
					identifier = agentPathParts.join('/');
				}
			}
		}

		return {
			name,
			identifier,
			filePath: document.uri.fsPath,
		};
	}

	dispose(): void {
		this._onDidChangeCodeLenses.dispose();
	}
}

export interface AgentCodeLensInfo {
	name?: string;
	identifier?: string;
	filePath: string;
}
