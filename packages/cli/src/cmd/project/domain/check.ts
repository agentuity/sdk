import { z } from 'zod';
import { createSubcommand } from '../../../types';
import * as tui from '../../../tui';
import { getCommand } from '../../../command-prefix';
import { loadProjectConfig } from '../../../config';
import { isJSONMode } from '../../../output';
import {
	checkCustomDomainForDNS,
	isSuccess,
	isPending,
	isMissing,
	isMisconfigured,
	isError,
} from '../../../domain';

export const checkSubcommand = createSubcommand({
	name: 'check',
	description: 'Check DNS configuration for custom domains',
	tags: ['read-only', 'slow', 'requires-auth', 'requires-project'],
	requires: { auth: true, project: true },
	idempotent: true,
	examples: [
		{
			command: getCommand('project domain check'),
			description: 'Check all configured domains',
		},
		{
			command: getCommand('project domain check --domain example.com'),
			description: 'Check a specific domain',
		},
	],
	schema: {
		options: z.object({
			domain: z.string().optional().describe('Specific domain to check'),
		}),
		response: z.object({
			domains: z.array(
				z.object({
					domain: z.string(),
					recordType: z.string(),
					target: z.string(),
					aRecordTarget: z.string().optional(),
					status: z.string(),
					success: z.boolean(),
				})
			),
		}),
	},

	async handler(ctx) {
		const { opts, options, projectDir, config, project } = ctx;
		const jsonMode = isJSONMode(options);

		// Determine which domains to check
		let domainsToCheck: string[];

		if (opts?.domain) {
			domainsToCheck = [opts.domain.toLowerCase().trim()];
		} else {
			const projectConfig = await loadProjectConfig(projectDir, config);
			domainsToCheck = projectConfig.deployment?.domains ?? [];
		}

		if (domainsToCheck.length === 0) {
			if (!jsonMode) {
				tui.info('No custom domains configured for this project');
				tui.info(`Use ${tui.bold(getCommand('project add domain <domain>'))} to add one`);
			}
			return { domains: [] };
		}

		const results = jsonMode
			? await checkCustomDomainForDNS(project.projectId, domainsToCheck, project.region, config)
			: await tui.spinner({
					message: `Checking DNS for ${domainsToCheck.length} ${tui.plural(domainsToCheck.length, 'domain', 'domains')}`,
					clearOnSuccess: true,
					callback: () =>
						checkCustomDomainForDNS(
							project.projectId,
							domainsToCheck,
							project.region,
							config
						),
				});

		const domainResults = results.map((r) => {
			let status: string;
			let statusRaw: string;
			let success = false;

			if (isSuccess(r)) {
				status = tui.colorSuccess(`${tui.ICONS.success} Configured`);
				statusRaw = 'configured';
				success = true;
			} else if (isPending(r)) {
				status = tui.colorWarning('⏳ Pending');
				statusRaw = 'pending';
			} else if (isMisconfigured(r)) {
				status = tui.colorWarning(`${tui.ICONS.warning} ${r.misconfigured}`);
				statusRaw = 'misconfigured';
			} else if (isError(r)) {
				status = tui.colorError(`${tui.ICONS.error} ${r.error}`);
				statusRaw = 'error';
			} else if (isMissing(r)) {
				status = tui.colorError(`${tui.ICONS.error} Missing`);
				statusRaw = 'missing';
			} else {
				status = tui.colorError(`${tui.ICONS.error} Unknown`);
				statusRaw = 'unknown';
			}

			return {
				domain: r.domain,
				recordType: r.recordType,
				target: r.target,
				aRecordTarget: r.aRecordTarget,
				status,
				statusRaw,
				success,
			};
		});

		if (!jsonMode) {
			tui.newline();
			for (const r of domainResults) {
				console.log(`  ${tui.colorInfo('Domain:')}  ${tui.colorPrimary(r.domain)}`);
				console.log(`  ${tui.colorInfo('CNAME:')}   ${tui.colorPrimary(r.target)}`);
				if (r.aRecordTarget) {
					console.log(`  ${tui.colorInfo('A:')}       ${tui.colorPrimary(r.aRecordTarget)}`);
				}
				console.log(`  ${tui.colorInfo('Status:')}  ${r.status}`);
				console.log();
			}

			const allGood = domainResults.every((r) => r.success);
			if (allGood) {
				tui.success('All domains are correctly configured');
			} else {
				const failCount = domainResults.filter((r) => !r.success).length;
				tui.warning(
					`${failCount} ${tui.plural(failCount, 'domain has', 'domains have')} DNS issues — add a CNAME or A record pointing to one of the targets shown above`
				);
			}
		}

		return {
			domains: domainResults.map((r) => ({
				domain: r.domain,
				recordType: r.recordType,
				target: r.target,
				aRecordTarget: r.aRecordTarget,
				status: r.statusRaw,
				success: r.success,
			})),
		};
	},
});
