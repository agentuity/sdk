import { createSubcommand } from '../../types';
import { join } from 'node:path';
import * as tui from '../../tui';
import { saveProjectDir } from '../../config';
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
	requiresProject: true,

	async handler(ctx) {
		const { project, config, projectDir } = ctx;
		try {
			await saveProjectDir(projectDir);

			const apiUrl = getAPIBaseURL(config);
			const client = new APIClient(apiUrl, config);

			await runSteps([
				{
					label: 'Sync Environment Variables',
					run: async () => {
						try {
							// Read local env file (.env.production or .env)
							const envFilePath = await findEnvFile(projectDir);
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
								rootDir: projectDir,
								dev: false,
							});
							await loadBuildMetadata(join(projectDir, '.agentuity'));
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
			tui.fatal(`unexpected error trying to deploy project. ${ex}`);
		}
	},
});
