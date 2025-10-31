import { createSubcommand } from '../../types';
import { z } from 'zod';
import { join } from 'node:path';
import * as tui from '../../tui';
import { loadProjectConfig, saveProjectDir } from '../../config';
import { runSteps, stepSuccess, stepSkipped, stepError } from '../../steps';
import { bundle } from '../bundle/bundler';
import { loadBuildMetadata } from '../../config';

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
		const { opts } = ctx;
		const dir = opts?.dir ?? process.cwd();
		try {
			const project = await loadProjectConfig(dir);
			if (!project) {
				console.log(project); // FIXME
			}
			await saveProjectDir(dir);
			await runSteps([
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
