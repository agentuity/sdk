/**
 * Dev command — runs the project's own dev script and (optionally)
 * exposes it through an Agentuity gravity tunnel as a public HTTPS
 * URL.
 *
 * Detects the package manager (bun/npm/pnpm/yarn) from the project,
 * then runs `<pm> run dev`. Before spawning, injects Agentuity AI
 * Gateway environment variables so LLM SDK calls (OpenAI, Anthropic,
 * Groq) are automatically routed through the gateway when the user
 * has an AGENTUITY_SDK_KEY configured.
 *
 * When `--public` is enabled (saved per-project, prompted on first
 * run), the CLI also reserves a devmode endpoint, downloads the
 * gravity tunnel binary if needed, spawns it pointing at the user's
 * dev port, and exports `AGENTUITY_DEVMODE_HOSTNAME` /
 * `AGENTUITY_DEVMODE_URL` so framework plugins (e.g.
 * `@agentuity/vite`) can configure themselves for the tunnel.
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { z } from 'zod';
import { APIClient, getAPIBaseURL, getGravityDevModeURL } from '../../api.ts';
import { isTTY } from '../../auth.ts';
import { getCommand } from '../../command-prefix.ts';
import {
	getAuth,
	getDefaultConfigDir,
	loadConfig,
	loadProjectConfig,
	loadProjectSDKKey,
	saveConfig,
	updateProjectConfig,
} from '../../config.ts';
import { ErrorCode } from '../../errors.ts';
import { validateGravityRequiresUpgrade } from '../../runtime.ts';
import * as tui from '../../tui.ts';
import { createCommand } from '../../types.ts';
import type { Config, Logger, ProjectConfig } from '../../types.ts';
import { detectFrameworkWithPackageJson } from '../build/detect/index.ts';
import { detectPackageManager, getRunCommand } from '../build/detect/util.ts';
import { generateEndpoint, type DevmodeResponse } from './api.ts';
import { download, sweepOldGravityVersions } from './download.ts';
import { killLingeringGravityProcesses, startGravity, type GravityHandle } from './gravity.ts';

const DEFAULT_PORT = 3000;
const GRAVITY_CHECK_INTERVAL_MS = 60 * 60 * 1000; // 1h

interface ResolveDevOrgIdOptions {
	readonly env: Readonly<Record<string, string | undefined>>;
	readonly projectConfig?: Pick<ProjectConfig, 'orgId'> | null;
	readonly config?: Pick<Config, 'preferences'> | null;
}

function normalizeOrgId(orgId: string | undefined): string | undefined {
	const trimmed = orgId?.trim();
	return trimmed ? trimmed : undefined;
}

export function resolveDevOrgId(options: ResolveDevOrgIdOptions): string | undefined {
	return (
		normalizeOrgId(options.projectConfig?.orgId) ??
		normalizeOrgId(options.env.AGENTUITY_ORGID) ??
		normalizeOrgId(options.env.AGENTUITY_ORG_ID) ??
		normalizeOrgId(options.env.AGENTUITY_CLOUD_ORG_ID) ??
		normalizeOrgId(options.config?.preferences?.orgId)
	);
}

const DEV_ORG_ENV_ALIASES = [
	'AGENTUITY_ORGID',
	'AGENTUITY_ORG_ID',
	'AGENTUITY_CLOUD_ORG_ID',
] as const;

export function applyDevOrgEnv(
	env: Record<string, string | undefined>,
	orgId: string | undefined
): void {
	if (!orgId) return;
	for (const name of DEV_ORG_ENV_ALIASES) {
		if (!normalizeOrgId(env[name])) {
			env[name] = orgId;
		}
	}
}

export const command = createCommand({
	name: 'dev',
	description: 'Run the project development server',
	tags: ['mutating', 'slow'],
	idempotent: true,
	optional: { project: true },
	examples: [
		{ command: getCommand('dev'), description: 'Start development server' },
		{ command: getCommand('dev --port 8080'), description: 'Specify custom port' },
		{
			command: getCommand('dev --public'),
			description: 'Expose dev server through a public URL (gravity tunnel)',
		},
		{
			command: getCommand('dev --no-public'),
			description: 'Run without a public URL even if one was previously enabled',
		},
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
			public: z.boolean().optional().describe('Expose dev server via gravity public-URL tunnel'),
		}),
	},

	async handler(ctx) {
		const { opts, projectDir, logger } = ctx;
		const rootDir = resolve(projectDir);

		// Read package.json
		const { packageJson } = await detectFrameworkWithPackageJson(rootDir);

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
					tui.arrow(
						`Link this project: ${tui.colorInfo(tui.bold('agentuity project import'))}`
					);
					tui.newline();
				}
			}
		}

		// Load profile config to get transport URL for gateway routing
		let config = await loadConfig();
		if (config?.overrides?.transport_url && !env.AGENTUITY_TRANSPORT_URL) {
			env.AGENTUITY_TRANSPORT_URL = config.overrides.transport_url;
		}
		if (config?.overrides?.catalyst_url && !env.AGENTUITY_CATALYST_URL) {
			env.AGENTUITY_CATALYST_URL = config.overrides.catalyst_url;
		}

		// Load agentuity.json (if present) so we can surface the project's
		// orgId to the dev process. The aigateway client and other service
		// clients accept orgId as a constructor option but otherwise have no
		// way to pick it up under `agentuity dev`. Consumers read different
		// subsets of the org env aliases (pi reads all of them, coder-tui
		// reads AGENTUITY_ORGID and AGENTUITY_CLOUD_ORG_ID, the docs point
		// apps at AGENTUITY_CLOUD_ORG_ID), so publish under every alias the
		// developer has not already set.
		const projectConfig = await tryLoadProjectConfig(rootDir, config);
		const orgId = resolveDevOrgId({ env, projectConfig, config });
		applyDevOrgEnv(env, orgId);

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

		// ────────────────────────────────────────────────────────────
		// Public URL (gravity tunnel) setup
		// ────────────────────────────────────────────────────────────

		// Reuse the project config we loaded earlier (above the env-injection
		// block) so we don't read agentuity.json twice.
		const project = projectConfig;
		const publicEnabled = await resolvePublicMode(opts.public, project, rootDir, config, logger);

		let gravity: GravityHandle | null = null;
		let publicUrl: string | undefined;

		if (publicEnabled) {
			const result = await setupPublicTunnel({
				rootDir,
				port,
				project,
				config,
				logger,
				env,
				packageJson,
			});
			gravity = result.gravity;
			publicUrl = result.publicUrl;
			config = result.config;
		}

		// ────────────────────────────────────────────────────────────
		// Banner — show local + public URLs
		// ────────────────────────────────────────────────────────────

		printDevBanner(port, publicUrl);

		// ────────────────────────────────────────────────────────────
		// Spawn user's dev server (inherits stdio for full interactivity)
		// ────────────────────────────────────────────────────────────

		const [bin, ...args] = cmd;
		const proc = spawn(bin!, args, {
			cwd: rootDir,
			env: { ...process.env, ...env },
			stdio: 'inherit',
		});

		// Forward signals to BOTH the framework and the gravity tunnel.
		// Killing them in parallel matches the v2 procManager behavior —
		// without it the tunnel would keep running until the framework
		// finished its (potentially slow) graceful shutdown.
		let shuttingDown = false;
		const signalHandler = (signal: NodeJS.Signals) => {
			if (shuttingDown) return;
			shuttingDown = true;
			const forwarded = signal === 'SIGINT' ? 'SIGINT' : 'SIGTERM';
			try {
				proc.kill(forwarded);
			} catch {
				// already exited
			}
			if (gravity) {
				void gravity.stop();
			}
		};
		process.on('SIGINT', signalHandler);
		process.on('SIGTERM', signalHandler);

		// Last-resort synchronous SIGKILL: if Node tears down before our
		// async cleanup finishes (uncaught exception, parent abandoned us)
		// the process.on('exit') handler is the final chance to avoid
		// orphaning gravity. async work is not allowed here.
		const exitHandler = () => {
			if (gravity) {
				try {
					gravity.forceKillSync();
				} catch {
					// best effort
				}
			}
		};
		process.on('exit', exitHandler);

		const exitCode = await new Promise<number | null>((resolve) => {
			proc.once('close', (code) => resolve(code));
		});

		process.off('SIGINT', signalHandler);
		process.off('SIGTERM', signalHandler);

		if (gravity) {
			await gravity.stop();
		}

		process.off('exit', exitHandler);

		if (exitCode !== 0 && exitCode !== 130) {
			// 130 = SIGINT (Ctrl+C), which is normal
			logger.debug('Dev server exited with code %d', exitCode);
		}

		process.exit(exitCode ?? 0);
	},
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function tryLoadProjectConfig(
	rootDir: string,
	config: Config | null
): Promise<ProjectConfig | undefined> {
	try {
		return await loadProjectConfig(rootDir, config);
	} catch {
		return undefined;
	}
}

/**
 * Decide whether the public URL should be enabled for this run.
 *
 * Precedence:
 *   1. Explicit `--public` / `--no-public` flag.
 *   2. Saved per-project preference (`agentuity.json` `devmode.public`).
 *   3. Interactive prompt (only when stdin is a TTY); default no.
 *   4. Non-TTY default: off.
 *
 * Saves the chosen value back to `agentuity.json` when the user is
 * prompted, so subsequent runs honor the choice silently.
 */
