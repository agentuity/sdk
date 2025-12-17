import * as vscode from 'vscode';
import { getCliClient } from '../../core/cliClient';
import { getAuthStatus } from '../../core/auth';
import { hasProject, getCurrentProject } from '../../core/project';
import { getDevServerManager } from '../devServer';

// Minimal CLI reference as fallback when dynamic help is unavailable
const CLI_REFERENCE_FALLBACK = `
# Agentuity CLI Quick Reference

## Key Commands
- \`agentuity auth login\` - Login to Agentuity
- \`agentuity dev\` - Start the development server
- \`agentuity cloud deploy\` - Deploy to Agentuity Cloud
- \`agentuity cloud agent list\` - List deployed agents
- \`agentuity cloud session list\` - List sessions

## JSON Output
Add \`--json\` before the command: \`agentuity --json cloud agent list\`

Use \`/help\` for complete documentation.
`;

interface SlashCommand {
	name: string;
	description: string;
}

const SLASH_COMMANDS: SlashCommand[] = [
	{ name: 'help', description: 'Show CLI reference and getting started guide' },
	{ name: 'agents', description: 'List agents in this project' },
	{ name: 'deploy', description: 'Deploy to Agentuity Cloud' },
	{ name: 'dev', description: 'Start or stop the dev server' },
	{ name: 'sessions', description: 'Show recent sessions' },
	{ name: 'status', description: 'Show project and auth status' },
	{ name: 'kv', description: 'List KV namespaces or keys in a namespace' },
	{ name: 'db', description: 'List databases with connection info' },
	{ name: 'vector', description: 'Search vectors in a namespace' },
	{ name: 'deployments', description: 'List deployments with details' },
	{ name: 'logs', description: 'View logs for a session' },
];

export function registerChatParticipant(context: vscode.ExtensionContext): void {
	if (!vscode.chat?.createChatParticipant) {
		return;
	}

	try {
		const participant = vscode.chat.createChatParticipant(
			'agentuity.assistant',
			handleChatRequest
		);

		participant.iconPath = vscode.Uri.joinPath(context.extensionUri, 'resources', 'icon.svg');

		context.subscriptions.push(participant);
	} catch {
		// Chat API not available in this version of VSCode
	}
}

async function handleChatRequest(
	request: vscode.ChatRequest,
	context: vscode.ChatContext,
	stream: vscode.ChatResponseStream,
	token: vscode.CancellationToken
): Promise<vscode.ChatResult> {
	const authStatus = getAuthStatus();

	if (authStatus.state === 'cli-missing') {
		stream.markdown('## Agentuity CLI Not Found\n\n');
		stream.markdown('The Agentuity CLI is required. Install it with:\n\n');
		stream.markdown('```bash\nbun install -g @agentuity/cli\n```\n\n');
		stream.markdown(
			'Or visit the [Getting Started Guide](https://agentuity.dev/Introduction/getting-started)'
		);
		stream.button({
			title: 'Install CLI',
			command: 'agentuity.installCli',
		});
		return { metadata: { command: 'error' } };
	}

	if (authStatus.state === 'unauthenticated') {
		stream.markdown('## Login Required\n\n');
		stream.markdown('Please login to Agentuity to continue:\n\n');
		stream.markdown('```bash\nagentuity auth login\n```\n');
		stream.button({
			title: 'Login',
			command: 'agentuity.login',
		});
		return { metadata: { command: 'error' } };
	}

	const command = request.command;
	if (command) {
		return handleSlashCommand(command, request.prompt, stream, token);
	}

	return handleNaturalLanguage(request, context, stream, token);
}

async function handleSlashCommand(
	command: string,
	args: string,
	stream: vscode.ChatResponseStream,
	_token: vscode.CancellationToken
): Promise<vscode.ChatResult> {
	switch (command) {
		case 'help':
			return handleHelp(stream);
		case 'agents':
			return handleListAgents(stream);
		case 'deploy':
			return handleDeploy(stream);
		case 'dev':
			return handleDevServer(args, stream);
		case 'sessions':
			return handleSessions(stream);
		case 'status':
			return handleStatus(stream);
		case 'kv':
			return handleKv(args, stream);
		case 'db':
			return handleDb(stream);
		case 'vector':
			return handleVector(args, stream);
		case 'deployments':
			return handleDeployments(stream);
		case 'logs':
			return handleLogs(args, stream);
		default:
			stream.markdown(`Unknown command: /${command}\n\nAvailable commands:\n`);
			for (const cmd of SLASH_COMMANDS) {
				stream.markdown(`- \`/${cmd.name}\` - ${cmd.description}\n`);
			}
			return { metadata: { command: 'unknown' } };
	}
}

