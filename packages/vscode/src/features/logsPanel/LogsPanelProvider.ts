import * as vscode from 'vscode';
import { getCliClient, type SessionListOptions } from '../../core/cliClient';

export interface SessionFilter {
	count?: number;
	success?: boolean;
	devmode?: boolean;
	trigger?: 'api' | 'cron' | 'webhook';
	env?: string;
	agentIdentifier?: string;
	deploymentId?: string;
}

export class LogsPanelProvider implements vscode.WebviewViewProvider {
	public static readonly viewType = 'agentuity.sessionLogsPanel';

	private _view?: vscode.WebviewView;
	private _filter: SessionFilter = { count: 20 };

	constructor(private readonly _extensionUri: vscode.Uri) {}

	public resolveWebviewView(
		webviewView: vscode.WebviewView,
		_context: vscode.WebviewViewResolveContext,
		_token: vscode.CancellationToken
	): void {
		this._view = webviewView;

		webviewView.webview.options = {
			enableScripts: true,
			localResourceRoots: [this._extensionUri],
		};

		webviewView.webview.html = this._getHtmlForWebview();

		webviewView.webview.onDidReceiveMessage(async (message) => {
			switch (message.type) {
				case 'selectSession':
					await this._loadSessionLogs(message.sessionId);
					break;
				case 'viewDetails':
					await this._showSessionDetails(message.sessionId);
					break;
				case 'refresh':
					await this.refresh();
					break;
				case 'updateFilter':
					// Replace filter entirely (don't merge) so undefined values clear old ones
					this._filter = {
						count: message.filter.count ?? 20,
						success: message.filter.success,
						devmode: message.filter.devmode,
						trigger: message.filter.trigger,
						env: message.filter.env,
						deploymentId: message.filter.deploymentId,
						agentIdentifier: message.filter.agentIdentifier,
					};
					await this.refresh();
					break;
				case 'clearFilters':
					this._filter = { count: 20 };
					await this.refresh();
					break;
			}
		});

		this.refresh();
	}

	public setFilter(filter: SessionFilter): void {
		this._filter = { ...this._filter, ...filter };
		this.refresh();
	}

	public clearFilter(): void {
		this._filter = { count: 20 };
		this.refresh();
	}

	public async refresh(): Promise<void> {
		if (!this._view) return;

		// Clean filter - remove undefined values before sending to CLI
		const cleanFilter: SessionListOptions = { count: this._filter.count ?? 20 };
		if (this._filter.success !== undefined) cleanFilter.success = this._filter.success;
		if (this._filter.devmode !== undefined) cleanFilter.devmode = this._filter.devmode;
		if (this._filter.trigger) cleanFilter.trigger = this._filter.trigger;
		if (this._filter.env) cleanFilter.env = this._filter.env;
		if (this._filter.deploymentId) cleanFilter.deploymentId = this._filter.deploymentId;
		if (this._filter.agentIdentifier) cleanFilter.agentIdentifier = this._filter.agentIdentifier;

		const cli = getCliClient();
		const result = await cli.listSessions(cleanFilter);

		// Always send message, even if empty or failed
		this._view.webview.postMessage({
			type: 'sessions',
			sessions: result.success ? (result.data ?? []) : [],
			filter: this._filter,
			error: result.success ? undefined : result.error,
		});
	}

	private async _loadSessionLogs(sessionId: string): Promise<void> {
		if (!this._view) return;

		const cli = getCliClient();
		const result = await cli.getSessionLogs(sessionId);

		if (result.success && result.data) {
			this._view.webview.postMessage({
				type: 'logs',
				sessionId,
				logs: result.data,
			});
		}
	}

	private async _showSessionDetails(sessionId: string): Promise<void> {
		const cli = getCliClient();
		const result = await cli.getSession(sessionId);

		if (result.success && result.data) {
			const content = JSON.stringify(result.data, null, 2);
			const doc = await vscode.workspace.openTextDocument({
				content,
				language: 'json',
			});
			await vscode.window.showTextDocument(doc, { preview: true });
		} else {
			vscode.window.showErrorMessage(`Failed to get session details: ${result.error}`);
		}
	}

