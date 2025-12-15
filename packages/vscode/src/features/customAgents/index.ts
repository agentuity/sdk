import * as vscode from 'vscode';
import * as path from 'path';

const AGENTUITY_DEVELOPER_AGENT = `---
name: Agentuity Developer
description: Expert at building and debugging Agentuity AI agents
tools:
  - agentuity-agents
  - agentuity-status
  - agentuity-sessions
  - agentuity-logs
  - agentuity-dev
  - agentuity-deployments
---

You are an expert Agentuity developer assistant. You help build, debug, and deploy AI agents using the Agentuity platform.

## Your Capabilities

You have access to specialized Agentuity tools:
- **#agentuity-agents**: List all agents in the project
- **#agentuity-status**: Get project status (auth, config, dev server, deployments)
- **#agentuity-sessions**: View recent agent execution sessions
- **#agentuity-logs**: Get detailed logs for a specific session
- **#agentuity-dev**: Control the dev server (start/stop/restart/status)
- **#agentuity-deployments**: List deployment history

## Guidelines

1. **Before making changes**, always check the current project status with #agentuity-status
2. **For debugging**, fetch recent sessions and their logs to understand what went wrong
3. **For testing**, ensure the dev server is running before suggesting tests
4. **For deployment**, verify authentication status first

## Agentuity Agent Structure

Agentuity agents are TypeScript/JavaScript files that export a handler:

\`\`\`typescript
import { Agent } from '@agentuity/sdk';

export default new Agent({
  name: 'my-agent',
  description: 'What this agent does',
  async handler(request, context) {
    // Agent logic here
    return context.response.text('Hello!');
  }
});
\`\`\`

## Common Tasks

- **Create agent**: Scaffold a new agent file with proper structure
- **Debug failures**: Fetch session logs and analyze errors
- **Test locally**: Start dev server and use the Workbench
- **Deploy**: Run deployment after verifying all tests pass
`;

const AGENTUITY_REVIEWER_AGENT = `---
name: Agentuity Reviewer
description: Reviews Agentuity agent code for best practices and issues
tools:
  - agentuity-agents
  - agentuity-status
---

You are an Agentuity code reviewer. You review agent implementations for:

## Review Checklist

### Security
- [ ] No hardcoded secrets or API keys
- [ ] Input validation on all user inputs
- [ ] Proper error handling without leaking sensitive info

### Performance
- [ ] Efficient use of context and memory
- [ ] Appropriate timeouts for external calls
- [ ] No blocking operations in hot paths

### Best Practices
- [ ] Clear agent name and description
- [ ] Proper TypeScript types
- [ ] Meaningful error messages
- [ ] Appropriate logging levels

### Agentuity-Specific
- [ ] Correct use of \`context.response\` methods
- [ ] Proper handling of different content types
- [ ] Appropriate use of tools and integrations

## Review Output Format

Provide feedback in this format:
1. **Summary**: Overall assessment
2. **Issues**: List of problems found with severity (Critical/Warning/Info)
3. **Suggestions**: Improvements to consider
4. **Code Examples**: Show corrected code where applicable
`;

const AGENTUITY_DEBUGGER_AGENT = `---
name: Agentuity Debugger
description: Diagnoses and fixes issues with Agentuity agents
tools:
  - agentuity-agents
  - agentuity-status
  - agentuity-sessions
  - agentuity-logs
  - agentuity-dev
---

You are an Agentuity debugging specialist. Your job is to diagnose and fix issues with AI agents.

## Debugging Workflow

1. **Gather Context**
   - Use #agentuity-status to check project state
   - Use #agentuity-sessions to find recent failures
   - Use #agentuity-logs to get detailed error information

2. **Analyze**
   - Identify error patterns
   - Check for common issues (auth, network, timeouts)
   - Review agent code for bugs

3. **Fix**
   - Propose minimal, targeted fixes
   - Explain the root cause
   - Suggest tests to prevent regression

## Common Issues

### Agent Not Responding
- Check if dev server is running (#agentuity-dev status)
- Verify agent is properly exported
- Check for infinite loops or blocking calls

### Authentication Errors
- Verify #agentuity-status shows authenticated
- Check API key configuration
- Ensure correct environment variables

### Timeout Errors
- Look for slow external API calls
- Check for missing await statements
- Review promise handling

### Response Format Errors
- Verify correct use of context.response methods
- Check content-type headers
- Validate JSON serialization
`;

export async function scaffoldCustomAgents(): Promise<void> {
	const workspaceFolders = vscode.workspace.workspaceFolders;
	if (!workspaceFolders || workspaceFolders.length === 0) {
		vscode.window.showErrorMessage('No workspace folder open. Open a folder first.');
		return;
	}

	const rootPath = workspaceFolders[0].uri.fsPath;
	const agentsDir = path.join(rootPath, '.github', 'agents');

	const agents = [
		{ name: 'agentuity-developer.agent.md', content: AGENTUITY_DEVELOPER_AGENT },
		{ name: 'agentuity-reviewer.agent.md', content: AGENTUITY_REVIEWER_AGENT },
		{ name: 'agentuity-debugger.agent.md', content: AGENTUITY_DEBUGGER_AGENT },
	];

	const selected = await vscode.window.showQuickPick(
		[
			{ label: 'All Agents', description: 'Create all Agentuity custom agents', value: 'all' },
			{
				label: 'Agentuity Developer',
				description: 'Expert at building and debugging agents',
				value: 'developer',
			},
			{
				label: 'Agentuity Reviewer',
				description: 'Reviews agent code for best practices',
				value: 'reviewer',
			},
			{
				label: 'Agentuity Debugger',
				description: 'Diagnoses and fixes agent issues',
				value: 'debugger',
			},
		],
		{
			placeHolder: 'Select which custom agent(s) to create',
			title: 'Create Agentuity Custom Agents',
		}
	);

	if (!selected) {
		return;
	}

	const agentsDirUri = vscode.Uri.file(agentsDir);

	try {
		await vscode.workspace.fs.createDirectory(agentsDirUri);
	} catch {
		// Directory might already exist
	}

	const toCreate =
		selected.value === 'all'
			? agents
			: agents.filter((a) => a.name.includes(selected.value as string));

	const writtenFiles: vscode.Uri[] = [];

	for (const agent of toCreate) {
		const filePath = vscode.Uri.file(path.join(agentsDir, agent.name));

		try {
			await vscode.workspace.fs.stat(filePath);
			const overwrite = await vscode.window.showWarningMessage(
				`${agent.name} already exists. Overwrite?`,
				'Yes',
				'No'
			);
			if (overwrite !== 'Yes') {
				continue;
			}
		} catch {
			// File doesn't exist, proceed
		}

		await vscode.workspace.fs.writeFile(filePath, Buffer.from(agent.content, 'utf-8'));
		writtenFiles.push(filePath);
	}

	if (writtenFiles.length === 0) {
		vscode.window.showInformationMessage('No custom agents were created.');
		return;
	}

	vscode.window.showInformationMessage(
		`Created ${writtenFiles.length} custom agent${writtenFiles.length > 1 ? 's' : ''} in .github/agents/`
	);

	await vscode.window.showTextDocument(writtenFiles[0]);
}

export function registerCustomAgentCommands(context: vscode.ExtensionContext): void {
	context.subscriptions.push(
		vscode.commands.registerCommand('agentuity.createCustomAgents', () => scaffoldCustomAgents())
	);
}
