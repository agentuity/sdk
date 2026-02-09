import type { Config } from './types';
import { StructuredError } from '@agentuity/core';
import * as tui from './tui';

interface BaseDNSResult {
	domain: string;
	target: string;
	recordType: string;
}

interface DNSSuccess extends BaseDNSResult {
	success: true;
}

interface DNSPending extends BaseDNSResult {
	success: true;
	pending: true;
}

interface DNSMissing extends BaseDNSResult {
	success: false;
	pending: false;
}

interface DNSError extends BaseDNSResult {
	success: false;
	error: string;
}

interface DNSMisconfigured extends BaseDNSResult {
	success: false;
	misconfigured: string;
}

export type DNSResult = DNSSuccess | DNSPending | DNSMissing | DNSError | DNSMisconfigured;
export type DNSFailed = DNSPending | DNSMissing | DNSError | DNSMisconfigured;

/**
 * Default branches that match the '*' wildcard key
 */
export const DEFAULT_BRANCHES = ['main', 'master'];

/**
 * Resolves the domains configuration to a flat array of domain strings
 * based on the current git branch.
 *
 * If domains is already an array, returns it as-is (backward compatible).
 * If domains is a record (branch map):
 *   1. If the current branch has an exact match, use those domains
 *   2. Otherwise, fall back to the '*' key (default/main branch domains)
 *   3. If no '*' key exists, return empty array
 *
 * @param domains - The raw domains config (array or record)
 * @param currentBranch - The current git branch name (null if not in a git repo)
 * @returns Flat array of domain strings
 */
export function resolveDomains(
	domains: string[] | Record<string, string[]> | undefined,
	currentBranch: string | null
): string[] {
	if (!domains) return [];

	// Backward compatible: if it's already an array, return as-is
	if (Array.isArray(domains)) return domains;

	// It's a branch-keyed map
	// 1. Try exact branch match
	if (currentBranch && currentBranch in domains) {
		return domains[currentBranch]!;
	}

	// 2. If current branch is a default branch (main/master), also match '*'
	if (currentBranch && DEFAULT_BRANCHES.includes(currentBranch) && '*' in domains) {
		return domains['*']!;
	}

	// 3. If no exact match found, fall back to '*' only if there's no current branch detected
	if (!currentBranch && '*' in domains) {
		return domains['*']!;
	}

	// 4. No match found - return empty array
	return [];
}

export function isMisconfigured(x: DNSResult): x is DNSMisconfigured {
	return 'misconfigured' in x && !!x.misconfigured;
}

export function isMissing(x: DNSResult): x is DNSMissing {
	return 'pending' in x && x.pending === false && 'success' in x && x.success === false;
}

export function isError(x: DNSResult): x is DNSError {
	return 'error' in x && !!x.error;
}

export function isPending(x: DNSResult): x is DNSPending {
	return 'pending' in x && x.pending === true && x.success === true;
}

export function isSuccess(x: DNSResult): x is DNSSuccess {
	return x.success == true && !('pending' in x) && !('error' in x) && !('misconfigured' in x);
}

const timeoutMs = 5000;

const DNSTimeoutError = StructuredError(
	'DNSTimeoutError',
	`DNS lookup timed out after ${timeoutMs}ms`
);

interface CFRecord {
	Answer?: {
		data: string;
	}[];
}

async function fetchDNSRecord(name: string, type: string): Promise<string | null> {
	const params = new URLSearchParams();
	params.set('name', name);
	params.set('type', type);
	const res = await fetch(`https://cloudflare-dns.com/dns-query?${params.toString()}`, {
		headers: {
			Accept: 'application/dns-json',
		},
	});
	if (res.ok) {
		const result = (await res.json()) as CFRecord;
		const firstAnswer = result?.Answer?.[0];
		if (firstAnswer) {
			return firstAnswer.data.replace(/\.$/, ''); // DNS records end with . so we remove that
		}
	}
	return null;
}

