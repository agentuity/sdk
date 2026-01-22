import { createSubcommand } from '../../../types';
import type { CommandContext } from '../../../types';
import * as tui from '../../../tui';
import { getCommand } from '../../../command-prefix';
import { z } from 'zod';

export interface Capability {
	id: string;
	name: string;
	description: string;
	commands: string[];
	requiresAuth?: boolean;
	requiresProject?: boolean;
}

export interface CapabilitiesResponse {
	version: string;
	capabilities: Capability[];
	workflows: Array<{
		name: string;
		description: string;
		steps: string[];
	}>;
}

const CapabilitiesShowResponseSchema = z.object({
	version: z.string().describe('CLI capabilities version'),
	capabilities: z
		.array(
			z.object({
				id: z.string().describe('Capability ID'),
				name: z.string().describe('Capability name'),
				description: z.string().describe('Description'),
				commands: z.array(z.string()).describe('Available commands'),
				requiresAuth: z.boolean().optional().describe('Requires authentication'),
				requiresProject: z.boolean().optional().describe('Requires project'),
			})
		)
		.describe('Available capabilities'),
	workflows: z
		.array(
			z.object({
				name: z.string().describe('Workflow name'),
				description: z.string().describe('Workflow description'),
				steps: z.array(z.string()).describe('Workflow steps'),
			})
		)
		.describe('Common workflows'),
});

export const showSubcommand = createSubcommand({
	name: 'show',
	description: 'Display CLI capabilities',
	tags: ['read-only', 'fast'],
	examples: [
		{ command: getCommand('capabilities show'), description: 'Show CLI AI capabilities' },
		{
			command: getCommand('--json capabilities show'),
			description: 'Show output in JSON format',
		},
	],
	schema: {
		response: CapabilitiesShowResponseSchema,
	},
	idempotent: true,
	async handler(ctx: CommandContext) {
		const { options } = ctx;

		const capabilities: CapabilitiesResponse = {
			version: '1.0.0',
			capabilities: [
				{
					id: 'auth',
					name: 'Authentication',
					description: 'Login, logout, and manage API keys',
					commands: ['auth login', 'auth logout', 'auth whoami', 'auth signup'],
					requiresAuth: false,
				},
				{
					id: 'ssh',
					name: 'SSH Key Management',
					description: 'Manage SSH keys for secure access',
					commands: ['auth ssh list', 'auth ssh add', 'auth ssh delete'],
					requiresAuth: true,
				},
				{
					id: 'project',
					name: 'Project Management',
					description: 'Create, list, and manage projects',
					commands: [
						'project create',
						'project list',
						'project show',
						'project download',
						'project update',
						'project delete',
					],
					requiresAuth: true,
				},
				{
					id: 'deployment',
					name: 'Deployment',
					description: 'Deploy and manage applications',
					commands: [
						'bundle',
						'cloud deploy',
						'cloud deployment list',
						'cloud deployment show',
						'cloud deployment logs',
						'cloud deployment rollback',
					],
					requiresAuth: true,
					requiresProject: true,
				},
				{
					id: 'env',
					name: 'Environment Variables & Secrets',
					description: 'Manage environment variables and secrets',
					commands: ['env list', 'env set', 'env set --secret', 'env get', 'env delete'],
					requiresAuth: true,
					requiresProject: true,
				},
				{
					id: 'kv',
					name: 'Key-Value Storage',
					description: 'Store and retrieve key-value data',
					commands: ['kv list', 'kv get', 'kv set', 'kv delete', 'kv stats'],
					requiresAuth: true,
					requiresProject: true,
				},
				{
					id: 'databases',
					name: 'Cloud Databases',
					description: 'Manage database resources',
					commands: ['cloud db list', 'cloud db create', 'cloud db get', 'cloud db delete'],
					requiresAuth: true,
				},
				{
					id: 'storage',
					name: 'Cloud Storage',
					description: 'Manage storage resources',
					commands: [
						'cloud storage list',
						'cloud storage create',
						'cloud storage get',
						'cloud storage delete',
					],
					requiresAuth: true,
				},
				{
					id: 'config',
					name: 'Configuration',
					description: 'Manage CLI profiles and configuration',
					commands: [
						'profile list',
						'profile create',
						'profile delete',
						'profile show',
						'profile switch',
					],
				},
				{
					id: 'dev',
					name: 'Development',
					description: 'Local development server and REPL',
					commands: ['dev', 'repl'],
					requiresProject: true,
				},
				{
					id: 'introspection',
					name: 'CLI Introspection',
					description: 'Discover CLI structure and capabilities',
					commands: ['schema show', 'capabilities show', 'version'],
				},
			],
			workflows: [
				{
					name: 'Initial Setup',
					description: 'Get started with Agentuity',
					steps: [
						'auth signup',
						'auth login',
						'project create',
						'env set API_KEY <value> --secret',
						'dev',
					],
				},
				{
					name: 'Deploy Application',
					description: 'Deploy your application to the cloud',
					steps: ['bundle', 'cloud deploy', 'cloud deployment logs', 'cloud deployment show'],
				},
				{
					name: 'Manage Environment Variables',
					description: 'Configure environment variables and secrets',
					steps: [
						'env list',
						'env set <key> <value>',
						'env set <key> <value> --secret',
						'env get <key>',
					],
				},
				{
					name: 'SSH Key Setup',
					description: 'Add SSH keys for secure access',
					steps: ['auth ssh list', 'auth ssh add --file ~/.ssh/id_rsa.pub'],
				},
			],
		};

		if (options.json) {
			console.log(JSON.stringify(capabilities, null, 2));
		} else {
			// Human-readable output
			console.log(tui.bold('Agentuity CLI Capabilities'));
			tui.newline();

			console.log(tui.bold('Available Tasks:'));
			tui.newline();

			for (const cap of capabilities.capabilities) {
				console.log(`  ${tui.bold(cap.name)}`);
				console.log(`    ${cap.description}`);

				const requirements: string[] = [];
				if (cap.requiresAuth) requirements.push('requires authentication');
				if (cap.requiresProject) requirements.push('requires project');
				if (requirements.length > 0) {
					console.log(`    ${tui.muted(`(${requirements.join(', ')})`)}`);
				}

				console.log(
					`    ${tui.muted(`Commands: ${cap.commands.slice(0, 3).join(', ')}${cap.commands.length > 3 ? '...' : ''}`)}`
				);
				tui.newline();
			}

			console.log(tui.bold('Common Workflows:'));
			tui.newline();

			for (const workflow of capabilities.workflows) {
				console.log(`  ${tui.bold(workflow.name)}`);
				console.log(`    ${workflow.description}`);
				console.log(`    ${tui.muted('Steps:')}`);
				for (let i = 0; i < workflow.steps.length; i++) {
					console.log(`      ${i + 1}. ${workflow.steps[i]}`);
				}
				tui.newline();
			}

			console.log(tui.muted('Tip: Use --json for machine-readable output'));
		}

		return capabilities;
	},
});

export default showSubcommand;
