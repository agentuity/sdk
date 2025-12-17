import * as vscode from 'vscode';
import { getCliClient } from '../../core/cliClient';
import { getAuthStatus } from '../../core/auth';
import { hasProject, getCurrentProject } from '../../core/project';
import { getDevServerManager } from '../devServer';

export interface GetAgentsInput {
	includeDetails?: boolean;
}

export class GetAgentsTool implements vscode.LanguageModelTool<GetAgentsInput> {
	async invoke(
		_options: vscode.LanguageModelToolInvocationOptions<GetAgentsInput>,
		_token: vscode.CancellationToken
	): Promise<vscode.LanguageModelToolResult> {
		if (!hasProject()) {
			throw new Error('No Agentuity project found in the current workspace.');
		}

		const cli = getCliClient();
		const result = await cli.listAgents();

		if (!result.success || !result.data) {
			throw new Error(`Failed to list agents: ${result.error || 'Unknown error'}`);
		}

		const agents = result.data;
		if (agents.length === 0) {
			return new vscode.LanguageModelToolResult([
				new vscode.LanguageModelTextPart('No agents found in this project.'),
			]);
		}

		const output = agents.map((agent) => ({
			name: agent.name,
			id: agent.id,
			identifier: agent.identifier,
			description: agent.description,
			sourceFile: agent.metadata?.filename,
		}));

		return new vscode.LanguageModelToolResult([
			new vscode.LanguageModelTextPart(JSON.stringify(output, null, 2)),
		]);
	}

	async prepareInvocation(
		_options: vscode.LanguageModelToolInvocationPrepareOptions<GetAgentsInput>,
		_token: vscode.CancellationToken
	): Promise<vscode.PreparedToolInvocation> {
		return {
			invocationMessage: 'Fetching Agentuity agents...',
		};
	}
}

export type GetProjectStatusInput = Record<string, never>;

export class GetProjectStatusTool implements vscode.LanguageModelTool<GetProjectStatusInput> {
	async invoke(
		_options: vscode.LanguageModelToolInvocationOptions<GetProjectStatusInput>,
		_token: vscode.CancellationToken
	): Promise<vscode.LanguageModelToolResult> {
		const status: Record<string, unknown> = {};

		const authStatus = getAuthStatus();
		status.authentication = {
			state: authStatus.state,
			user: authStatus.user
				? { name: `${authStatus.user.firstName} ${authStatus.user.lastName}` }
				: null,
		};

		const project = getCurrentProject();
		status.project = project
			? {
					projectId: project.projectId,
					orgId: project.orgId,
					region: project.region,
					rootPath: project.rootPath,
				}
			: null;

		const devServer = getDevServerManager();
		status.devServer = {
			state: devServer.getState(),
		};

		if (hasProject()) {
			const cli = getCliClient();

			const agentsResult = await cli.listAgents();
			status.agentCount = agentsResult.success ? agentsResult.data?.length || 0 : 0;

			const deploymentsResult = await cli.listDeployments();
			if (deploymentsResult.success && deploymentsResult.data) {
				const active = deploymentsResult.data.find((d) => d.active);
				status.activeDeployment = active
					? {
							id: active.id,
							createdAt: active.createdAt,
							tags: active.tags,
						}
					: null;
				status.totalDeployments = deploymentsResult.data.length;
			}
		}

		return new vscode.LanguageModelToolResult([
			new vscode.LanguageModelTextPart(JSON.stringify(status, null, 2)),
		]);
	}

	async prepareInvocation(
		_options: vscode.LanguageModelToolInvocationPrepareOptions<GetProjectStatusInput>,
		_token: vscode.CancellationToken
	): Promise<vscode.PreparedToolInvocation> {
		return {
			invocationMessage: 'Getting Agentuity project status...',
		};
	}
}

export interface GetSessionsInput {
	count?: number;
	agentName?: string;
}

