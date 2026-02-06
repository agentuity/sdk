import { z } from 'zod';
import { createSubcommand } from '../../../types';
import * as tui from '../../../tui';
import { createPrompt } from '../../../tui';
import { getCommand } from '../../../command-prefix';
import { isDryRunMode, outputDryRun } from '../../../explain';
import { ErrorCode } from '../../../errors';
import { loadProjectConfig, updateProjectConfig } from '../../../config';
import { checkCustomDomainForDNS, isSuccess, isMisconfigured, isError } from '../../../domain';

export const domainSubcommand = createSubcommand({
	name: 'domain',
	aliases: ['dns'],
	description: 'Add a custom domain to the current project',
	tags: ['mutating', 'slow', 'requires-auth', 'requires-project'],
	idempotent: true,
	requires: { auth: true, org: true, region: true, project: true },
	examples: [
		{
			command: getCommand('project add domain example.com'),
			description: 'Add a custom domain',
		},
		{
			command: getCommand('project add domain example.com --skip-validation'),
			description: 'Add a domain without DNS validation',
		},
		{
			command: getCommand('--dry-run project add domain example.com'),
			description: 'Preview adding a domain without making changes',
		},
	],
	schema: {
		args: z.object({
			domain: z.string().describe('Domain name to add'),
		}),
		options: z.object({
			skipValidation: z
				.boolean()
				.optional()
				.describe('Skip DNS validation (domain will be validated on deploy)'),
		}),
		response: z.object({
			success: z.boolean().describe('Whether adding the domain succeeded'),
			domain: z.string().describe('Added domain name'),
			domains: z.array(z.string()).describe('All configured domains'),
		}),
	},

	async handler(ctx) {
		const { args, opts, options, projectDir, config, logger } = ctx;

		if (isDryRunMode(options)) {
			const message = `Would add domain "${args.domain}" to project in ${projectDir}`;
			outputDryRun(message, options);
			if (!options.json) {
				tui.newline();
				tui.info('[DRY RUN] Domain addition skipped');
			}
			return {
				success: false,
				domain: args.domain,
				domains: [],
			};
		}

		const project = await loadProjectConfig(projectDir, config);
		const existingDomains = project.deployment?.domains ?? [];

		const domain = args.domain.toLowerCase().trim();

		// Validate domain format
		const domainRegex =
			/^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)+$/;
		if (!domainRegex.test(domain)) {
			logger.fatal('Please enter a valid domain name', ErrorCode.VALIDATION_FAILED);
		}

		// Check if domain already exists
		if (existingDomains.includes(domain)) {
			if (!options.json) {
				tui.warning(`Domain "${domain}" is already configured for this project`);
			}
			return {
				success: false,
				domain,
				domains: existingDomains,
			};
		}

		// Validate DNS unless skipped
		if (!opts?.skipValidation) {
			const results = await tui.spinner({
				message: `Checking DNS for ${domain}`,
				clearOnSuccess: true,
				callback: async () => {
					return checkCustomDomainForDNS(project.projectId, [domain], config);
				},
			});

			const result = results[0];
			if (result && !isSuccess(result)) {
				if (isError(result)) {
					logger.fatal(`DNS validation failed: ${result.error}`, ErrorCode.VALIDATION_FAILED);
				}

				tui.newline();
				tui.warning('DNS record not yet configured. Please add the following CNAME record:');
				tui.newline();
				tui.output(`  ${tui.colorInfo('Domain:')}  ${tui.colorPrimary(result.domain)}`);
				tui.output(`  ${tui.colorInfo('Type:')}    ${tui.colorPrimary(result.recordType)}`);
				tui.output(`  ${tui.colorInfo('Target:')}  ${tui.colorPrimary(result.target)}`);
				tui.newline();

				if (isMisconfigured(result)) {
					tui.error(`Current configuration: ${result.misconfigured}`);
					tui.newline();
				}

				// In non-interactive mode, fail with guidance
				const isHeadless = !process.stdin.isTTY || !process.stdout.isTTY;
				if (isHeadless) {
					logger.fatal(
						'DNS is not configured. Add the DNS record above and try again, or use --skip-validation',
						ErrorCode.VALIDATION_FAILED
					);
				}

				const prompt = createPrompt();
				const proceed = await prompt.confirm({
					message: 'Add domain anyway? (DNS will be validated on deploy)',
					initial: true,
				});

				if (process.stdin.isTTY) {
					process.stdin.pause();
				}

				if (!proceed) {
					logger.fatal('Operation cancelled', ErrorCode.USER_CANCELLED);
				}
			}
		}

		// Update the project config
		const updatedDomains = [...existingDomains, domain];
		await updateProjectConfig(
			projectDir,
			{
				deployment: {
					...project.deployment,
					domains: updatedDomains,
				},
			},
			config
		);

		if (!options.json) {
			tui.success(`Added domain: ${tui.bold(domain)}`);
			tui.info('Domain will be active after next deployment');
		}

		return {
			success: true,
			domain,
			domains: updatedDomains,
		};
	},
});
