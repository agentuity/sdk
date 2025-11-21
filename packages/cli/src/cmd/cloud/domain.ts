import * as dns from 'node:dns';
import type { Config } from '../../types';

export interface DNSResult {
	domain: string;
	success: boolean;
	message?: string;
}

/**
 * This function will check for each of the custom domains and make sure they are correctly
 * configured in DNS
 *
 * @param projectId the project id
 * @param config Config
 * @param domains array of domains to check
 * @returns
 */
export async function checkCustomDomainForDNS(
	projectId: string,
	domains: string[],
	config?: Config | null
): Promise<DNSResult[]> {
	const suffix = config?.overrides?.api_url?.includes('agentuity.io')
		? 'agentuity.io'
		: 'agentuity.cloud';
	// FIXME: update to add the region into this
	const id = Bun.hash.xxHash64(projectId).toString(16);
	const proxy = `p${id}.${suffix}`;

	return Promise.all(
		domains.map(async (domain) => {
			try {
				const timeoutMs = 5000;
				let timeoutId: Timer | undefined;

				const timeoutPromise = new Promise<never>((_, reject) => {
					timeoutId = setTimeout(() => {
						reject(new Error(`DNS lookup timed out after ${timeoutMs}ms`));
					}, timeoutMs);
				});

				const result = await Promise.race([
					dns.promises.resolveCname(domain),
					timeoutPromise,
				]).finally(() => {
					if (timeoutId) clearTimeout(timeoutId);
				});

				if (result.length) {
					if (result[0] === proxy) {
						return {
							domain,
							success: true,
						};
					}
					return {
						domain,
						success: false,
						message: `DNS record for ${domain} must have a CNAME record with the value: ${proxy}`,
					};
				}
			} catch (ex) {
				const _ex = ex as { code: string; message?: string };
				if (_ex.message?.includes('timed out')) {
					return {
						domain,
						success: false,
						message: `DNS lookup for ${domain} timed out after 5 seconds. Please check your DNS configuration.`,
					};
				}
				if (_ex.code !== 'ENOTFOUND') {
					const errMsg =
						ex instanceof Error
							? ex.message
							: typeof ex === 'string'
								? ex
								: JSON.stringify(ex);
					return {
						domain,
						success: false,
						message: `DNS returned an error resolving ${domain}: ${errMsg}`,
					};
				}
			}
			return {
				domain,
				success: false,
				message: `To enable the custom domain ${domain}, create a CNAME DNS record with the value: ${proxy} and a TTL of 600`,
			};
		})
	);
}