async function resolvePublicMode(
	explicit: boolean | undefined,
	project: ProjectConfig | undefined,
	rootDir: string,
	config: Config | null,
	logger: Logger
): Promise<boolean> {
	if (explicit !== undefined) {
		// Persist if the user opted in/out from the CLI and we have a
		// project config to save it to.
		if (project && project.devmode?.public !== explicit) {
			try {
				await updateProjectConfig(
					rootDir,
					{ devmode: { ...project.devmode, public: explicit } },
					config
				);
			} catch (err) {
				logger.debug('Could not persist devmode.public preference: %s', err);
			}
		}
		return explicit;
	}

	if (project?.devmode?.public !== undefined) {
		return project.devmode.public;
	}

	if (!project || !isTTY()) {
		return false;
	}

	tui.newline();
	const enabled = await tui.confirm(
		'Expose this dev server through a public URL (gravity tunnel)?',
		false
	);
	tui.newline();

	try {
		await updateProjectConfig(
			rootDir,
			{ devmode: { ...project.devmode, public: enabled } },
			config
		);
	} catch (err) {
		logger.debug('Could not persist devmode.public preference: %s', err);
	}

	return enabled;
}

interface SetupTunnelArgs {
	rootDir: string;
	port: number;
	project: ProjectConfig | undefined;
	config: Config | null;
	logger: Logger;
	env: Record<string, string>;
	packageJson: { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
}

interface SetupTunnelResult {
	gravity: GravityHandle | null;
	publicUrl?: string;
	config: Config | null;
}

async function setupPublicTunnel(args: SetupTunnelArgs): Promise<SetupTunnelResult> {
	const { rootDir, port, project, logger, env, packageJson } = args;
	let config = args.config;

	// Best-effort: clear any orphaned gravity tunnels left over from a
	// previous dev session for this project. Without this, the platform
	// can briefly refuse the new tunnel because the old endpoint hasn't
	// timed out yet.
	killLingeringGravityProcesses(logger, project?.projectId);

	// Public URL needs both a registered project and a valid auth.
	if (!project) {
		tui.fatal(
			`Public URL requires a registered project.\n` +
				`Run ${tui.bold(getCommand('project import'))} to link this directory to an Agentuity project, ` +
				`or re-run with ${tui.bold('--no-public')}.`,
			ErrorCode.PROJECT_NOT_FOUND
		);
	}

	const auth = await getAuth();
	if (!auth || auth.expires <= new Date()) {
		tui.fatal(
			`Public URL requires authentication.\n` +
				`Run ${tui.bold(getCommand('auth login'))} to log in, or re-run with ${tui.bold('--no-public')}.`,
			ErrorCode.AUTH_REQUIRED
		);
	}

	// Friendly heads-up when the project uses Vite but hasn't installed
	// the @agentuity/vite plugin (Vite blocks unknown hosts in dev).
	checkVitePluginInstalled(rootDir, packageJson, logger);

	// Reserve (or refresh) the devmode endpoint with the platform.
	const apiClient = new APIClient(getAPIBaseURL(config), logger, auth.apiKey, config);

	const savedPrivateKey = config?.devmode?.privateKey
		? Buffer.from(config.devmode.privateKey, 'base64').toString('utf-8')
		: undefined;

	let endpoint: DevmodeResponse;
	try {
		endpoint = await tui.spinner({
			message: 'Connecting to Gravity',
			callback: () =>
				generateEndpoint(
					apiClient,
					project.projectId,
					config?.devmode?.hostname,
					savedPrivateKey
				),
			clearOnSuccess: true,
		});
	} catch (err) {
		tui.fatal(
			`Failed to reserve devmode endpoint: ${err instanceof Error ? err.message : String(err)}`,
			ErrorCode.NETWORK_ERROR
		);
	}

	// Stash the hostname/private key so the same URL persists across
	// dev sessions on this machine.
	const updatedPrivateKey = endpoint.privateKey ?? savedPrivateKey;
	const updatedConfig: Config = {
		...(config ?? ({ name: 'default' } as Config)),
		devmode: {
			hostname: endpoint.hostname,
			privateKey: updatedPrivateKey
				? Buffer.from(updatedPrivateKey).toString('base64')
				: undefined,
		},
	};
	await saveConfig(updatedConfig);
	config = updatedConfig;

	// Resolve gravity binary — re-use cached copy if recent enough,
	// otherwise download.
	const gravityDir = join(getDefaultConfigDir(), 'gravity');
	let gravityBin: string | undefined;
	let sweepTarget: { gravityDir: string; version: string } | null = null;

	const cached = config.gravity;
	if (
		cached?.version &&
		existsSync(join(gravityDir, cached.version, 'gravity')) &&
		cached.checked &&
		Date.now() - cached.checked < GRAVITY_CHECK_INTERVAL_MS &&
		!validateGravityRequiresUpgrade(cached.version)
	) {
		gravityBin = join(gravityDir, cached.version, 'gravity');
	} else {
		const previousVersion = cached?.version;
		const res = await download(gravityDir);
		gravityBin = res.filename;
		if (previousVersion && previousVersion !== res.version) {
			sweepTarget = { gravityDir, version: res.version };
		}
		const refreshed: Config = {
			...config,
			gravity: { checked: Date.now(), version: res.version },
		};
		await saveConfig(refreshed);
		config = refreshed;
	}

	// Spawn gravity, pointing at the user's dev port.
	const privateKeyPEM = endpoint.privateKey ?? savedPrivateKey;
	if (!privateKeyPEM) {
		tui.fatal(
			'No private key returned for devmode endpoint. Re-run to generate a fresh key.',
			ErrorCode.INTERNAL_ERROR
		);
	}

	const gravityURL = getGravityDevModeURL(project.region, config);
	const handle = startGravity({
		binary: gravityBin,
		endpointId: endpoint.id,
		targetPort: port,
		gravityURL,
		orgId: project.orgId,
		projectId: project.projectId,
		privateKeyB64: Buffer.from(privateKeyPEM).toString('base64'),
		cwd: rootDir,
		logger,
	});

	if (sweepTarget) {
		// Wait for the first heartbeat (= tunnel up) before sweeping the
		// previous gravity binary; if the new version doesn't connect we
		// don't want to lose the working fallback. Failure is non-fatal.
		void handle.ready.then(() => {
			try {
				const removed = sweepOldGravityVersions(sweepTarget!.gravityDir, sweepTarget!.version);
				if (removed.length > 0) {
					logger.debug('Swept %d old gravity version dir(s)', removed.length);
				}
			} catch (err) {
				logger.debug('sweep of old gravity versions failed: %s', err);
			}
		});
	}

	const publicUrl = `https://${endpoint.hostname}`;
	env.AGENTUITY_DEVMODE_URL = publicUrl;
	env.AGENTUITY_DEVMODE_HOSTNAME = endpoint.hostname;

	return { gravity: handle, publicUrl, config };
}

function checkVitePluginInstalled(
	_rootDir: string,
	packageJson: { dependencies?: Record<string, string>; devDependencies?: Record<string, string> },
	logger: Logger
): void {
	const allDeps = {
		...(packageJson.dependencies ?? {}),
		...(packageJson.devDependencies ?? {}),
	};
	const usesVite = 'vite' in allDeps;
	const hasPlugin = '@agentuity/vite' in allDeps;
	if (usesVite && !hasPlugin) {
		logger.debug('Vite project detected without @agentuity/vite plugin');
		tui.warning(
			'This project uses Vite but does not have @agentuity/vite installed. ' +
				'Vite will reject requests from the public URL with "Blocked request". ' +
				'Install with: ' +
				tui.bold('bun add -d @agentuity/vite') +
				' and add ' +
				tui.bold('agentuity()') +
				' to vite.config plugins.'
		);
	}
}

function printDevBanner(port: number, publicUrl?: string): void {
	const padding = 12;
	const lines = [
		tui.muted(tui.padRight('Local:', padding)) + tui.link(`http://127.0.0.1:${port}`),
	];
	if (publicUrl) {
		lines.push(tui.muted(tui.padRight('Public:', padding)) + tui.link(publicUrl));
	}
	tui.banner('⨺ Agentuity DevMode', lines.join('\n'), {
		padding: 2,
		topSpacer: false,
		bottomSpacer: false,
		centerTitle: false,
	});
}

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
		env.AGENTUITY_CATALYST_URL ||
		'https://catalyst-usc.agentuity.cloud';

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
