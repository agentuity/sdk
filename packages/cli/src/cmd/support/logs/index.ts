import { createCommand } from '../../../types.ts';
import show from './show.ts';
import path from './path.ts';

export default createCommand({
	name: 'logs',
	description: 'View and manage CLI execution logs',
	subcommands: [show, path],
});
