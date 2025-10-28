import { createSubcommand } from '@/types';
import { runSteps, stepSuccess, stepSkipped, stepError } from '@/steps';

export const stepsSubcommand = createSubcommand({
	name: 'steps',
	description: 'Demo of step progress UI component',

	async handler() {
		await runSteps([
			{
				label: 'Launching application...',
				run: async () => {
					await Bun.sleep(1500);
					return stepSuccess();
				},
			},
			{
				label: 'Installing dependencies...',
				run: async () => {
					await Bun.sleep(2000);
					return stepSuccess();
				},
			},
			{
				label: 'Checking for updates...',
				run: async () => {
					await Bun.sleep(800);
					return stepSkipped('already up to date');
				},
			},
			{
				label: 'Registering service...',
				run: async () => {
					await Bun.sleep(1200);
					return stepSuccess();
				},
			},
			{
				label: 'Building project...',
				run: async () => {
					await Bun.sleep(1800);
					return stepSuccess();
				},
			},
			{
				type: 'progress',
				label: 'Downloading packages...',
				run: async (progress) => {
					// Simulate download with progress updates
					for (let i = 0; i <= 100; i += 10) {
						progress(i);
						await Bun.sleep(200);
					}
					return stepSuccess();
				},
			},
			{
				label: 'Deploying the app ...',
				run: async () => {
					await Bun.sleep(1200);
					return stepError('something bad happened');
				},
			},
		]);
	},
});
