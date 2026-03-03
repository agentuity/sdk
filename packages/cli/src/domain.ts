import type { Config } from './types.ts';
import { StructuredError } from '@agentuity/core/index.ts';
import { getIONHost } from './config.ts';
import * as tui from './tui.ts';

interface BaseDNSResult {
	domain: string;
	target: string;
	recordType: string;
	aRecordTarget?: string;
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
	return x.success === true && !('pending' in x) && !('error' in x) && !('misconfigured' in x);
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

async function fetchDNSRecords(name: string, type: string): Promise<string[]> {
	const params = new URLSearchParams();
	params.set('name', name);
	params.set('type', type);
	params.set('_', Date.now().toString());
	const res = await fetch(`https://cloudflare-dns.com/dns-query?${params.toString()}`, {
		headers: {
			Accept: 'application/dns-json',
		},
		// @ts-expect-error - cache is supported by Bun's fetch at runtime but missing from type definitions
		cache: 'no-store',
	});
	if (res.ok) {
		const result = (await res.json()) as CFRecord;
		// DNS records end with . so we remove that
		return (result?.Answer ?? []).map((a) => a.data.replace(/\.$/, ''));
	}
	return [];
}

async function fetchDNSRecord(name: string, type: string): Promise<string | null> {
	const records = await fetchDNSRecords(name, type);
	return records[0] ?? null;
}

/**
 * Check if a domain has a valid TLS certificate by making a HEAD request.
 * This also triggers Let's Encrypt certificate provisioning on first access.
 * Returns true if the TLS certificate is valid (any HTTP status code received).
 * Returns false if the certificate is not yet provisioned (timeout or TLS error).
 */
async function checkTLSCertificate(domain: string): Promise<boolean> {
	try {
		await fetch(`https://${domain}`, {
			method: 'HEAD',
			signal: AbortSignal.timeout(timeoutMs),
			redirect: 'manual',
			// @ts-expect-error - cache is supported by Bun's fetch at runtime but missing from type definitions
			cache: 'no-store',
		});
		// Any HTTP response means TLS handshake succeeded and certificate is valid
		return true;
	} catch {
		// Timeout, TLS certificate error, connection refused, etc.
		// All indicate the certificate is not yet provisioned
		return false;
	}
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
	region: string,
	config?: Config | null
): Promise<DNSResult[]> {
	const suffix = config?.overrides?.api_url?.includes('agentuity.io') ? LOCAL_DNS : PRODUCTION_DNS;
	const id = Bun.hash.xxHash64(projectId).toString(16).padStart(16, '0');
	const proxy = `p${id}.${suffix}`;

	// Resolve the ION host A record(s) so we can validate A records
	// and show the user what IP to point their A record to
	const ionHost = getIONHost(config ?? null, region);
	let ionIPs: string[] = [];
	try {
		ionIPs = await fetchDNSRecords(ionHost, 'A');
	} catch {
		// If we can't resolve the ION host, A record validation will be skipped
	}
	const aRecordTarget = ionIPs[0] ?? undefined;

	return Promise.all(
		domains.map(async (domain) => {
			// Detect if user passed a URL instead of a domain name
			if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(domain)) {
				try {
					const url = new URL(domain);
					return {
						domain,
						target: proxy,
						aRecordTarget,
						recordType: 'CNAME',
						success: false,
						error: `Invalid domain format: "${domain}" appears to be a URL. Use just the domain name: "${url.hostname}"`,
					} as DNSError;
				} catch {
					return {
						domain,
						target: proxy,
						aRecordTarget,
						recordType: 'CNAME',
						success: false,
						error: `Invalid domain format: "${domain}" appears to be a URL. Use just the domain name without the protocol (e.g., "example.com" not "https://example.com")`,
					} as DNSError;
				}
			}

			// Step 1: Check CNAME record
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
						// DNS is correct — verify TLS certificate (also triggers Let's Encrypt provisioning)
						const tlsValid = await checkTLSCertificate(domain);
						if (tlsValid) {
							return {
								domain,
								target: proxy,
								aRecordTarget,
								recordType: 'CNAME',
								success: true,
							} as DNSSuccess;
						}
						return {
							domain,
							target: proxy,
							aRecordTarget,
							recordType: 'CNAME',
							success: true,
							pending: true,
						} as DNSPending;
					}
					return {
						domain,
						target: proxy,
						aRecordTarget,
						recordType: 'CNAME',
						success: false,
						misconfigured: `CNAME record points to ${result}`,
					} as DNSMisconfigured;
				}
			} catch (ex) {
				const _ex = ex as { code: string; message?: string };
				if (_ex.message?.includes('timed out')) {
					return {
						domain,
						target: proxy,
						aRecordTarget,
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
						aRecordTarget,
						recordType: 'CNAME',
						success: false,
						error: errMsg,
					} as DNSError;
				}
				// ENOTFOUND: no CNAME record exists, fall through to A record check
			}

