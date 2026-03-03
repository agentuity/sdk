import { createSubcommand } from '../../types.ts';
import type { CommandContext } from '../../types.ts';
import { getCommand } from '../../command-prefix.ts';
import { getExecutingAgent, getAgentDisplayName, KNOWN_AGENTS } from '../../agent-detection.ts';
import { getVersion } from '../../version.ts';
import * as tui from '../../tui.ts';

/**
 * Generate the introduction prompt for AI agents
 */
export function generateIntroPrompt(agent: string | undefined): string {
	const agentGreeting = agent ? `Hello ${getAgentDisplayName(agent)}! ` : 'Hello! ';

	const detectedAgents = KNOWN_AGENTS.map(([, name]) => getAgentDisplayName(name)).join(', ');

	return `${agentGreeting}Welcome to the Agentuity CLI (v${getVersion()}).

## What is Agentuity?

Agentuity is a cloud platform for building, deploying, and running AI agents with production-grade infrastructure. It provides:

- **Serverless Agent Runtime**: Deploy agents that scale automatically with zero cold starts
- **Built-in Services**: Key-value storage, vector databases, object storage, and PostgreSQL - all accessible via simple APIs
- **Agent-to-Agent Communication**: Agents can discover and communicate with each other seamlessly
- **Observability**: Full tracing, logging, and monitoring out of the box
- **Developer Experience**: Local development server, hot reload, and TypeScript-first SDK

## How to Use This CLI

The Agentuity CLI is designed to be agent-friendly. Here are the key commands:

### Discovery & Introspection
\`\`\`bash
${getCommand('--help=json')}              # Get complete CLI schema as JSON
${getCommand('ai capabilities show')}     # List all capabilities and workflows
${getCommand('ai schema show')}           # Detailed command metadata
\`\`\`

### Project Management
\`\`\`bash
${getCommand('project create')}           # Create a new Agentuity project
${getCommand('project list')}             # List all projects
${getCommand('dev')}                      # Start local development server
\`\`\`

### Deployment
\`\`\`bash
${getCommand('cloud deploy')}             # Deploy to production
${getCommand('cloud deployment list')}    # List deployments
${getCommand('cloud deployment logs')}    # View deployment logs
\`\`\`

### Cloud Services
\`\`\`bash
${getCommand('cloud kv')}                 # Key-value storage operations
${getCommand('cloud vector')}             # Vector database operations
${getCommand('cloud storage')}            # Object storage operations
${getCommand('env set KEY value')}        # Set environment variables
${getCommand('env set KEY value --secret')} # Set secrets (encrypted)
\`\`\`

## Best Practices for AI Agents

1. **Always use \`--json\` for machine-readable output**
   \`\`\`bash
   ${getCommand('--json project list')}
   \`\`\`

2. **Use \`--explain\` before destructive operations**
   \`\`\`bash
   ${getCommand('--explain cloud deployment delete <id>')}
   \`\`\`

3. **Use \`--dry-run\` to test commands safely**
   \`\`\`bash
   ${getCommand('--dry-run cloud deploy')}
   \`\`\`

4. **Check requirements before running commands**
   - Many commands require authentication (\`${getCommand('auth login')}\`)
   - Project commands require an \`agentuity.json\` file in the current directory

## Error Handling

Errors are returned as structured JSON when using \`--json\`:
\`\`\`json
{
  "error": {
    "code": "AUTH_REQUIRED",
    "message": "Authentication required",
    "suggestions": ["Run '${getCommand('auth login')}' to authenticate"]
  }
}
\`\`\`

## Getting Started Workflow

1. \`${getCommand('auth login')}\` - Authenticate with Agentuity
2. \`${getCommand('project create')}\` - Create a new project (or work in existing one)
3. \`${getCommand('dev')}\` - Start local development
4. \`${getCommand('cloud deploy')}\` - Deploy to production

## Agent Detection

This CLI can detect when it's being run by an AI coding agent. Currently supported agents: ${detectedAgents}.

${agent ? `You were detected as: **${getAgentDisplayName(agent)}**` : 'No agent was detected for this session.'}

## More Information

- Documentation: https://agentuity.dev/docs
- API Reference: https://agentuity.dev/api
- Examples: https://github.com/agentuity/examples

For detailed command help, use \`${getCommand('<command> --help')}\` or \`${getCommand('--help=json')}\` for the full schema.
`;
}

export const introSubcommand = createSubcommand({
	name: 'intro',
	description: 'Introduction to Agentuity CLI for AI coding agents',
	tags: ['read-only', 'fast'],
	idempotent: true,
	examples: [{ command: getCommand('ai intro'), description: 'Show introduction for AI agents' }],
	handler(_ctx: CommandContext) {
		const agent = getExecutingAgent();

		if (!agent) {
			// Human is running this command directly
			tui.newline();
			tui.info(tui.bold('This command is designed for AI coding agents'));
			tui.newline();
			console.log(
				`  This command outputs an introduction to the Agentuity CLI that helps AI\n` +
					`  coding agents understand how to use the platform effectively.\n`
			);
			console.log(`  ${tui.bold('To use this command:')}\n`);
			console.log(
				`  Ask your AI coding agent to run ${tui.colorPrimary(`"${getCommand('ai intro')}"`)} to introduce\n` +
					`  itself to the Agentuity platform and learn how to help you build and deploy agents.\n`
			);
			console.log(
				`  ${tui.muted('Supported agents:')} ${KNOWN_AGENTS.map(([, name]) => getAgentDisplayName(name)).join(', ')}\n`
			);
			return;
		}

		// Agent is running this command - output the full prompt
		const prompt = generateIntroPrompt(agent);
		console.log(prompt);
	},
});

export default introSubcommand;
