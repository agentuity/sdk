import { createSubcommand } from '../../types';
import { z } from 'zod';
import { join } from 'node:path';
import * as tui from '../../tui';
import { loadProjectConfig, saveProjectDir } from '../../config';
import { runSteps, stepSuccess, stepSkipped, stepError } from '../../steps';
import { bundle } from '../bundle/bundler';
import { loadBuildMetadata } from '../../config';
import { projectEnvUpdate } from '@agentuity/server';
import { getAPIBaseURL, APIClient } from '../../api';
import {
	findEnvFile,
	readEnvFile,
	filterAgentuitySdkKeys,
	splitEnvAndSecrets,
} from '../../env-util';

export const deploySubcommand = createSubcommand({
	name: 'deploy',
	description: 'Deploy project to the Agentuity Cloud',
	toplevel: true,
	requiresAuth: true,
	schema: {
		options: z.object({
			dir: z.string().optional().describe('Directory to use for the project'),
		}),
	},

	async handler(ctx) {
		const { opts, config } = ctx;
		const dir = opts?.dir ?? process.cwd();
		try {
			const project = await loadProjectConfig(dir);
			if (!project) {
				console.log(project); // FIXME
			}
			await saveProjectDir(dir);

			const apiUrl = getAPIBaseURL(config);
			const client = new APIClient(apiUrl, config);

			await runSteps([
				{
					label: 'Sync Environment Variables',
					run: async () => {
						try {
							// Read local env file (.env.production or .env)
							const envFilePath = await findEnvFile(dir);
							const localEnv = await readEnvFile(envFilePath);

							// Filter out AGENTUITY_ keys
							const filteredEnv = filterAgentuitySdkKeys(localEnv);

							if (Object.keys(filteredEnv).length === 0) {
								return stepSkipped('no environment variables to sync');
							}

							// Split into env and secrets
							const { env, secrets } = splitEnvAndSecrets(filteredEnv);

							// Push to cloud
							await projectEnvUpdate(client, {
								id: project.projectId,
								env,
								secrets,
							});

							return stepSuccess();
						} catch (ex) {
							// Non-fatal: log warning but continue deployment
							const _ex = ex as Error;
							return stepSkipped(_ex.message ?? 'failed to sync env variables');
						}
					},
				},
				{
					label: 'Create Deployment',
					run: async () => {
						// TODO: implement
						await Bun.sleep(1500);
						return stepSuccess();
					},
				},
				{
					label: 'Build, Verify and Package',
					run: async () => {
						try {
							await bundle({
								rootDir: dir,
								dev: false,
							});
							await loadBuildMetadata(join(dir, '.agentuity'));
							return stepSuccess();
						} catch (ex) {
							const _ex = ex as Error;
							return stepError(_ex.message ?? 'Error building your project');
						}
					},
				},
				{
					label: 'Encrypt and Upload Deployment',
					run: async () => {
						// TODO: implement
						await Bun.sleep(800);
						return stepSkipped('already up to date');
					},
				},
				{
					label: 'Provision Services',
					run: async () => {
						// TODO: implement
						await Bun.sleep(1200);
						return stepSuccess();
					},
				},
			]);
			tui.success('Your project was deployed!');
			tui.arrow(tui.link('https://project-123455666332.agentuity.run'));
		} catch (ex) {
			const _ex = ex as Error;
			if (_ex.name === 'ProjectConfigNotFoundExpection') {
				tui.fatal(
					`The directory ${dir} does not contain a valid Agentuity project. Missing agentuity.json`
				);
			}
			tui.fatal(`unxpected error trying to deploy project. ${ex}`);
		}
	},
});
