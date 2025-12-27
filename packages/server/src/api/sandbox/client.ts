import type {
	Logger,
	SandboxCreateOptions,
	SandboxInfo,
	ExecuteOptions,
	Execution,
} from '@agentuity/core';
import { APIClient } from '../api';
import { sandboxCreate, type SandboxCreateResponse } from './create';
import { sandboxDestroy } from './destroy';
import { sandboxGet } from './get';
import { sandboxExecute } from './execute';
import { ConsoleLogger } from '../../logger';

export interface SandboxClientOptions {
	/**
	 * API key for authentication.
	 * Defaults to process.env.AGENTUITY_SDK_KEY || process.env.AGENTUITY_CLI_KEY
	 */
	apiKey?: string;

	/**
	 * Base URL for the sandbox API.
	 * Defaults to process.env.AGENTUITY_STREAM_URL ||
	 *   process.env.AGENTUITY_CATALYST_URL ||
	 *   process.env.AGENTUITY_TRANSPORT_URL
	 */
	url?: string;

	/**
	 * Organization ID for multi-tenant operations
	 */
	orgId?: string;

	/**
	 * Custom logger instance
	 */
	logger?: Logger;
}

/**
 * A sandbox instance returned by SandboxClient.create()
 */
export interface SandboxInstance {
	/**
	 * Unique sandbox identifier
	 */
	id: string;

	/**
	 * Sandbox status at creation time
	 */
	status: SandboxCreateResponse['status'];

	/**
	 * URL to stream stdout output
	 */
	stdoutStreamUrl?: string;

	/**
	 * URL to stream stderr output
	 */
	stderrStreamUrl?: string;

	/**
	 * Execute a command in the sandbox
	 */
	execute(options: ExecuteOptions): Promise<Execution>;

	/**
	 * Get current sandbox information
	 */
	get(): Promise<SandboxInfo>;

	/**
	 * Destroy the sandbox and release all resources
	 */
	destroy(): Promise<void>;
}

/**
 * Convenience client for sandbox operations.
 *
 * @example
 * ```typescript
 * const client = new SandboxClient();
 * const sandbox = await client.create();
 * const result = await sandbox.execute({ command: ['echo', 'hello'] });
 * await sandbox.destroy();
 * ```
 */
export class SandboxClient {
	readonly #client: APIClient;
	readonly #orgId?: string;

	constructor(options: SandboxClientOptions = {}) {
		const apiKey =
			options.apiKey || process.env.AGENTUITY_SDK_KEY || process.env.AGENTUITY_CLI_KEY;

		const url =
			options.url ||
			process.env.AGENTUITY_STREAM_URL ||
			process.env.AGENTUITY_CATALYST_URL ||
			process.env.AGENTUITY_TRANSPORT_URL;

		if (!url) {
			throw new Error(
				'Sandbox API URL is required. Set AGENTUITY_STREAM_URL, AGENTUITY_CATALYST_URL, or AGENTUITY_TRANSPORT_URL environment variable, or pass url option.'
			);
		}

		const logger = options.logger ?? new ConsoleLogger('warn');

		this.#client = new APIClient(url, logger, apiKey ?? '', {});
		this.#orgId = options.orgId;
	}

	/**
	 * Create a new sandbox instance
	 *
	 * @param options - Optional sandbox configuration
	 * @returns A sandbox instance with execute and destroy methods
	 */
	async create(options?: SandboxCreateOptions): Promise<SandboxInstance> {
		const response = await sandboxCreate(this.#client, {
			options,
			orgId: this.#orgId,
		});

		const sandboxId = response.sandboxId;
		const client = this.#client;
		const orgId = this.#orgId;

		return {
			id: sandboxId,
			status: response.status,
			stdoutStreamUrl: response.stdoutStreamUrl,
			stderrStreamUrl: response.stderrStreamUrl,

			async execute(executeOptions: ExecuteOptions): Promise<Execution> {
				return sandboxExecute(client, {
					sandboxId,
					options: executeOptions,
					orgId,
				});
			},

			async get(): Promise<SandboxInfo> {
				return sandboxGet(client, { sandboxId, orgId });
			},

			async destroy(): Promise<void> {
				return sandboxDestroy(client, { sandboxId, orgId });
			},
		};
	}

	/**
	 * Get sandbox information by ID
	 *
	 * @param sandboxId - The sandbox ID
	 * @returns Sandbox information
	 */
	async get(sandboxId: string): Promise<SandboxInfo> {
		return sandboxGet(this.#client, { sandboxId, orgId: this.#orgId });
	}

	/**
	 * Destroy a sandbox by ID
	 *
	 * @param sandboxId - The sandbox ID to destroy
	 */
	async destroy(sandboxId: string): Promise<void> {
		return sandboxDestroy(this.#client, { sandboxId, orgId: this.#orgId });
	}
}
