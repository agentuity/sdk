import {
	getCliClient,
	type CliClient,
	type Agent,
	type Session,
	type Deployment,
	type DbInfo,
	type VectorSearchResult,
} from './cliClient';
import { getAuthStatus, checkAuth, type AuthStatus } from './auth';
import { getCurrentProject, hasProject, type AgentuityProject } from './project';
import { getDevServerManager, type DevServerState } from '../features/devServer';

export interface AgentuityStatus {
	auth: AuthStatus;
	project: AgentuityProject | undefined;
	devServer: DevServerState;
	isReady: boolean;
}

export interface ListAgentsResult {
	success: boolean;
	agents: Agent[];
	error?: string;
}

export interface ListSessionsResult {
	success: boolean;
	sessions: Session[];
	error?: string;
}

export interface ListDeploymentsResult {
	success: boolean;
	deployments: Deployment[];
	error?: string;
}

export interface ListDatabasesResult {
	success: boolean;
	databases: DbInfo[];
	error?: string;
}

export interface VectorSearchResultData {
	success: boolean;
	results: VectorSearchResult[];
	error?: string;
}

export class AgentuityService {
	private cli: CliClient;

	constructor() {
		this.cli = getCliClient();
	}

	getStatus(): AgentuityStatus {
		const auth = getAuthStatus();
		const project = getCurrentProject();
		const devServer = getDevServerManager().getState();

		return {
			auth,
			project,
			devServer,
			isReady: auth.state === 'authenticated' && project !== undefined,
		};
	}

	async refreshAuth(): Promise<AuthStatus> {
		return checkAuth();
	}

	hasProject(): boolean {
		return hasProject();
	}

	getProject(): AgentuityProject | undefined {
		return getCurrentProject();
	}

	isDevServerRunning(): boolean {
		return getDevServerManager().getState() === 'running';
	}

	async ensureDevServerRunning(): Promise<boolean> {
		const devServer = getDevServerManager();
		if (devServer.getState() === 'running') {
			return true;
		}

		await devServer.start();

		return new Promise((resolve) => {
			const timeout = setTimeout(() => {
				resolve(devServer.getState() === 'running');
			}, 5000);

			const disposable = devServer.onStateChanged((state) => {
				if (state === 'running') {
					clearTimeout(timeout);
					disposable.dispose();
					resolve(true);
				} else if (state === 'error' || state === 'stopped') {
					clearTimeout(timeout);
					disposable.dispose();
					resolve(false);
				}
			});
		});
	}

	async listAgents(): Promise<ListAgentsResult> {
		const result = await this.cli.listAgents();
		return {
			success: result.success,
			agents: result.data || [],
			error: result.error,
		};
	}

	async listSessions(count = 10): Promise<ListSessionsResult> {
		const result = await this.cli.listSessions({ count });
		return {
			success: result.success,
			sessions: result.data || [],
			error: result.error,
		};
	}

	async listDeployments(): Promise<ListDeploymentsResult> {
		const result = await this.cli.listDeployments();
		return {
			success: result.success,
			deployments: result.data || [],
			error: result.error,
		};
	}

	async listDatabases(): Promise<ListDatabasesResult> {
		const result = await this.cli.listDatabases();
		return {
			success: result.success,
			databases: result.data?.databases || [],
			error: result.error,
		};
	}

	async listKvNamespaces(): Promise<{ success: boolean; namespaces: string[]; error?: string }> {
		const result = await this.cli.listKvNamespaces();
		return {
			success: result.success,
			namespaces: result.data || [],
			error: result.error,
		};
	}

	async listKvKeys(
		namespace: string
	): Promise<{ success: boolean; keys: string[]; error?: string }> {
		const result = await this.cli.listKvKeys(namespace);
		return {
			success: result.success,
			keys: result.data?.keys || [],
			error: result.error,
		};
	}

	async vectorSearch(namespace: string, query: string): Promise<VectorSearchResultData> {
		const result = await this.cli.vectorSearch(namespace, query);
		return {
			success: result.success,
			results: result.data?.results || [],
			error: result.error,
		};
	}

async getSessionLogs(sessionId: string): Promise<{
	success: boolean;
	logs: Array<{ body: string; severity: string; timestamp: string }>;
	error?: string;
}> {
		const result = await this.cli.getSessionLogs(sessionId);
		return {
			success: result.success,
			logs: result.data || [],
			error: result.error,
		};
	}

	async getCliHelp(): Promise<string> {
		const result = await this.cli.getAiPrompt();
		return result.success && result.data ? result.data : '';
	}
}

let _service: AgentuityService | undefined;

export function getAgentuityService(): AgentuityService {
	if (!_service) {
		_service = new AgentuityService();
	}
	return _service;
}

export function disposeAgentuityService(): void {
	_service = undefined;
}
