import * as vscode from 'vscode';
import { spawn, exec, type ChildProcess } from 'child_process';
import { getCurrentProject } from '../../core/project';
import { getCliClient } from '../../core/cliClient';

export type DevServerState = 'stopped' | 'starting' | 'running' | 'error';

export class DevServerManager {
	private process: ChildProcess | undefined;
	private state: DevServerState = 'stopped';
	private outputChannel: vscode.OutputChannel;
	private statusBarItem: vscode.StatusBarItem;
	private startupTimeoutId: NodeJS.Timeout | undefined;
	private hasReceivedOutput = false;

	private _onStateChanged = new vscode.EventEmitter<DevServerState>();
	readonly onStateChanged = this._onStateChanged.event;

	constructor() {
		this.outputChannel = vscode.window.createOutputChannel('Agentuity Dev Server');
		this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
		this.updateStatusBar();
	}

	private setState(state: DevServerState): void {
		this.state = state;
		this.updateStatusBar();
		this._onStateChanged.fire(state);
	}

	private updateStatusBar(): void {
		switch (this.state) {
			case 'stopped':
				this.statusBarItem.text = '$(debug-stop) Agentuity: Stopped';
				this.statusBarItem.backgroundColor = undefined;
				this.statusBarItem.command = 'agentuity.dev.start';
				this.statusBarItem.tooltip = 'Click to start dev server';
				break;
			case 'starting':
				this.statusBarItem.text = '$(loading~spin) Agentuity: Starting...';
				this.statusBarItem.backgroundColor = new vscode.ThemeColor(
					'statusBarItem.warningBackground'
				);
				this.statusBarItem.command = undefined;
				this.statusBarItem.tooltip = 'Dev server is starting';
				break;
			case 'running':
				this.statusBarItem.text = '$(debug-start) Agentuity: Running';
				this.statusBarItem.backgroundColor = new vscode.ThemeColor(
					'statusBarItem.prominentBackground'
				);
				this.statusBarItem.command = 'agentuity.dev.stop';
				this.statusBarItem.tooltip = 'Click to stop dev server';
				break;
			case 'error':
				this.statusBarItem.text = '$(error) Agentuity: Error';
				this.statusBarItem.backgroundColor = new vscode.ThemeColor(
					'statusBarItem.errorBackground'
				);
				this.statusBarItem.command = 'agentuity.dev.showLogs';
				this.statusBarItem.tooltip = 'Click to view logs';
				break;
		}
		this.statusBarItem.show();
	}

	getState(): DevServerState {
		return this.state;
	}

	async start(): Promise<void> {
		if (this.state === 'running' || this.state === 'starting') {
			vscode.window.showWarningMessage('Dev server is already running');
			return;
		}

		const project = getCurrentProject();
		if (!project) {
			vscode.window.showErrorMessage('No Agentuity project found');
			return;
		}

		this.setState('starting');
		this.outputChannel.clear();
		this.outputChannel.show(true);
		this.hasReceivedOutput = false;

		const cli = getCliClient();
		const cliPath = cli.getCliPath();
		const env = cli.getCliEnv();

		try {
			this.process = spawn(cliPath, ['dev'], {
				cwd: project.rootPath,
				shell: true,
				env,
				// On Unix, create a new process group so we can kill the entire tree
				detached: process.platform !== 'win32',
			});

			this.process.stdout?.on('data', (data: Buffer) => {
				const text = data.toString();
				this.outputChannel.append(text);
				this.hasReceivedOutput = true;

				// Detect ready signals from the dev server
				if (text.includes('listening') || text.includes('started') || text.includes('ready')) {
					this.clearStartupTimeout();
					this.setState('running');
				}
			});

			this.process.stderr?.on('data', (data: Buffer) => {
				this.outputChannel.append(data.toString());
				this.hasReceivedOutput = true;
			});

			this.process.on('error', (err: Error) => {
				this.clearStartupTimeout();
				this.outputChannel.appendLine(`Error: ${err.message}`);
				this.setState('error');
				this.process = undefined;
			});

			this.process.on('close', (code: number | null) => {
				this.clearStartupTimeout();
				this.outputChannel.appendLine(`\nDev server exited with code ${code}`);
				if (this.state !== 'stopped') {
					this.setState(code === 0 ? 'stopped' : 'error');
				}
				this.process = undefined;
			});

			// Timeout: if no ready signal after 10s, check if we got any output
			this.startupTimeoutId = setTimeout(() => {
				if (this.state === 'starting') {
					if (this.hasReceivedOutput) {
						// Got output but no ready signal - assume running
						this.setState('running');
					} else {
						// No output at all - likely failed to start
						this.setState('error');
						void vscode.window
							.showErrorMessage(
								'Dev server failed to start. No output received.',
								'View Logs'
							)
							.then((action) => {
								if (action === 'View Logs') {
									this.showLogs();
								}
							});
					}
				}
			}, 10000);
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Unknown error';
			this.outputChannel.appendLine(`Failed to start: ${message}`);
			this.setState('error');
		}
	}

	private clearStartupTimeout(): void {
		if (this.startupTimeoutId) {
			clearTimeout(this.startupTimeoutId);
			this.startupTimeoutId = undefined;
		}
	}

	async stop(): Promise<void> {
		this.clearStartupTimeout();

		if (!this.process) {
			this.setState('stopped');
			return;
		}

		this.outputChannel.appendLine('\nStopping dev server...');
		this.setState('stopped');

		const pid = this.process.pid;
		if (pid) {
			// Kill the entire process tree, not just the shell
			await this.killProcessTree(pid);
		}

		this.process = undefined;
	}

	private async killProcessTree(pid: number): Promise<void> {
		return new Promise((resolve) => {
			if (process.platform === 'win32') {
				// Windows: use taskkill to kill process tree
				exec(`taskkill /pid ${pid} /T /F`, () => resolve());
			} else {
				// Unix: kill the process group (negative pid)
				try {
					process.kill(-pid, 'SIGTERM');
				} catch {
					// Process group might not exist, try killing just the pid
					try {
						process.kill(pid, 'SIGTERM');
					} catch {
						// Process already dead
					}
				}

				// Force kill after timeout
				setTimeout(() => {
					try {
						process.kill(-pid, 'SIGKILL');
					} catch {
						try {
							process.kill(pid, 'SIGKILL');
						} catch {
							// Already dead
						}
					}
					resolve();
				}, 2000);
			}
		});
	}

	async restart(): Promise<void> {
		await this.stop();
		await new Promise((resolve) => setTimeout(resolve, 1000));
		await this.start();
	}

	showLogs(): void {
		this.outputChannel.show();
	}

	dispose(): void {
		this.clearStartupTimeout();
		this.stop();
		this.outputChannel.dispose();
		this.statusBarItem.dispose();
		this._onStateChanged.dispose();
	}
}

let _devServerManager: DevServerManager | undefined;

export function getDevServerManager(): DevServerManager {
	if (!_devServerManager) {
		_devServerManager = new DevServerManager();
	}
	return _devServerManager;
}

export function disposeDevServerManager(): void {
	if (_devServerManager) {
		_devServerManager.dispose();
		_devServerManager = undefined;
	}
}
