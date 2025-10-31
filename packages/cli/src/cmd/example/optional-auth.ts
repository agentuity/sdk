import type { SubcommandDefinition, CommandContext, AuthData } from '../../types';
import * as tui from '../../tui';

export const optionalAuthSubcommand: SubcommandDefinition = {
	name: 'optional-auth',
	description: 'Test optional authentication flow',
	optionalAuth: 'Continue with local features only',
	handler: async (ctx: CommandContext) => {
		tui.newline();

		// Type guard to check if auth is present
		const ctxWithAuth = ctx as CommandContext<true>;
		if (ctxWithAuth.auth) {
			const auth = ctxWithAuth.auth as AuthData;
			// User chose to authenticate
			tui.success('You are authenticated!');
			tui.info(`User ID: ${auth.userId}`);
			tui.info(`Session expires: ${auth.expires.toLocaleString()}`);
			tui.newline();
			tui.info('You can now access cloud features:');
			tui.bullet('Deploy to production');
			tui.bullet('Access remote resources');
			tui.bullet('View team analytics');
		} else {
			// User chose to continue without auth
			tui.info('Running in local mode (no authentication)');
			tui.newline();
			tui.info('Available local features:');
			tui.bullet('Local development');
			tui.bullet('Offline testing');
			tui.bullet('Build and bundle');
			tui.newline();
			tui.warning('Some cloud features are unavailable without authentication');
		}

		tui.newline();
	},
};
