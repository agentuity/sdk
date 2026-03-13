import { z } from 'zod';

/**
 * Response data for GET hostname (mirrors private HostnameGetDataSchema in hostname.ts)
 */
export const HostnameGetResponseDataSchema = z.object({
	/** The vanity hostname for the project, or null if not set */
	hostname: z
		.string()
		.nullable()
		.describe('The vanity hostname for the project, or null if not set.'),
	/** The full URL for the project hostname, or null if not set */
	url: z
		.string()
		.nullable()
		.describe('The full URL for the project hostname, or null if not set.'),
});
export type HostnameGetResponseData = z.infer<typeof HostnameGetResponseDataSchema>;

/**
 * Response data for SET hostname (mirrors private HostnameSetDataSchema in hostname.ts)
 */
export const HostnameSetResponseDataSchema = z.object({
	/** The vanity hostname that was set */
	hostname: z.string().describe('The vanity hostname that was set.'),
	/** The full URL for the project hostname */
	url: z.string().describe('The full URL for the project hostname.'),
});
export type HostnameSetResponseData = z.infer<typeof HostnameSetResponseDataSchema>;

/**
 * Request body for malware check endpoint
 */
export const MalwareCheckRequestSchema = z.object({
	/** Package ecosystem */
	ecosystem: z.string().describe('Package ecosystem (e.g., `npm`)'),
	/** Array of packages to scan */
	packages: z
		.array(
			z.object({
				name: z.string().describe('Package name (e.g., lodash, express)'),
				version: z.string().describe('Package version (e.g., 4.17.21)'),
			})
		)
		.describe('Array of packages to scan, each with name and version'),
});
export type MalwareCheckRequest = z.infer<typeof MalwareCheckRequestSchema>;