async function handleNaturalLanguage(
	request: vscode.ChatRequest,
	_context: vscode.ChatContext,
	stream: vscode.ChatResponseStream,
	token: vscode.CancellationToken
): Promise<vscode.ChatResult> {
	const prompt = request.prompt.toLowerCase();

	if (prompt.includes('agent') && (prompt.includes('list') || prompt.includes('show'))) {
		return handleListAgents(stream);
	}

	if (prompt.includes('deploy') && !prompt.includes('deployment')) {
		return handleDeploy(stream);
	}

	if (
		prompt.includes('session') &&
		(prompt.includes('list') || prompt.includes('show') || prompt.includes('recent'))
	) {
		return handleSessions(stream);
	}

	if (prompt.includes('dev') && (prompt.includes('start') || prompt.includes('stop'))) {
		const action = prompt.includes('stop') ? 'stop' : 'start';
		return handleDevServer(action, stream);
	}

	if (prompt.includes('status') || prompt.includes('whoami')) {
		return handleStatus(stream);
	}

	if (
		prompt.includes('help') ||
		prompt.includes('command') ||
		prompt.includes('how do i') ||
		prompt.includes('what can')
	) {
		return handleHelp(stream);
	}

	// KV storage patterns
	if (
		prompt.includes('kv') ||
		prompt.includes('key value') ||
		prompt.includes('key-value') ||
		(prompt.includes('storage') && prompt.includes('key'))
	) {
		return handleKv('', stream);
	}

	// Database patterns
	if (
		prompt.includes('database') ||
		prompt.includes('db') ||
		prompt.includes('connection string') ||
		prompt.includes('postgres')
	) {
		return handleDb(stream);
	}

	// Vector search patterns
	if (
		prompt.includes('vector') ||
		prompt.includes('embedding') ||
		prompt.includes('semantic search')
	) {
		return handleVector('', stream);
	}

	// Deployment patterns
	if (prompt.includes('deployment') || (prompt.includes('list') && prompt.includes('deploy'))) {
		return handleDeployments(stream);
	}

	// Logs patterns
	if (
		prompt.includes('log') &&
		(prompt.includes('session') || prompt.includes('view') || prompt.includes('show'))
	) {
		return handleLogs('', stream);
	}

	const models = await vscode.lm.selectChatModels({
		vendor: 'copilot',
		family: 'gpt-4o',
	});

	if (models.length === 0) {
		return handleFallback(request.prompt, stream);
	}

	const model = models[0];

	if (token.isCancellationRequested) {
		return { metadata: { command: 'cancelled' } };
	}

	const projectContext = await gatherProjectContext(token);

	const systemPrompt = `You are the Agentuity AI assistant, helping developers build and manage AI agents using the Agentuity platform.

## Available Slash Commands
- /help - Show complete CLI documentation
- /agents - List agents in this project
- /deploy - Deploy to Agentuity Cloud
- /dev - Start or stop the dev server
- /sessions - Show recent sessions
- /status - Show project and auth status

${CLI_REFERENCE_FALLBACK}

## Current Project Context
${projectContext}

## Your Role
- Help users understand and use the Agentuity CLI and SDK
- Answer questions about building agents with Agentuity
- Suggest appropriate CLI commands for tasks
- Explain error messages and troubleshoot issues
- Suggest slash commands when they would be helpful

## Guidelines
- Be concise and helpful
- Format CLI commands as code blocks
- For detailed CLI help, suggest the user type \`/help\`
- For destructive operations (delete, deploy), always confirm with the user first
- Link to https://agentuity.dev for documentation`;

	const messages: vscode.LanguageModelChatMessage[] = [
		vscode.LanguageModelChatMessage.User(systemPrompt),
		vscode.LanguageModelChatMessage.User(request.prompt),
	];

	try {
		const response = await model.sendRequest(messages, {}, token);

		for await (const chunk of response.text) {
			if (token.isCancellationRequested) {
				return { metadata: { command: 'cancelled' } };
			}
			stream.markdown(chunk);
		}
	} catch (err) {
		if (token.isCancellationRequested) {
			return { metadata: { command: 'cancelled' } };
		}
		if (err instanceof vscode.LanguageModelError) {
			stream.markdown(`Error: ${err.message}\n\n`);
			stream.markdown('Try asking a simpler question or use a slash command like `/help`.');
		}
		return { metadata: { command: 'error' } };
	}

	return { metadata: { command: 'chat' } };
}