	private _getHtmlForWebview(): string {
		return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<style>
		* { box-sizing: border-box; margin: 0; padding: 0; }
		body { 
			font-family: var(--vscode-font-family);
			font-size: var(--vscode-font-size);
			color: var(--vscode-foreground);
			background: var(--vscode-panel-background);
			height: 100vh;
			display: flex;
			flex-direction: column;
		}
		.toolbar {
			display: flex;
			gap: 6px;
			padding: 8px;
			border-bottom: 1px solid var(--vscode-panel-border);
			background: var(--vscode-editor-background);
			flex-wrap: wrap;
			align-items: center;
		}
		.toolbar select, .toolbar input, .toolbar button {
			background: var(--vscode-dropdown-background);
			color: var(--vscode-dropdown-foreground);
			border: 1px solid var(--vscode-dropdown-border);
			padding: 3px 6px;
			border-radius: 2px;
			font-size: 11px;
		}
		.toolbar input {
			width: 120px;
		}
		.toolbar input::placeholder {
			color: var(--vscode-input-placeholderForeground);
		}
		.toolbar button {
			cursor: pointer;
		}
		.toolbar button:hover {
			background: var(--vscode-button-hoverBackground);
		}
		.toolbar-group {
			display: flex;
			gap: 4px;
			align-items: center;
		}
		.toolbar-spacer {
			flex: 1;
		}
		.filter-info {
			font-size: 10px;
			opacity: 0.7;
			max-width: 200px;
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
		}
		.container {
			display: flex;
			flex: 1;
			overflow: hidden;
		}
		.sessions-list {
			width: 280px;
			min-width: 200px;
			border-right: 1px solid var(--vscode-panel-border);
			overflow-y: auto;
			background: var(--vscode-sideBar-background);
		}
		.session-item {
			padding: 8px 12px;
			cursor: pointer;
			border-bottom: 1px solid var(--vscode-panel-border);
			display: flex;
			align-items: center;
			gap: 8px;
		}
		.session-item:hover {
			background: var(--vscode-list-hoverBackground);
		}
		.session-item.selected {
			background: var(--vscode-list-activeSelectionBackground);
			color: var(--vscode-list-activeSelectionForeground);
		}
		.session-icon { font-size: 14px; }
		.session-icon.success { color: var(--vscode-testing-iconPassed); }
		.session-icon.failed { color: var(--vscode-testing-iconFailed); }
		.session-info { flex: 1; min-width: 0; }
		.session-id { font-family: var(--vscode-editor-font-family); font-size: 12px; }
		.session-meta { font-size: 11px; opacity: 0.7; }
		.session-actions {
			display: flex;
			gap: 4px;
			opacity: 0;
		}
		.session-item:hover .session-actions {
			opacity: 1;
		}
		.session-actions button {
			background: transparent;
			border: none;
			color: var(--vscode-foreground);
			cursor: pointer;
			padding: 2px 4px;
			font-size: 12px;
			opacity: 0.7;
		}
		.session-actions button:hover {
			opacity: 1;
			background: var(--vscode-toolbar-hoverBackground);
		}
		.logs-viewer {
			flex: 1;
			overflow-y: auto;
			padding: 8px;
			font-family: var(--vscode-editor-font-family);
			font-size: 12px;
			background: var(--vscode-editor-background);
		}
		.log-line {
			padding: 2px 0;
			white-space: pre-wrap;
			word-break: break-all;
		}
		.log-timestamp { color: var(--vscode-descriptionForeground); }
		.log-severity { font-weight: bold; margin: 0 8px; }
		.log-severity.INFO { color: var(--vscode-terminal-ansiBlue); }
		.log-severity.DEBUG { color: var(--vscode-terminal-ansiCyan); }
		.log-severity.WARN { color: var(--vscode-terminal-ansiYellow); }
		.log-severity.ERROR { color: var(--vscode-terminal-ansiRed); }
		.empty-state {
			display: flex;
			align-items: center;
			justify-content: center;
			height: 100%;
			color: var(--vscode-descriptionForeground);
		}
	</style>
</head>
<body>
	<div class="toolbar">
		<div class="toolbar-group">
			<select id="countFilter" title="Number of sessions">
				<option value="20">20</option>
				<option value="50">50</option>
				<option value="100">100</option>
			</select>
			<select id="successFilter" title="Success status">
				<option value="">All</option>
				<option value="true">✓ Success</option>
				<option value="false">✗ Failed</option>
			</select>
			<select id="devmodeFilter" title="Environment mode">
				<option value="">All Modes</option>
				<option value="true">Dev</option>
				<option value="false">Production</option>
			</select>
			<select id="triggerFilter" title="Trigger type">
				<option value="">All Triggers</option>
				<option value="api">API</option>
				<option value="cron">Cron</option>
				<option value="webhook">Webhook</option>
			</select>
		</div>
		<div class="toolbar-group">
			<input type="text" id="envFilter" placeholder="Environment" title="Filter by environment name">
			<input type="text" id="deploymentFilter" placeholder="Deployment ID" title="Filter by deployment ID">
			<input type="text" id="agentFilter" placeholder="Agent ID" title="Filter by agent identifier">
		</div>
		<div class="toolbar-spacer"></div>
		<div class="toolbar-group">
			<button id="clearBtn" title="Clear all filters">Clear</button>
			<button id="refreshBtn" title="Refresh">↻</button>
		</div>
	</div>
	<div class="container">
		<div class="sessions-list" id="sessionsList">
			<div class="empty-state">Loading sessions...</div>
		</div>
		<div class="logs-viewer" id="logsViewer">
			<div class="empty-state">Select a session to view logs</div>
		</div>
	</div>
	<script>
		const vscode = acquireVsCodeApi();
		let selectedSessionId = null;
		let currentFilter = {};

		// Filter elements
		document.getElementById('countFilter').addEventListener('change', applyFilter);
		document.getElementById('successFilter').addEventListener('change', applyFilter);
		document.getElementById('devmodeFilter').addEventListener('change', applyFilter);
		document.getElementById('triggerFilter').addEventListener('change', applyFilter);
		document.getElementById('envFilter').addEventListener('blur', applyFilter);
		document.getElementById('envFilter').addEventListener('keydown', (e) => { if (e.key === 'Enter') applyFilter(); });
		document.getElementById('deploymentFilter').addEventListener('blur', applyFilter);
		document.getElementById('deploymentFilter').addEventListener('keydown', (e) => { if (e.key === 'Enter') applyFilter(); });
		document.getElementById('agentFilter').addEventListener('blur', applyFilter);
		document.getElementById('agentFilter').addEventListener('keydown', (e) => { if (e.key === 'Enter') applyFilter(); });
		
		document.getElementById('refreshBtn').addEventListener('click', () => {
			vscode.postMessage({ type: 'refresh' });
		});
		
		document.getElementById('clearBtn').addEventListener('click', () => {
			document.getElementById('countFilter').value = '20';
			document.getElementById('successFilter').value = '';
			document.getElementById('devmodeFilter').value = '';
			document.getElementById('triggerFilter').value = '';
			document.getElementById('envFilter').value = '';
			document.getElementById('deploymentFilter').value = '';
			document.getElementById('agentFilter').value = '';
			vscode.postMessage({ type: 'clearFilters' });
		});

		function applyFilter() {
			const filter = {
				count: parseInt(document.getElementById('countFilter').value),
				success: document.getElementById('successFilter').value === '' ? undefined : 
							document.getElementById('successFilter').value === 'true',
				devmode: document.getElementById('devmodeFilter').value === '' ? undefined :
							document.getElementById('devmodeFilter').value === 'true',
				trigger: document.getElementById('triggerFilter').value || undefined,
				env: document.getElementById('envFilter').value || undefined,
				deploymentId: document.getElementById('deploymentFilter').value || undefined,
				agentIdentifier: document.getElementById('agentFilter').value || undefined
			};
			document.getElementById('sessionsList').innerHTML = '<div class="empty-state">Loading...</div>';
			vscode.postMessage({ type: 'updateFilter', filter });
		}

		function formatRelativeTime(dateStr) {
			const date = new Date(dateStr);
			const now = new Date();
			const diff = now - date;
			const mins = Math.floor(diff / 60000);
			if (mins < 1) return 'just now';
			if (mins < 60) return mins + 'm ago';
			const hours = Math.floor(mins / 60);
			if (hours < 24) return hours + 'h ago';
			const days = Math.floor(hours / 24);
			return days + 'd ago';
		}

		function formatDuration(ns) {
			if (ns === null) return '-';
			const ms = ns / 1000000;
			if (ms < 1000) return ms.toFixed(0) + 'ms';
			return (ms / 1000).toFixed(2) + 's';
		}

		function renderSessions(sessions) {
			const list = document.getElementById('sessionsList');
			if (!sessions || sessions.length === 0) {
				list.innerHTML = '<div class="empty-state">No sessions found</div>';
				return;
			}
			list.innerHTML = sessions.map(s => \`
				<div class="session-item" data-id="\${s.id}">
					<span class="session-icon \${s.success ? 'success' : 'failed'}">\${s.success ? '✓' : '✗'}</span>
					<div class="session-info">
						<div class="session-id">\${s.id.substring(0, 8)}...</div>
						<div class="session-meta">\${formatRelativeTime(s.created_at)} · \${formatDuration(s.duration)} · \${s.trigger}</div>
					</div>
					<div class="session-actions">
						<button class="view-details-btn" data-id="\${s.id}" title="View session details">ⓘ</button>
					</div>
				</div>
			\`).join('');

			list.querySelectorAll('.session-item').forEach(item => {
				item.addEventListener('click', (e) => {
					if (e.target.classList.contains('view-details-btn')) return;
					list.querySelectorAll('.session-item').forEach(i => i.classList.remove('selected'));
					item.classList.add('selected');
					selectedSessionId = item.dataset.id;
					document.getElementById('logsViewer').innerHTML = '<div class="empty-state">Loading logs...</div>';
					vscode.postMessage({ type: 'selectSession', sessionId: item.dataset.id });
				});
			});

			list.querySelectorAll('.view-details-btn').forEach(btn => {
				btn.addEventListener('click', (e) => {
					e.stopPropagation();
					vscode.postMessage({ type: 'viewDetails', sessionId: btn.dataset.id });
				});
			});
		}

		function renderLogs(logs) {
			const viewer = document.getElementById('logsViewer');
			if (!logs || logs.length === 0) {
				viewer.innerHTML = '<div class="empty-state">No logs found</div>';
				return;
			}
			viewer.innerHTML = logs.map(log => {
				const time = new Date(log.timestamp).toLocaleTimeString();
				return \`<div class="log-line"><span class="log-timestamp">\${time}</span><span class="log-severity \${log.severity}">\${log.severity}</span>\${escapeHtml(log.body)}</div>\`;
			}).join('');
		}

		function escapeHtml(text) {
			const div = document.createElement('div');
			div.textContent = text;
			return div.innerHTML;
		}

		window.addEventListener('message', event => {
			const message = event.data;
			switch (message.type) {
				case 'sessions':
					renderSessions(message.sessions);
					if (message.filter) {
						currentFilter = message.filter;
						document.getElementById('countFilter').value = message.filter.count || 20;
						document.getElementById('successFilter').value = message.filter.success === undefined ? '' : String(message.filter.success);
						document.getElementById('devmodeFilter').value = message.filter.devmode === undefined ? '' : String(message.filter.devmode);
						document.getElementById('triggerFilter').value = message.filter.trigger || '';
						document.getElementById('envFilter').value = message.filter.env || '';
						document.getElementById('deploymentFilter').value = message.filter.deploymentId || '';
						document.getElementById('agentFilter').value = message.filter.agentIdentifier || '';
					}
					break;
				case 'logs':
					renderLogs(message.logs);
					break;
			}
		});
	</script>
</body>
</html>`;
	}
}