export class GetSessionsTool implements vscode.LanguageModelTool<GetSessionsInput> {
	async invoke(
		options: vscode.LanguageModelToolInvocationOptions<GetSessionsInput>,
		_token: vscode.CancellationToken
	): Promise<vscode.LanguageModelToolResult> {
		if (!hasProject()) {
			throw new Error('No Agentuity project found in the current workspace.');
		}

		const cli = getCliClient();
		const count = options.input.count || 10;
		const result = await cli.listSessions({ count });

		if (!result.success || !result.data) {
			throw new Error(`Failed to list sessions: ${result.error || 'Unknown error'}`);
		}

		const sessions = result.data.map((session) => ({
			id: session.id,
			createdAt: session.created_at,
			success: session.success,
			duration: session.duration,
			trigger: session.trigger,
			env: session.env,
		}));

		return new vscode.LanguageModelToolResult([
			new vscode.LanguageModelTextPart(JSON.stringify(sessions, null, 2)),
		]);
	}

	async prepareInvocation(
		options: vscode.LanguageModelToolInvocationPrepareOptions<GetSessionsInput>,
		_token: vscode.CancellationToken
	): Promise<vscode.PreparedToolInvocation> {
		const count = options.input.count || 10;
		return {
			invocationMessage: `Fetching last ${count} sessions...`,
		};
	}
}

export interface GetSessionLogsInput {
	sessionId: string;
}

export class GetSessionLogsTool implements vscode.LanguageModelTool<GetSessionLogsInput> {
	async invoke(
		options: vscode.LanguageModelToolInvocationOptions<GetSessionLogsInput>,
		_token: vscode.CancellationToken
	): Promise<vscode.LanguageModelToolResult> {
		if (!hasProject()) {
			throw new Error('No Agentuity project found in the current workspace.');
		}

		const { sessionId } = options.input;
		if (!sessionId) {
			throw new Error('Session ID is required.');
		}

		const cli = getCliClient();
		const result = await cli.getSessionLogs(sessionId);

		if (!result.success || !result.data) {
			throw new Error(`Failed to get session logs: ${result.error || 'Unknown error'}`);
		}

		const logs = result.data.map((log) => ({
			timestamp: log.timestamp,
			severity: log.severity,
			message: log.body,
		}));

		return new vscode.LanguageModelToolResult([
			new vscode.LanguageModelTextPart(JSON.stringify(logs, null, 2)),
		]);
	}

	async prepareInvocation(
		options: vscode.LanguageModelToolInvocationPrepareOptions<GetSessionLogsInput>,
		_token: vscode.CancellationToken
	): Promise<vscode.PreparedToolInvocation> {
		return {
			invocationMessage: `Fetching logs for session ${options.input.sessionId?.substring(0, 8)}...`,
		};
	}
}

export interface ControlDevServerInput {
	action: 'start' | 'stop' | 'restart' | 'status';
}

export class ControlDevServerTool implements vscode.LanguageModelTool<ControlDevServerInput> {
	async invoke(
		options: vscode.LanguageModelToolInvocationOptions<ControlDevServerInput>,
		_token: vscode.CancellationToken
	): Promise<vscode.LanguageModelToolResult> {
		if (!hasProject()) {
			throw new Error('No Agentuity project found in the current workspace.');
		}

		const devServer = getDevServerManager();
		const { action } = options.input;

		switch (action) {
			case 'start':
				if (devServer.getState() === 'running') {
					return new vscode.LanguageModelToolResult([
						new vscode.LanguageModelTextPart('Dev server is already running.'),
					]);
				}
				await devServer.start();
				return new vscode.LanguageModelToolResult([
					new vscode.LanguageModelTextPart('Dev server started successfully.'),
				]);

			case 'stop':
				if (devServer.getState() === 'stopped') {
					return new vscode.LanguageModelToolResult([
						new vscode.LanguageModelTextPart('Dev server is not running.'),
					]);
				}
				await devServer.stop();
				return new vscode.LanguageModelToolResult([
					new vscode.LanguageModelTextPart('Dev server stopped.'),
				]);

			case 'restart':
				await devServer.restart();
				return new vscode.LanguageModelToolResult([
					new vscode.LanguageModelTextPart('Dev server restarted.'),
				]);

			case 'status':
				return new vscode.LanguageModelToolResult([
					new vscode.LanguageModelTextPart(
						JSON.stringify({ state: devServer.getState() }, null, 2)
					),
				]);

			default:
				throw new Error(
					`Unknown action: ${action}. Valid actions: start, stop, restart, status`
				);
		}
	}

