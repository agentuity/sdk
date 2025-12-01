import { z } from 'zod';

export const DeployOptionsSchema = z.object({
	tag: z
		.array(z.string())
		.default(['latest'])
		.optional()
		.describe('One or more tags to add to the deployment'),
	logsUrl: z.url().optional().describe('The url to the CI build logs'),
	trigger: z
		.enum(['cli', 'workflow', 'webhook'])
		.default('cli')
		.optional()
		.describe('The trigger that caused the build'),
	commitUrl: z.url().optional().describe('The url to the CI commit'),
	message: z.string().optional().describe('The message to associate with this deployment'),
	provider: z.string().optional().describe('The CI provider name (attempts to autodetect)'),
	event: z
		.enum(['pull_request', 'push', 'manual', 'workflow'])
		.default('manual')
		.optional()
		.describe('The event that triggered the deployment'),
	pullRequestNumber: z.number().optional().describe('the pull request number'),
	pullRequestCommentId: z.string().optional().describe('the pull request comment id'),
	pullRequestURL: z.url().optional().describe('the pull request url'),
});

export type DeployOptions = z.infer<typeof DeployOptionsSchema>;
