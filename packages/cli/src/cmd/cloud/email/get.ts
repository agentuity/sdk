import { z } from 'zod';
import { createCommand } from '../../../types.ts';
import * as tui from '../../../tui.ts';
import { createEmailAdapter, EmailAddressSchema } from './util.ts';

export const getSubcommand = createCommand({
	name: 'get',
	description: 'Get an email address by ID',
	tags: ['read-only', 'requires-auth'],
	requires: { auth: true },
	schema: {
		args: z.object({
			id: z.string().min(1).describe('Email address ID (eaddr_*)'),
		}),
		response: EmailAddressSchema,
	},

	async handler(ctx) {
		const { args, options } = ctx;
		const email = await createEmailAdapter(ctx);
		const address = await email.getAddress(args.id);
		const connection = await email.getConnectionConfig(args.id);

		if (!address) {
			tui.fatal(`Email address not found: ${args.id}`);
		}

		if (!options.json) {
			tui.success(`Email Address: ${tui.bold(address.email)}`);
			console.log('');
			tui.table(
				[
					{
						ID: address.id,
						Email: address.email,
						Created: new Date(address.created_at).toLocaleString(),
					},
				],
				['ID', 'Email', 'Created'],
				{ layout: 'vertical', padStart: '  ' }
			);

			if (connection) {
				const formatTLS = (tls: string) =>
					tls.length > 0 ? `${tls.charAt(0).toUpperCase()}${tls.slice(1)}` : '-';

				console.log('');
				console.log(`  ${tui.bold('IMAP Connection')}`);
				console.log(`  ${tui.muted('─────────────────')}`);
				tui.table(
					[
						{
							Host: connection.imap.host,
							Port: connection.imap.port,
							TLS: formatTLS(connection.imap.tls),
							Username: connection.imap.username,
							Password: connection.imap.password,
						},
					],
					['Host', 'Port', 'TLS', 'Username', 'Password'],
					{ layout: 'vertical', padStart: '  ' }
				);

				console.log('');
				console.log(`  ${tui.bold('POP3 Connection')}`);
				console.log(`  ${tui.muted('─────────────────')}`);
				tui.table(
					[
						{
							Host: connection.pop3.host,
							Port: connection.pop3.port,
							TLS: formatTLS(connection.pop3.tls),
							Username: connection.pop3.username,
							Password: connection.pop3.password,
						},
					],
					['Host', 'Port', 'TLS', 'Username', 'Password'],
					{ layout: 'vertical', padStart: '  ' }
				);
			}
		}

		return address;
	},
});

export default getSubcommand;