async function gatherProjectContext(token?: vscode.CancellationToken): Promise<string> {
	const lines: string[] = [];

	const authStatus = getAuthStatus();
	lines.push(`- Authenticated: ${authStatus.state === 'authenticated' ? 'Yes' : 'No'}`);
	if (authStatus.user) {
		lines.push(`- User: ${authStatus.user.firstName} ${authStatus.user.lastName}`);
	}

	if (token?.isCancellationRequested) {
		return lines.join('\n');
	}

	const project = getCurrentProject();
	if (project) {
		lines.push(`- Project ID: ${project.projectId}`);
		lines.push(`- Org ID: ${project.orgId}`);
		if (project.region) {
			lines.push(`- Region: ${project.region}`);
		}
	} else {
		lines.push('- No Agentuity project detected in workspace');
	}

	const devServer = getDevServerManager();
	lines.push(`- Dev Server: ${devServer.getState()}`);

	if (hasProject() && !token?.isCancellationRequested) {
		try {
			const cli = getCliClient();
			const agentsResult = await cli.listAgents();
			if (token?.isCancellationRequested) {
				return lines.join('\n');
			}
			if (agentsResult.success && agentsResult.data) {
				lines.push(`- Agents in project: ${agentsResult.data.length}`);
				for (const agent of agentsResult.data.slice(0, 5)) {
					lines.push(`  - ${agent.name} (${agent.identifier || agent.id})`);
				}
			}
		} catch {
			// Ignore errors gathering context
		}
	}

	return lines.join('\n');
}

async function handleHelp(stream: vscode.ChatResponseStream): Promise<vscode.ChatResult> {
	stream.progress('Loading documentation from CLI...');

	const cli = getCliClient();
	const result = await cli.getAiPrompt();

	if (result.success && result.data) {
		stream.markdown(result.data);
	} else {
		stream.markdown('*Could not load dynamic help from CLI. Showing quick reference:*\n');
		stream.markdown(CLI_REFERENCE_FALLBACK);
	}

	stream.markdown('\n\n## Quick Actions\n\n');
	stream.button({ title: 'Start Dev Server', command: 'agentuity.dev.start' });
	stream.button({ title: 'Deploy', command: 'agentuity.deploy' });
	stream.button({ title: 'Open Workbench', command: 'agentuity.workbench.open' });

	return { metadata: { command: 'help' } };
}

async function handleListAgents(stream: vscode.ChatResponseStream): Promise<vscode.ChatResult> {
	if (!hasProject()) {
		stream.markdown('## No Project Found\n\n');
		stream.markdown('Open a folder containing `agentuity.json` to see your agents.\n\n');
		stream.button({ title: 'Create Project', command: 'agentuity.createProject' });
		return { metadata: { command: 'agents' } };
	}

	stream.progress('Fetching agents...');

	const cli = getCliClient();
	const result = await cli.listAgents();

	if (!result.success) {
		stream.markdown(`Failed to fetch agents: ${result.error}`);
		return { metadata: { command: 'agents' } };
	}

	const agents = result.data || [];

	if (agents.length === 0) {
		stream.markdown('## No Agents Found\n\n');
		stream.markdown('Create a new agent by adding a file in `src/agent/`.\n\n');
		stream.markdown(
			'Check the [documentation](https://agentuity.dev/Introduction/getting-started) for examples.'
		);
		return { metadata: { command: 'agents' } };
	}

	stream.markdown(`## Agents (${agents.length})\n\n`);

	for (const agent of agents) {
		const identifier = agent.identifier || agent.metadata?.identifier || agent.id;
		stream.markdown(`### ${agent.name}\n`);
		if (agent.description) {
			stream.markdown(`${agent.description}\n\n`);
		}
		stream.markdown(`\`${identifier}\`\n\n`);
	}

	stream.markdown('---\n\n');
	stream.button({ title: 'View in Explorer', command: 'agentuity.agents.refresh' });

	return { metadata: { command: 'agents' } };
}

