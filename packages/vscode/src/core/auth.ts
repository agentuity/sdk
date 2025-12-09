import * as vscode from 'vscode';
import { getCliClient, type WhoamiResponse } from './cliClient';

export type AuthState = 'unknown' | 'authenticated' | 'unauthenticated' | 'cli-missing' | 'error';

export interface AuthStatus {
	state: AuthState;
	user?: WhoamiResponse;
	error?: string;
	cliVersion?: string;
}

let _authStatus: AuthStatus = { state: 'unknown' };
const _onAuthStatusChanged = new vscode.EventEmitter<AuthStatus>();
export const onAuthStatusChanged = _onAuthStatusChanged.event;

export function getAuthStatus(): AuthStatus {
	return _authStatus;
}

function setAuthStatus(status: AuthStatus): void {
	_authStatus = status;
	_onAuthStatusChanged.fire(status);
	void vscode.commands.executeCommand(
		'setContext',
		'agentuity.authenticated',
		status.state === 'authenticated'
	);
	void vscode.commands.executeCommand(
		'setContext',
		'agentuity.cliInstalled',
		status.state !== 'cli-missing'
	);
}

export async function checkAuth(): Promise<AuthStatus> {
	const cli = getCliClient();

	const versionResult = await cli.version();
	if (!versionResult.success) {
		if (versionResult.error?.includes('ENOENT') || versionResult.error?.includes('not found')) {
			const status: AuthStatus = { state: 'cli-missing', error: 'Agentuity CLI not found' };
			setAuthStatus(status);
			return status;
		}
		const status: AuthStatus = { state: 'error', error: versionResult.error };
		setAuthStatus(status);
		return status;
	}

	const cliVersion = typeof versionResult.data === 'string' ? versionResult.data : undefined;

	const whoamiResult = await cli.whoami();
	if (!whoamiResult.success) {
		if (
			whoamiResult.error?.toLowerCase().includes('unauthorized') ||
			whoamiResult.error?.toLowerCase().includes('not logged in') ||
			whoamiResult.error?.toLowerCase().includes('401')
		) {
			const status: AuthStatus = { state: 'unauthenticated', cliVersion };
			setAuthStatus(status);
			return status;
		}
		const status: AuthStatus = { state: 'error', error: whoamiResult.error, cliVersion };
		setAuthStatus(status);
		return status;
	}

	const status: AuthStatus = {
		state: 'authenticated',
		user: whoamiResult.data,
		cliVersion,
	};
	setAuthStatus(status);
	return status;
}

export async function promptLogin(): Promise<void> {
	const status = getAuthStatus();

	if (status.state === 'cli-missing') {
		const action = await vscode.window.showErrorMessage(
			'Agentuity CLI not found. Please install it first.',
			'View Install Instructions',
			'Copy Install Command'
		);

		if (action === 'View Install Instructions') {
			void vscode.env.openExternal(vscode.Uri.parse('https://agentuity.com/docs/cli'));
		} else if (action === 'Copy Install Command') {
			await vscode.env.clipboard.writeText('bun install -g @agentuity/cli');
			vscode.window.showInformationMessage('Install command copied to clipboard');
		}
		return;
	}

	if (status.state === 'unauthenticated') {
		const action = await vscode.window.showWarningMessage(
			'You are not logged in to Agentuity.',
			'Login via Terminal'
		);

		if (action === 'Login via Terminal') {
			const terminal = vscode.window.createTerminal('Agentuity Login');
			terminal.sendText('agentuity auth login');
			terminal.show();
		}
	}
}

export async function requireAuth(): Promise<boolean> {
	let status = getAuthStatus();

	// If auth state is unknown, check it first
	if (status.state === 'unknown') {
		status = await checkAuth();
	}

	if (status.state !== 'authenticated') {
		void promptLogin();
		return false;
	}
	return true;
}

export function disposeAuth(): void {
	_onAuthStatusChanged.dispose();
}
