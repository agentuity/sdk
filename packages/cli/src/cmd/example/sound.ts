import type { SubcommandDefinition } from '../../types';
import * as tui from '../../tui';
import { playSound } from '../../sound';

export const soundSubcommand: SubcommandDefinition = {
	name: 'sound',
	description: 'Test completion sound',

	handler() {
		tui.info('Playing completion sound...');
		playSound();
		tui.success('Sound played!');
	},
};
