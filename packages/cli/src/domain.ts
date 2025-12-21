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

export function isMisconfigured(x: DNSResult): x is DNSMisconfigured {
	return 'misconfigured' in x && !!x.misconfigured;
}

export function isMissing(x: DNSResult): x is DNSMissing {
	return 'pending' in x && x.success === false;
}

export function isError(x: DNSResult): x is DNSError {
	return 'error' in x && !!x.error;
}

export function isPending(x: DNSResult): x is DNSPending {
	return 'pending' in x && x.pending && x.success;
}

export function isSuccess(x: DNSResult): x is DNSPending {
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
		if (result?.Answer?.length) {
			return result.Answer[0].data.replace(/\.$/, ''); // DNS records end with . so we remove that
		}
	}
	return null;
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
	const id = Bun.hash.xxHash64(projectId).toString(16);
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
		const failed = result.filter((x) => !isSuccess(x));
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
				}
				if (isMisconfigured(r)) {
					records.push({
						domain: r.domain,
						type: r.recordType,
						target: r.target,
						status: tui.colorWarning(`${tui.ICONS.error} ${r.misconfigured}`),
					});
				}
				if (isMissing(r)) {
					records.push({
						domain: r.domain,
						type: r.recordType,
						target: r.target,
						status: tui.colorError(`${tui.ICONS.error} Missing`),
					});
				}
				if (isPending(r)) {
					records.push({
						domain: r.domain,
						type: r.recordType,
						target: r.target,
						status: tui.colorWarning('⌛️ Pending'),
					});
				}
			}

			let linesShown = 2; // header + footer
			for (const record of records) {
				console.log();
				console.log(`${tui.colorInfo('Domain:')}  ${tui.colorPrimary(record.domain)}`);
				console.log(`${tui.colorInfo('Type:')}    ${tui.colorPrimary(record.type)}`);
				console.log(`${tui.colorInfo('Domain:')}  ${tui.colorPrimary(record.target)}`);
				console.log(`${tui.colorInfo('Status:')}  ${tui.colorPrimary(record.status)}`);
				console.log();
				linesShown += 6;
			}

			await tui.waitForAnyKey('Press any key to check again or ctrl+c to cancel...');
			tui.clearLastLines(linesShown + 1);
			linesShown = 0;
			await tui.spinner({
				message: 'Checking...',
				clearOnSuccess: true,
				callback: () => {
					return Bun.sleep(2000);
				},
			});
			continue;
		}
		tui.clearLastLines(1);
		resume?.();
		break;
	}
}