async function handleDeploy(stream: vscode.ChatResponseStream): Promise<vscode.ChatResult> {
	if (!hasProject()) {
		stream.markdown('## No Project Found\n\n');
		stream.markdown('You need an Agentuity project to deploy.\n\n');
		stream.button({ title: 'Create Project', command: 'agentuity.createProject' });
		return { metadata: { command: 'deploy' } };
	}

	stream.markdown('## Deploy to Agentuity Cloud\n\n');
	stream.markdown('This will deploy your agents to Agentuity Cloud.\n\n');
	stream.markdown('```bash\nagentuity cloud deploy\n```\n\n');
	stream.button({ title: 'Deploy Now', command: 'agentuity.deploy' });

	return { metadata: { command: 'deploy' } };
}

async function handleDevServer(
	args: string,
	stream: vscode.ChatResponseStream
): Promise<vscode.ChatResult> {
	const devServer = getDevServerManager();
	const currentState = devServer.getState();

	if (args.includes('stop')) {
		if (currentState === 'stopped') {
			stream.markdown('Dev server is not running.');
		} else {
			stream.markdown('Stopping dev server...\n\n');
			stream.button({ title: 'Stop Dev Server', command: 'agentuity.dev.stop' });
		}
		return { metadata: { command: 'dev' } };
	}

	if (args.includes('start') || args.trim() === '') {
		if (currentState === 'running') {
			stream.markdown('Dev server is already running.\n\n');
			stream.button({ title: 'Show Logs', command: 'agentuity.dev.showLogs' });
			stream.button({ title: 'Restart', command: 'agentuity.dev.restart' });
		} else {
			stream.markdown('## Start Dev Server\n\n');
			stream.markdown('This will start the Agentuity dev server for local testing.\n\n');
			stream.markdown('```bash\nagentuity dev\n```\n\n');
			stream.button({ title: 'Start Dev Server', command: 'agentuity.dev.start' });
		}
		return { metadata: { command: 'dev' } };
	}

	stream.markdown(`## Dev Server Status: ${currentState}\n\n`);
	if (currentState === 'running') {
		stream.button({ title: 'Stop', command: 'agentuity.dev.stop' });
		stream.button({ title: 'Restart', command: 'agentuity.dev.restart' });
		stream.button({ title: 'Show Logs', command: 'agentuity.dev.showLogs' });
	} else {
		stream.button({ title: 'Start', command: 'agentuity.dev.start' });
	}

	return { metadata: { command: 'dev' } };
}

async function handleSessions(stream: vscode.ChatResponseStream): Promise<vscode.ChatResult> {
	if (!hasProject()) {
		stream.markdown('## No Project Found\n\n');
		stream.markdown('Open an Agentuity project to view sessions.\n\n');
		return { metadata: { command: 'sessions' } };
	}

	stream.progress('Fetching recent sessions...');

	const cli = getCliClient();
	const result = await cli.listSessions({ count: 10 });

	if (!result.success) {
		stream.markdown(`Failed to fetch sessions: ${result.error}`);
		return { metadata: { command: 'sessions' } };
	}

	const sessions = result.data || [];

	if (sessions.length === 0) {
		stream.markdown('## No Sessions Found\n\n');
		stream.markdown('Run your agents to see session data here.\n\n');
		stream.button({ title: 'Start Dev Server', command: 'agentuity.dev.start' });
		return { metadata: { command: 'sessions' } };
	}

	stream.markdown(`## Recent Sessions (${sessions.length})\n\n`);
	stream.markdown('| Status | ID | Time | Duration | Trigger |\n');
	stream.markdown('|--------|-----|------|----------|--------|\n');

	for (const session of sessions) {
		const status = session.success ? '✓' : '✗';
		const shortId = session.id.substring(0, 8);
		const time = new Date(session.created_at).toLocaleString();
		const duration = session.duration ? `${(session.duration / 1_000_000).toFixed(0)}ms` : '-';
		stream.markdown(`| ${status} | ${shortId} | ${time} | ${duration} | ${session.trigger} |\n`);
	}

	stream.markdown('\n');

	return { metadata: { command: 'sessions' } };
}

