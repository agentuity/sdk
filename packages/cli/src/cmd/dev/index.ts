/**
 * Dev command — runs the project's own dev script.
 *
 * Detects the package manager (bun/npm/pnpm/yarn) from the project,
 * then runs `<pm> run dev`. Before spawning, injects Agentuity AI
 * Gateway environment variables so LLM SDK calls (OpenAI, Anthropic,
 * Groq) are automatically routed through the gateway when the user
 * has an AGENTUITY_SDK_KEY configured.
 */

import { resolve } from 'node:path';
import { z } from 'zod';
import { createCommand } from '../../types';
import * as tui from '../../tui';
import { getCommand } from '../../command-prefix';
import { ErrorCode } from '../../errors';
import { loadProjectSDKKey, getAuth, loadConfig } from '../../config';
import { detectFrameworkWithPackageJson } from '../build/detect';
import { detectPackageManager, getRunCommand } from '../build/detect/util';

const DEFAULT_PORT = 3000;

export const command = createCommand({
	name: 'dev',
	description: 'Run the project development server',
	tags: ['mutating', 'slow'],
	idempotent: true,
	optional: { project: true },
	examples: [
		{ command: getCommand('dev'), description: 'Start development server' },
		{ command: getCommand('dev --port 8080'), description: 'Specify custom port' },
	],
	schema: {
		options: z.object({
			port: z
				.number()
				.min(1024)
				.max(65535)
				.optional()
				.describe('Port to pass to the dev server via PORT env var'),
			script: z
				.string()
				.optional()
				.describe('Custom script name to run instead of "dev" (e.g., "dev:web")'),
		}),
	},

	async handler(ctx) {
		const { opts, projectDir, logger } = ctx;
		const rootDir = resolve(projectDir);

		// Read package.json
		const { framework, packageJson } = await detectFrameworkWithPackageJson(rootDir);

		if (!packageJson) {
			tui.fatal(
				'No package.json found. Ensure you are in a JS/TS project directory.',
				ErrorCode.CONFIG_INVALID
			);
		}

		// Determine which script to run
		const scriptName = opts.script ?? 'dev';

		if (!packageJson.scripts?.[scriptName]) {
			const available = packageJson.scripts
				? Object.keys(packageJson.scripts).join(', ')
				: 'none';
			tui.fatal(
				`No "${scriptName}" script found in package.json. Available scripts: ${available}`,
				ErrorCode.CONFIG_INVALID
			);
		}

		// Detect package manager
		const pm = await detectPackageManager(rootDir);
		const runCmd = getRunCommand(pm);

		// Build the command
		const cmd = runCmd.split(' ');
		cmd.push(scriptName);

		// Build environment
		const env: Record<string, string> = { ...process.env } as Record<string, string>;
		const port = opts.port ?? DEFAULT_PORT;
		env.PORT = String(port);

		// Resolve SDK key: env → .env files → auth profile
		if (!env.AGENTUITY_SDK_KEY) {
			const sdkKey = await loadProjectSDKKey(logger, rootDir);
			if (sdkKey) {
				env.AGENTUITY_SDK_KEY = sdkKey;
			} else {
				// No project-level SDK key — fall back to CLI auth key
				const auth = await getAuth();
				if (auth?.apiKey) {
					env.AGENTUITY_SDK_KEY = auth.apiKey;
					tui.warning(
						'No linked Agentuity project found. Using your auth key for AI Gateway.'
					);
					tui.bullet(`Link this project: ${tui.colorPrimary('agentuity project import')}`);
					tui.newline();
				}
			}
		}

		// Load profile config to get transport URL for gateway routing
		const config = await loadConfig();
		if (config?.overrides?.transport_url && !env.AGENTUITY_TRANSPORT_URL) {
			env.AGENTUITY_TRANSPORT_URL = config.overrides.transport_url;
		}
		if (config?.overrides?.catalyst_url && !env.AGENTUITY_CATALYST_URL) {
			env.AGENTUITY_CATALYST_URL = config.overrides.catalyst_url;
		}

		// Inject AI Gateway env vars so LLM SDKs route through Agentuity
		const gatewayInjected = injectGatewayEnv(env, logger);
		if (gatewayInjected) {
			tui.info('AI Gateway: routing LLM requests through Agentuity');
		} else if (!env.OPENAI_API_KEY && !env.ANTHROPIC_API_KEY) {
			tui.warning(
				'No AI API keys found. Run ' +
					tui.bold('agentuity auth login') +
					' to enable AI Gateway routing.'
			);
		}

		// Log what we're doing
		const frameworkLabel = framework
			? framework.name === 'generic'
				? ''
				: ` (${framework.name})`
			: '';
		tui.info(`Starting dev server${frameworkLabel} on port ${port}`);
		tui.info(tui.muted(`$ ${cmd.join(' ')}`));
		tui.newline();

		// Run the dev command, inheriting stdio for full interactivity
		const proc = Bun.spawn(cmd, {
			cwd: rootDir,
			env,
			stdin: 'inherit',
			stdout: 'inherit',
			stderr: 'inherit',
		});

		// Forward signals
		const signalHandler = (signal: NodeJS.Signals) => {
			proc.kill(signal === 'SIGINT' ? 'SIGINT' : 'SIGTERM');
		};
		process.on('SIGINT', signalHandler);
		process.on('SIGTERM', signalHandler);

		const exitCode = await proc.exited;

		process.off('SIGINT', signalHandler);
		process.off('SIGTERM', signalHandler);

		if (exitCode !== 0 && exitCode !== 130) {
			// 130 = SIGINT (Ctrl+C), which is normal
			logger.debug('Dev server exited with code %d', exitCode);
		}

		process.exit(exitCode ?? 0);
	},
});

