import { z } from 'zod';
import type { Logger } from '@agentuity/core';
import { createSubcommand, type Config } from '../../../types';
import * as tui from '../../../tui';
import { createPrompt } from '../../../tui';
import { getCommand } from '../../../command-prefix';
import { isDryRunMode, outputDryRun } from '../../../explain';
import { ErrorCode } from '../../../errors';
import { loadProjectConfig, updateProjectConfig } from '../../../config';
import { checkCustomDomainForDNS, isSuccess, isMisconfigured, isError } from '../../../domain';

async function validateDNS(
	domain: string,
	projectId: string,
	config: Config | null,
	logger: Logger
): Promise<void> {
	const results = await tui.spinner({
		message: `Checking DNS for ${domain}`,
		clearOnSuccess: true,
		callback: async () => {
			return checkCustomDomainForDNS(projectId, [domain], config);
		},
	});

	// Handle empty results - DNS validation service returned no data
	if (results.length === 0) {
		logger.fatal(
			`DNS validation failed: no response from DNS validation service for domain "${domain}". ` +
			'Use --skip-validation to add the domain without DNS verification.',
			ErrorCode.VALIDATION_FAILED
		);
	}

	// Safe to assert non-null since we've checked results.length above
	// (logger.fatal never returns - it exits the process)
	const result = results[0]!;
	if (!isSuccess(result)) {
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
		{
			command: getCommand('project add domain staging.example.com --branch staging'),
			description: 'Add a domain for a specific branch',
		},
		{
			command: getCommand('project add domain example.com --branch "*"'),
			description: 'Add a domain for the default/main branch',
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
			branch: z
				.string()
				.optional()
				.describe(
					'Branch to associate this domain with (creates branch-keyed config). Use * for default/main branch'
				),
		}),
		response: z.object({
			success: z.boolean().describe('Whether adding the domain succeeded'),
			domain: z.string().describe('Added domain name'),
			domains: z.array(z.string()).describe('All configured domains'),
			dryRun: z.boolean().optional().describe('True if this was a dry-run preview'),
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
				success: true,
				dryRun: true,
				domain: args.domain,
				domains: [],
			};
		}

		const project = await loadProjectConfig(projectDir, config);

		const domain = args.domain.toLowerCase().trim();

		// Validate domain format
		const domainRegex =
			/^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)+$/;
		if (!domainRegex.test(domain)) {
			logger.fatal('Please enter a valid domain name', ErrorCode.VALIDATION_FAILED);
		}

		let branchKey = opts?.branch;

		// If domains are already in object/branch-keyed format but no --branch flag given,
		// prompt the user to select a branch (interactive) or error (non-interactive)
		if (!branchKey && project.deployment?.domains && !Array.isArray(project.deployment.domains)) {
			const existingMap = project.deployment.domains as Record<string, string[]>;
			const existingBranches = Object.keys(existingMap);

			const isHeadless = !process.stdin.isTTY || !process.stdout.isTTY;
			if (isHeadless) {
				logger.fatal(
					'This project uses branch-keyed domain mapping. Use --branch to specify which branch to add this domain to.\n' +
					`  Existing branches: ${existingBranches.join(', ')}\n` +
					`  Example: ${getCommand(`project add domain ${domain} --branch "*"`)}`,
					ErrorCode.VALIDATION_FAILED
				);
			}

			// Interactive: prompt user to select a branch
			const prompt = createPrompt();
			const NEW_BRANCH_OPTION = '── Add new branch ──';
			const choices = [...existingBranches, NEW_BRANCH_OPTION];

			const selectedBranch = await prompt.select({
				message:
					'This project uses branch-keyed domains. Which branch should this domain be added to?',
				options: choices.map((c) => ({ label: c, value: c })),
			});

			if (selectedBranch === NEW_BRANCH_OPTION) {
				const newBranch = await prompt.text({
					message: 'Enter branch name (use * for default/main branch):',
				});
				branchKey = newBranch;
			} else {
				branchKey = selectedBranch;
			}

			if (process.stdin.isTTY) {
				process.stdin.pause();
			}
		}

		if (branchKey) {
			// Branch-keyed mode
			const existingMap: Record<string, string[]> = Array.isArray(project.deployment?.domains)
				? project.deployment.domains.length > 0
					? { '*': project.deployment.domains } // migrate existing array to '*' key
					: {}
				: ((project.deployment?.domains ?? {}) as Record<string, string[]>);

			const branchDomains = existingMap[branchKey] ?? [];

			if (branchDomains.includes(domain)) {
				if (!options.json) {
					tui.warning(`Domain "${domain}" is already configured for branch "${branchKey}"`);
				}
				return {
					success: false,
					domain,
					domains: branchDomains,
				};
			}

			// Validate DNS unless skipped
			if (!opts?.skipValidation) {
				await validateDNS(domain, project.projectId, config, logger);
			}

			// Update the map
			const updatedMap: Record<string, string[]> = {
				...existingMap,
				[branchKey]: [...branchDomains, domain],
			};
			await updateProjectConfig(
				projectDir,
				{
					deployment: {
						...project.deployment,
						domains: updatedMap,
					},
				} as Parameters<typeof updateProjectConfig>[1],
				config
			);

			if (!options.json) {
				tui.success(`Added domain: ${tui.bold(domain)} for branch: ${tui.bold(branchKey)}`);
				tui.info('Domain will be active after next deployment from that branch');
			}

			return {
				success: true,
				domain,
				domains: updatedMap[branchKey]!,
			};
		}

		// Original flat array mode
		const existingDomains = Array.isArray(project.deployment?.domains)
			? project.deployment.domains
			: [];

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
			await validateDNS(domain, project.projectId, config, logger);
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