const LOCAL_DNS = 'agentuity.io';
const PRODUCTION_DNS = 'agentuity.run';

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
	const suffix = config?.overrides?.api_url?.includes('agentuity.io') ? LOCAL_DNS : PRODUCTION_DNS;
	const id = Bun.hash.xxHash64(projectId).toString(16).padStart(16, '0');
	const proxy = `p${id}.${suffix}`;

	return Promise.all(
		domains.map(async (domain) => {
			try {
				let timeoutId: Timer | undefined;

				const timeoutPromise = new Promise<never>((_, reject) => {
					timeoutId = setTimeout(() => {
						reject(new DNSTimeoutError());
					}, timeoutMs);
				});

				const result = await Promise.race([
					fetchDNSRecord(domain, 'CNAME'),
					timeoutPromise,
				]).finally(() => {
					if (timeoutId) clearTimeout(timeoutId);
				});

				if (result) {
					if (result === proxy) {
						return {
							domain,
							target: proxy,
							recordType: 'CNAME',
							success: true,
						} as DNSSuccess;
					}
					return {
						domain,
						target: proxy,
						recordType: 'CNAME',
						success: false,
						misconfigured: `CNAME record is ${result}`,
					} as DNSMisconfigured;
				}
			} catch (ex) {
				const _ex = ex as { code: string; message?: string };
				if (_ex.message?.includes('timed out')) {
					return {
						domain,
						target: proxy,
						recordType: 'CNAME',
						success: false,
						error: `DNS lookup timed out after 5 seconds. Please check your DNS configuration.`,
					} as DNSError;
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
						target: proxy,
						recordType: 'CNAME',
						success: false,
						error: errMsg,
					} as DNSError;
				}
			}
			return {
				domain,
				success: false,
				target: proxy,
				recordType: 'CNAME',
				pending: false,
			} as DNSMissing;
		})
	);
}

export async function promptForDNS(
	projectId: string,
	domains: string[],
	config?: Config,
	resumeFn?: () => () => void
) {
	let paused = false;
	let resume: (() => void) | undefined;
	for (;;) {
		const result = await checkCustomDomainForDNS(projectId, domains, config);
		const failed = result.filter((x): x is DNSFailed => !isSuccess(x));
		if (failed.length) {
			const records: {
				domain: string;
				type: string;
				target: string;
				status: string;
			}[] = [];
			result.forEach((r) => {
				if (isSuccess(r)) {
					records.push({
						domain: r.domain,
						type: r.recordType,
						target: r.target,
						status: tui.colorSuccess(`${tui.ICONS.success} Configured`),
					});
				}
			});
			if (!paused) {
				resume = resumeFn?.();
				paused = true;
			}
			tui.error(
				`You have ${tui.plural(failed.length, 'a ', '')}DNS configuration ${tui.plural(failed.length, 'issue', 'issues')} that must be resolved before deploying:`
			);
			for (const r of failed) {
				if (isError(r)) {
					resume?.();
					throw new Error(r.error);
				} else if (isMisconfigured(r)) {
					records.push({
						domain: r.domain,
						type: r.recordType,
						target: r.target,
						status: tui.colorWarning(`${tui.ICONS.error} ${r.misconfigured}`),
					});
				} else if (isPending(r)) {
					records.push({
						domain: r.domain,
						type: r.recordType,
						target: r.target,
						status: tui.colorWarning('⌛️ Pending'),
					});
				} else if (isMissing(r)) {
					records.push({
						domain: r.domain,
						type: r.recordType,
						target: r.target,
						status: tui.colorError(`${tui.ICONS.error} Missing`),
					});
				}
			}

			let linesShown = 2; // header + footer
			for (const record of records) {
				console.log();
				console.log(`${tui.colorInfo('Domain:')}  ${tui.colorPrimary(record.domain)}`);
				console.log(`${tui.colorInfo('Type:')}    ${tui.colorPrimary(record.type)}`);
				console.log(`${tui.colorInfo('Target:')}  ${tui.colorPrimary(record.target)}`);
				console.log(`${tui.colorInfo('Status:')}  ${tui.colorPrimary(record.status)}`);
				console.log();
				linesShown += 6;
			}

			// await tui.waitForAnyKey('Press any key to check again or ctrl+c to cancel...');
			await tui.spinner({
				message: 'Checking again in 5s...',
				clearOnSuccess: true,
				callback: () => {
					return Bun.sleep(5000);
				},
			});
			tui.clearLastLines(linesShown);
			linesShown = 0;
			continue;
		}
		tui.clearLastLines(1);
		resume?.();
		break;
	}
}
