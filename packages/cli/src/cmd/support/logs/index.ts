import { createCommand } from '../../../types';
import show from './show';
import path from './path';

export default createCommand({
	name: 'logs',
	description: 'View and manage CLI execution logs',
	subcommands: [show, path],
});
