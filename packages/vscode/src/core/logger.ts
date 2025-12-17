import * as vscode from 'vscode';

let _outputChannel: vscode.OutputChannel | undefined;

export function getOutputChannel(): vscode.OutputChannel {
	if (!_outputChannel) {
		_outputChannel = vscode.window.createOutputChannel('Agentuity');
	}
	return _outputChannel;
}

export function log(message: string): void {
	const channel = getOutputChannel();
	channel.appendLine(`[${new Date().toISOString()}] ${message}`);
}

export function showLogs(): void {
	getOutputChannel().show();
}

export function disposeLogger(): void {
	_outputChannel?.dispose();
	_outputChannel = undefined;
}