async function handleStatus(stream: vscode.ChatResponseStream): Promise<vscode.ChatResult> {
	const authStatus = getAuthStatus();
	const project = getCurrentProject();
	const devServer = getDevServerManager();
	const cli = getCliClient();

	stream.markdown('## Agentuity Status\n\n');

	stream.markdown('### Authentication\n');
	if (authStatus.state === 'authenticated' && authStatus.user) {
		stream.markdown(`✓ Logged in as **${authStatus.user.firstName} ${authStatus.user.lastName}**\n\n`);
	} else {
		stream.markdown(`✗ Not logged in\n\n`);
		stream.button({ title: 'Login', command: 'agentuity.login' });
	}

	// Show current CLI profile
	const profileResult = await cli.getCurrentProfile();
	if (profileResult.success && profileResult.data) {
		stream.markdown(`### CLI Profile\n`);
		stream.markdown(`Active: \`${profileResult.data}\`\n\n`);
	}

	stream.markdown('### Project\n');
	if (project) {
		stream.markdown(`✓ Project: \`${project.projectId}\`\n`);
		stream.markdown(`  Org: \`${project.orgId}\`\n`);
		if (project.region) {
			stream.markdown(`  Region: ${project.region}\n`);
		}
		stream.markdown('\n');
	} else {
		stream.markdown('✗ No project detected\n\n');
		stream.button({ title: 'Create Project', command: 'agentuity.createProject' });
	}

	stream.markdown('### Dev Server\n');
	const state = devServer.getState();
	const stateIcon = state === 'running' ? '✓' : state === 'error' ? '✗' : '○';
	stream.markdown(`${stateIcon} ${state}\n\n`);

	if (state === 'running') {
		stream.button({ title: 'Stop', command: 'agentuity.dev.stop' });
		stream.button({ title: 'Show Logs', command: 'agentuity.dev.showLogs' });
	} else if (project) {
		stream.button({ title: 'Start', command: 'agentuity.dev.start' });
	}

	return { metadata: { command: 'status' } };
}

async function handleKv(
	args: string,
	stream: vscode.ChatResponseStream
): Promise<vscode.ChatResult> {
	if (!hasProject()) {
		stream.markdown('## No Project Found\n\n');
		stream.markdown('Open an Agentuity project to view KV data.\n\n');
		return { metadata: { command: 'kv' } };
	}

	const cli = getCliClient();
	const namespace = args.trim();

	if (namespace) {
		stream.progress(`Fetching keys in ${namespace}...`);
		const result = await cli.listKvKeys(namespace);

		if (!result.success) {
			stream.markdown(`Failed to fetch keys: ${result.error}`);
			return { metadata: { command: 'kv' } };
		}

		const keys = result.data?.keys || [];

		if (keys.length === 0) {
			stream.markdown(`## KV Namespace: ${namespace}\n\n`);
			stream.markdown('No keys found in this namespace.\n');
			return { metadata: { command: 'kv' } };
		}

		stream.markdown(`## KV Namespace: ${namespace} (${keys.length} keys)\n\n`);
		for (const key of keys.slice(0, 20)) {
			stream.markdown(`- \`${key}\`\n`);
		}
		if (keys.length > 20) {
			stream.markdown(`\n*...and ${keys.length - 20} more*\n`);
		}
	} else {
		stream.progress('Fetching KV namespaces...');
		const result = await cli.listKvNamespaces();

		if (!result.success) {
			stream.markdown(`Failed to fetch namespaces: ${result.error}`);
			return { metadata: { command: 'kv' } };
		}

		const namespaces = result.data || [];

		if (namespaces.length === 0) {
			stream.markdown('## KV Namespaces\n\n');
			stream.markdown('No KV namespaces found.\n');
			return { metadata: { command: 'kv' } };
		}

		stream.markdown(`## KV Namespaces (${namespaces.length})\n\n`);
		for (const ns of namespaces) {
			stream.markdown(`- \`${ns}\` - use \`/kv ${ns}\` to list keys\n`);
		}
	}

	return { metadata: { command: 'kv' } };
}