// ─── AI Gateway Env Injection ─────────────────────────────────────────────────

interface GatewayProvider {
	apiKeyEnv: string;
	baseUrlEnv: string;
	provider: string;
}

const GATEWAY_PROVIDERS: GatewayProvider[] = [
	{ apiKeyEnv: 'OPENAI_API_KEY', baseUrlEnv: 'OPENAI_BASE_URL', provider: 'openai' },
	{ apiKeyEnv: 'ANTHROPIC_API_KEY', baseUrlEnv: 'ANTHROPIC_BASE_URL', provider: 'anthropic' },
	{ apiKeyEnv: 'GROQ_API_KEY', baseUrlEnv: 'GROQ_BASE_URL', provider: 'groq' },
];

/**
 * Inject AI Gateway environment variables into the child process env.
 *
 * For each LLM provider, if the user hasn't set their own API key
 * (or it matches the SDK key), we redirect to the Agentuity gateway.
 * This lets `openai`, `@anthropic-ai/sdk`, and `groq-sdk` work
 * out of the box without separate provider API keys.
 */
function injectGatewayEnv(
	env: Record<string, string>,
	logger: { debug: (...args: unknown[]) => void }
): boolean {
	const sdkKey = env.AGENTUITY_SDK_KEY;
	if (!sdkKey) return false;

	let injected = false;

	const gatewayUrl =
		env.AGENTUITY_AIGATEWAY_URL ||
		env.AGENTUITY_TRANSPORT_URL ||
		'https://catalyst.agentuity.cloud';

	for (const { apiKeyEnv, baseUrlEnv, provider } of GATEWAY_PROVIDERS) {
		const currentKey = env[apiKeyEnv];

		// If the user provided their own key (different from SDK key), leave it alone
		if (currentKey && currentKey !== sdkKey) {
			continue;
		}

		env[apiKeyEnv] = sdkKey;
		env[baseUrlEnv] = `${gatewayUrl}/gateway/${provider}`;
		logger.debug('AI Gateway: routing %s through %s', provider, env[baseUrlEnv]);
		injected = true;
	}

	return injected;
}