	async prepareInvocation(
		options: vscode.LanguageModelToolInvocationPrepareOptions<ControlDevServerInput>,
		_token: vscode.CancellationToken
	): Promise<vscode.PreparedToolInvocation> {
		const { action } = options.input;

		if (action === 'start' || action === 'restart') {
			return {
				invocationMessage: `${action === 'start' ? 'Starting' : 'Restarting'} dev server...`,
				confirmationMessages: {
					title: `${action === 'start' ? 'Start' : 'Restart'} Dev Server`,
					message: new vscode.MarkdownString(
						`This will ${action} the Agentuity dev server for local testing.\n\nDo you want to continue?`
					),
				},
			};
		}

		return {
			invocationMessage:
				action === 'stop' ? 'Stopping dev server...' : 'Getting dev server status...',
		};
	}
}

export interface GetDeploymentsInput {
	limit?: number;
}

export class GetDeploymentsTool implements vscode.LanguageModelTool<GetDeploymentsInput> {
	async invoke(
		options: vscode.LanguageModelToolInvocationOptions<GetDeploymentsInput>,
		_token: vscode.CancellationToken
	): Promise<vscode.LanguageModelToolResult> {
		if (!hasProject()) {
			throw new Error('No Agentuity project found in the current workspace.');
		}

		const cli = getCliClient();
		const result = await cli.listDeployments();

		if (!result.success || !result.data) {
			throw new Error(`Failed to list deployments: ${result.error || 'Unknown error'}`);
		}

		const limit = options.input.limit || 10;
		const deployments = result.data.slice(0, limit).map((dep) => ({
			id: dep.id,
			active: dep.active,
			state: dep.state,
			createdAt: dep.createdAt,
			tags: dep.tags,
		}));

		return new vscode.LanguageModelToolResult([
			new vscode.LanguageModelTextPart(JSON.stringify(deployments, null, 2)),
		]);
	}

	async prepareInvocation(
		_options: vscode.LanguageModelToolInvocationPrepareOptions<GetDeploymentsInput>,
		_token: vscode.CancellationToken
	): Promise<vscode.PreparedToolInvocation> {
		return {
			invocationMessage: 'Fetching deployments...',
		};
	}
}

export interface DeployProjectInput {
	message?: string;
}

export class DeployProjectTool implements vscode.LanguageModelTool<DeployProjectInput> {
	async invoke(
		_options: vscode.LanguageModelToolInvocationOptions<DeployProjectInput>,
		_token: vscode.CancellationToken
	): Promise<vscode.LanguageModelToolResult> {
		if (!hasProject()) {
			throw new Error('No Agentuity project found in the current workspace.');
		}

		const authStatus = getAuthStatus();
		if (authStatus.state !== 'authenticated') {
			throw new Error('You must be logged in to deploy. Run "agentuity auth login" first.');
		}

		const terminal = vscode.window.createTerminal('Agentuity Deploy');
		terminal.sendText('agentuity cloud deploy');
		terminal.show();

		return new vscode.LanguageModelToolResult([
			new vscode.LanguageModelTextPart(
				'Deployment started in terminal. Check the terminal output for progress.'
			),
		]);
	}

	async prepareInvocation(
		_options: vscode.LanguageModelToolInvocationPrepareOptions<DeployProjectInput>,
		_token: vscode.CancellationToken
	): Promise<vscode.PreparedToolInvocation> {
		return {
			invocationMessage: 'Preparing deployment...',
			confirmationMessages: {
				title: 'Deploy to Agentuity Cloud',
				message: new vscode.MarkdownString(
					'This will deploy your Agentuity project to the cloud.\n\n**Warning**: This will make your agents publicly accessible.\n\nDo you want to continue?'
				),
			},
		};
	}
}

export interface GetHealthSummaryInput {
	sessionCount?: number;
}

