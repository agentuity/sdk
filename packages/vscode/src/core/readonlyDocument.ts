import * as vscode from 'vscode';

const SCHEME = 'agentuity-readonly';

const contentMap = new Map<string, { content: string; language: string }>();
let counter = 0;

class ReadonlyDocumentProvider implements vscode.TextDocumentContentProvider {
	provideTextDocumentContent(uri: vscode.Uri): string {
		const data = contentMap.get(uri.path);
		return data?.content ?? '';
	}
}

let registered = false;

export function registerReadonlyDocumentProvider(context: vscode.ExtensionContext): void {
	if (registered) return;
	registered = true;

	context.subscriptions.push(
		vscode.workspace.registerTextDocumentContentProvider(SCHEME, new ReadonlyDocumentProvider())
	);

	// Clean up content when documents are closed
	context.subscriptions.push(
		vscode.workspace.onDidCloseTextDocument((doc) => {
			if (doc.uri.scheme === SCHEME) {
				contentMap.delete(doc.uri.path);
			}
		})
	);
}

export async function openReadonlyDocument(
	content: string,
	language: string,
	title?: string
): Promise<vscode.TextEditor> {
	const id = `${++counter}`;
	const name = title || `Agentuity-${id}`;
	const path = `/${name}.${getExtension(language)}`;

	contentMap.set(path, { content, language });

	const uri = vscode.Uri.parse(`${SCHEME}:${path}`);
	const doc = await vscode.workspace.openTextDocument(uri);

	return vscode.window.showTextDocument(doc, { preview: false });
}

function getExtension(language: string): string {
	const extensions: Record<string, string> = {
		json: 'json',
		javascript: 'js',
		typescript: 'ts',
		html: 'html',
		css: 'css',
		xml: 'xml',
		yaml: 'yaml',
		markdown: 'md',
		log: 'log',
		plaintext: 'txt',
		properties: 'env',
		ini: 'ini',
	};
	return extensions[language] || 'txt';
}