async function handleDb(stream: vscode.ChatResponseStream): Promise<vscode.ChatResult> {
	if (!hasProject()) {
		stream.markdown('## No Project Found\n\n');
		stream.markdown('Open an Agentuity project to view databases.\n\n');
		return { metadata: { command: 'db' } };
	}

	stream.progress('Fetching databases...');

	const cli = getCliClient();
	const result = await cli.listDatabases();

	if (!result.success) {
		stream.markdown(`Failed to fetch databases: ${result.error}`);
		return { metadata: { command: 'db' } };
	}

	const databases = result.data?.databases || [];

	if (databases.length === 0) {
		stream.markdown('## Databases\n\n');
		stream.markdown('No databases found.\n');
		return { metadata: { command: 'db' } };
	}

	stream.markdown(`## Databases (${databases.length})\n\n`);
	for (const db of databases) {
		stream.markdown(`### ${db.name}\n`);
		stream.markdown(`\`\`\`\n${db.url}\n\`\`\`\n\n`);
	}

	stream.button({ title: 'View in Data Explorer', command: 'agentuity.data.refresh' });

	return { metadata: { command: 'db' } };
}

async function handleVector(
	args: string,
	stream: vscode.ChatResponseStream
): Promise<vscode.ChatResult> {
	if (!hasProject()) {
		stream.markdown('## No Project Found\n\n');
		stream.markdown('Open an Agentuity project to search vectors.\n\n');
		return { metadata: { command: 'vector' } };
	}

	const parts = args.trim().split(/\s+/);
	const namespace = parts[0];
	const query = parts.slice(1).join(' ');

	if (!namespace || !query) {
		stream.markdown('## Vector Search\n\n');
		stream.markdown('Usage: `/vector <namespace> <query>`\n\n');
		stream.markdown('Example: `/vector my-namespace what is machine learning?`\n');
		return { metadata: { command: 'vector' } };
	}

	stream.progress(`Searching vectors in ${namespace}...`);

	const cli = getCliClient();
	const result = await cli.vectorSearch(namespace, query);

	if (!result.success) {
		stream.markdown(`Failed to search vectors: ${result.error}`);
		return { metadata: { command: 'vector' } };
	}

	const results = result.data?.results || [];

	if (results.length === 0) {
		stream.markdown(`## Vector Search: "${query}"\n\n`);
		stream.markdown('No results found.\n');
		return { metadata: { command: 'vector' } };
	}

	stream.markdown(`## Vector Search: "${query}" (${results.length} results)\n\n`);
	for (const item of results.slice(0, 10)) {
		const similarity = (item.similarity * 100).toFixed(1);
		stream.markdown(`### ${item.key} (${similarity}% match)\n`);
		if (item.metadata) {
			stream.markdown(`\`\`\`json\n${JSON.stringify(item.metadata, null, 2)}\n\`\`\`\n\n`);
		}
	}

	return { metadata: { command: 'vector' } };
}