export class GetHealthSummaryTool implements vscode.LanguageModelTool<GetHealthSummaryInput> {
	async invoke(
		options: vscode.LanguageModelToolInvocationOptions<GetHealthSummaryInput>,
		_token: vscode.CancellationToken
	): Promise<vscode.LanguageModelToolResult> {
		if (!hasProject()) {
			throw new Error('No Agentuity project found in the current workspace.');
		}

		const cli = getCliClient();
		const sessionCount = options.input.sessionCount || 20;

		const health: Record<string, unknown> = {
			timestamp: new Date().toISOString(),
		};

		const sessionsResult = await cli.listSessions({ count: sessionCount });
		if (sessionsResult.success && sessionsResult.data) {
			const sessions = sessionsResult.data;
			const successful = sessions.filter((s) => s.success).length;
			const failed = sessions.filter((s) => !s.success).length;

			health.sessions = {
				total: sessions.length,
				successful,
				failed,
				successRate:
					sessions.length > 0
						? ((successful / sessions.length) * 100).toFixed(1) + '%'
						: 'N/A',
				recentFailures: sessions
					.filter((s) => !s.success)
					.slice(0, 5)
					.map((s) => ({
						id: s.id,
						createdAt: s.created_at,
						trigger: s.trigger,
					})),
			};

			const durations = sessions.filter((s) => s.duration).map((s) => s.duration!);
			if (durations.length > 0) {
				const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
				health.performance = {
					avgDurationMs: (avgDuration / 1_000_000).toFixed(0),
					minDurationMs: (Math.min(...durations) / 1_000_000).toFixed(0),
					maxDurationMs: (Math.max(...durations) / 1_000_000).toFixed(0),
				};
			}
		}

		const deploymentsResult = await cli.listDeployments();
		if (deploymentsResult.success && deploymentsResult.data) {
			const deployments = deploymentsResult.data;
			const active = deployments.find((d) => d.active);

			health.deployment = {
				totalDeployments: deployments.length,
				activeDeployment: active
					? {
							id: active.id,
							createdAt: active.createdAt,
							tags: active.tags,
						}
					: null,
				lastDeployment: deployments[0]
					? {
							id: deployments[0].id,
							createdAt: deployments[0].createdAt,
							state: deployments[0].state,
						}
					: null,
			};
		}

		const devServer = getDevServerManager();
		health.devServer = {
			state: devServer.getState(),
		};

		return new vscode.LanguageModelToolResult([
			new vscode.LanguageModelTextPart(JSON.stringify(health, null, 2)),
		]);
	}

	async prepareInvocation(
		_options: vscode.LanguageModelToolInvocationPrepareOptions<GetHealthSummaryInput>,
		_token: vscode.CancellationToken
	): Promise<vscode.PreparedToolInvocation> {
		return {
			invocationMessage: 'Analyzing project health...',
		};
	}
}

export function registerAgentTools(context: vscode.ExtensionContext): void {
	if (!vscode.lm?.registerTool) {
		return;
	}

	try {
		context.subscriptions.push(
			vscode.lm.registerTool('agentuity_get_agents', new GetAgentsTool())
		);

		context.subscriptions.push(
			vscode.lm.registerTool('agentuity_get_project_status', new GetProjectStatusTool())
		);

		context.subscriptions.push(
			vscode.lm.registerTool('agentuity_get_sessions', new GetSessionsTool())
		);

		context.subscriptions.push(
			vscode.lm.registerTool('agentuity_get_session_logs', new GetSessionLogsTool())
		);

		context.subscriptions.push(
			vscode.lm.registerTool('agentuity_control_dev_server', new ControlDevServerTool())
		);

		context.subscriptions.push(
			vscode.lm.registerTool('agentuity_get_deployments', new GetDeploymentsTool())
		);

		context.subscriptions.push(
			vscode.lm.registerTool('agentuity_deploy_project', new DeployProjectTool())
		);

		context.subscriptions.push(
			vscode.lm.registerTool('agentuity_get_health_summary', new GetHealthSummaryTool())
		);
	} catch {
		// LM API not available
	}
}