			// Step 2: Check A record (supports apex domains and ALIAS/ANAME/CNAME-flattening)
			if (ionIPs.length > 0) {
				try {
					let aTimeoutId: Timer | undefined;

					const aTimeoutPromise = new Promise<never>((_, reject) => {
						aTimeoutId = setTimeout(() => {
							reject(new DNSTimeoutError());
						}, timeoutMs);
					});

					const domainARecords = await Promise.race([
						fetchDNSRecords(domain, 'A'),
						aTimeoutPromise,
					]).finally(() => {
						if (aTimeoutId) clearTimeout(aTimeoutId);
					});

					if (domainARecords.length > 0) {
						const matching = domainARecords.some((a) => ionIPs.includes(a));
						if (matching) {
							// DNS is correct — verify TLS certificate (also triggers Let's Encrypt provisioning)
							const tlsValid = await checkTLSCertificate(domain);
							if (tlsValid) {
								return {
									domain,
									target: proxy,
									aRecordTarget,
									recordType: 'A',
									success: true,
								} as DNSSuccess;
							}
							return {
								domain,
								target: proxy,
								aRecordTarget,
								recordType: 'A',
								success: true,
								pending: true,
							} as DNSPending;
						}
						return {
							domain,
							target: proxy,
							aRecordTarget,
							recordType: 'A',
							success: false,
							misconfigured: `A record points to ${domainARecords[0]}, expected ${aRecordTarget}`,
						} as DNSMisconfigured;
					}
				} catch {
					// A record check failed, fall through to missing
				}
			}

			return {
				domain,
				success: false,
				target: proxy,
				aRecordTarget,
				recordType: 'CNAME',
				pending: false,
			} as DNSMissing;
		})
	);
}

export async function promptForDNS(
	projectId: string,
	domains: string[],
	region: string,
	config?: Config,
	resumeFn?: () => () => void
) {
	let paused = false;
	let resume: (() => void) | undefined;
	for (;;) {
		const result = await checkCustomDomainForDNS(projectId, domains, region, config);
		const failed = result.filter((x): x is DNSFailed => !isSuccess(x));
		if (failed.length) {
			const records: {
				domain: string;
				cnameTarget: string;
				aRecordTarget?: string;
				status: string;
			}[] = [];
			result.forEach((r) => {
				if (isSuccess(r)) {
					records.push({
						domain: r.domain,
						cnameTarget: r.target,
						aRecordTarget: r.aRecordTarget,
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
						cnameTarget: r.target,
						aRecordTarget: r.aRecordTarget,
						status: tui.colorWarning(`${tui.ICONS.error} ${r.misconfigured}`),
					});
				} else if (isPending(r)) {
					records.push({
						domain: r.domain,
						cnameTarget: r.target,
						aRecordTarget: r.aRecordTarget,
						status: tui.colorWarning('⌛️ Pending'),
					});
				} else if (isMissing(r)) {
					records.push({
						domain: r.domain,
						cnameTarget: r.target,
						aRecordTarget: r.aRecordTarget,
						status: tui.colorError(`${tui.ICONS.error} Missing`),
					});
				}
			}

			let linesShown = 2; // header + footer
			for (const record of records) {
				console.log();
				console.log(`${tui.colorInfo('Domain:')}  ${tui.colorPrimary(record.domain)}`);
				console.log(`${tui.colorInfo('CNAME:')}   ${tui.colorPrimary(record.cnameTarget)}`);
				if (record.aRecordTarget) {
					console.log(
						`${tui.colorInfo('A:')}       ${tui.colorPrimary(record.aRecordTarget)}`
					);
				}
				console.log(`${tui.colorInfo('Status:')}  ${tui.colorPrimary(record.status)}`);
				console.log();
				linesShown += record.aRecordTarget ? 6 : 5;
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