async function handleDeployments(stream: vscode.ChatResponseStream): Promise<vscode.ChatResult> {
	if (!hasProject()) {
		stream.markdown('## No Project Found\n\n');
		stream.markdown('Open an Agentuity project to view deployments.\n\n');
		return { metadata: { command: 'deployments' } };
	}

	stream.progress('Fetching deployments...');

	const cli = getCliClient();
	const result = await cli.listDeployments();

	if (!result.success) {
		stream.markdown(`Failed to fetch deployments: ${result.error}`);
		return { metadata: { command: 'deployments' } };
	}

	const deployments = result.data || [];

	if (deployments.length === 0) {
		stream.markdown('## Deployments\n\n');
		stream.markdown('No deployments found. Deploy your project to see deployments here.\n\n');
		stream.button({ title: 'Deploy Now', command: 'agentuity.deploy' });
		return { metadata: { command: 'deployments' } };
	}

	stream.markdown(`## Deployments (${deployments.length})\n\n`);
	stream.markdown('| Status | ID | Created | Tags |\n');
	stream.markdown('|--------|-----|---------|------|\n');

	for (const deployment of deployments.slice(0, 10)) {
		const status = deployment.active ? '✓ Active' : deployment.state || 'Inactive';
		const shortId = deployment.id.substring(0, 8);
		const created = new Date(deployment.createdAt).toLocaleDateString();
		const tags = deployment.tags?.join(', ') || '-';
		stream.markdown(`| ${status} | ${shortId} | ${created} | ${tags} |\n`);
	}

	if (deployments.length > 10) {
		stream.markdown(`\n*...and ${deployments.length - 10} more*\n`);
	}

	stream.markdown('\n');
	stream.button({
		title: 'View in Deployments Explorer',
		command: 'agentuity.deployments.refresh',
	});

	return { metadata: { command: 'deployments' } };
}

async function handleLogs(
	args: string,
	stream: vscode.ChatResponseStream
): Promise<vscode.ChatResult> {
	if (!hasProject()) {
		stream.markdown('## No Project Found\n\n');
		stream.markdown('Open an Agentuity project to view logs.\n\n');
		return { metadata: { command: 'logs' } };
	}

	const sessionId = args.trim();

	if (!sessionId) {
		stream.markdown('## Session Logs\n\n');
		stream.markdown('Usage: `/logs <session-id>`\n\n');
		stream.markdown('Get a session ID from `/sessions` first.\n\n');
		stream.button({
			title: 'View Sessions',
			command: 'workbench.action.chat.open',
			arguments: [{ query: '@agentuity /sessions' }],
		});
		return { metadata: { command: 'logs' } };
	}

	stream.progress(`Fetching logs for session ${sessionId.substring(0, 8)}...`);

	const cli = getCliClient();
	const result = await cli.getSessionLogs(sessionId);

	if (!result.success) {
		stream.markdown(`Failed to fetch logs: ${result.error}`);
		return { metadata: { command: 'logs' } };
	}

	const logs = result.data || [];

	if (logs.length === 0) {
		stream.markdown(`## Session Logs: ${sessionId.substring(0, 8)}...\n\n`);
		stream.markdown('No logs found for this session.\n');
		return { metadata: { command: 'logs' } };
	}

	stream.markdown(`## Session Logs (${logs.length} entries)\n\n`);
	stream.markdown('```\n');
	for (const log of logs.slice(0, 50)) {
		const time = new Date(log.timestamp).toLocaleTimeString();
		const severity = log.severity.padEnd(5);
		stream.markdown(`[${time}] ${severity} ${log.body}\n`);
	}
	stream.markdown('```\n');

	if (logs.length > 50) {
		stream.markdown(`\n*...and ${logs.length - 50} more entries*\n`);
	}

	return { metadata: { command: 'logs' } };
}

async function handleFallback(
	_prompt: string,
	stream: vscode.ChatResponseStream
): Promise<vscode.ChatResult> {
	stream.markdown("I can help you with your Agentuity project. Here's what I can do:\n\n");

	for (const cmd of SLASH_COMMANDS) {
		stream.markdown(`- \`/${cmd.name}\` - ${cmd.description}\n`);
	}

	stream.markdown('\nOr ask me questions about:\n');
	stream.markdown('- **Agents** - "List my agents", "What agents do I have?"\n');
	stream.markdown('- **Development** - "Start the dev server", "How do I test locally?"\n');
	stream.markdown('- **Deployment** - "Deploy my agents", "How do I deploy?"\n');
	stream.markdown('- **Sessions** - "Show recent sessions", "View session logs"\n');
	stream.markdown('- **CLI** - "What CLI commands are available?"\n\n');

	stream.markdown('Type `/help` for complete CLI documentation.\n\n');
	stream.button({
		title: 'Show Help',
		command: 'workbench.action.chat.open',
		arguments: [{ query: '@agentuity /help' }],
	});

	return { metadata: { command: 'fallback' } };
}
