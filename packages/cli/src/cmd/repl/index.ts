import { createCommand } from '../../types';
import { createRepl, type ReplCommand } from '../../repl';
import { z } from 'zod';

export const command = createCommand({
	name: 'repl',
	hidden: true,
	description: 'interactive REPL for testing',

	async handler() {
		// Define test commands
		const commands: ReplCommand[] = [
			{
				name: 'keyvalue',
				aliases: ['kv'],
				description: 'Echo back the arguments',
				schema: {
					args: z.tuple([z.string().min(1)]).rest(z.string()),
					argNames: ['action'],
				},
				handler: (ctx) => {
					ctx.write(ctx.parsed.args.join(' '));
				},
			},
			{
				name: 'echoall',
				description: 'Echo all arguments with separators',
				handler: (ctx) => {
					if (ctx.parsed.args.length === 0) {
						ctx.error('Usage: echoall <args...>');
						return;
					}
					ctx.write(ctx.parsed.args.map((arg, i) => `[${i + 1}] ${arg}`).join('\n'));
				},
			},
			{
				name: 'echofile',
				description: 'Echo as if writing to a file',
				handler: (ctx) => {
					if (ctx.parsed.args.length === 0) {
						ctx.error('Usage: echofile <content>');
						return;
					}
					ctx.success(`Would write to file: ${ctx.parsed.args.join(' ')}`);
				},
			},
			{
				name: 'upper',
				description: 'Convert text to uppercase',
				aliases: ['up'],
				handler: (ctx) => {
					if (ctx.parsed.args.length === 0) {
						ctx.error('Usage: upper <text>');
						return;
					}
					ctx.success(ctx.parsed.args.join(' ').toUpperCase());
				},
			},
			{
				name: 'lower',
				description: 'Convert text to lowercase',
				aliases: ['down'],
				handler: (ctx) => {
					if (ctx.parsed.args.length === 0) {
						ctx.error('Usage: lower <text>');
						return;
					}
					ctx.success(ctx.parsed.args.join(' ').toLowerCase());
				},
			},
			{
				name: 'count',
				description: 'Count from 1 to N (with optional delay)',
				schema: {
					args: z.tuple([z.coerce.number().int().positive().default(5)]),
					argNames: ['number'],
					options: z.object({
						delay: z.coerce.number().int().positive().default(100).optional(),
					}),
				},
				handler: async function* (ctx) {
					const count = parseInt(ctx.parsed.args[0] || '5', 10);
					const delay = parseInt(ctx.parsed.options.delay as string, 10) || 100;

					for (let i = 1; i <= count; i++) {
						yield `${i}`;
						if (i < count) {
							yield ', ';
						}
						await new Promise((resolve) => setTimeout(resolve, delay));
					}
				},
			},
			{
				name: 'longoutput',
				description: 'Generate long output to test paging',
				aliases: ['long'],
				handler: (ctx) => {
					const lines = parseInt(ctx.parsed.args[0] || '50', 10);
					for (let i = 1; i <= lines; i++) {
						ctx.write(
							`Line ${i}: This is a test line to demonstrate output paging in the REPL`
						);
					}
				},
			},
			{
				name: 'download',
				description: 'Simulate a download with progress updates',
				schema: {
					args: z.tuple([z.coerce.number().int().positive().default(5)]),
					argNames: ['chunks'],
				},
				handler: async (ctx) => {
					const chunks = parseInt(ctx.parsed.args[0] || '5', 10);

					for (let i = 1; i <= chunks; i++) {
						// Check if aborted
						if (ctx.signal.aborted) {
							return; // Just return, abort will be detected
						}

						ctx.setProgress(`Downloading chunk ${i}/${chunks}`);

						// Use signal with setTimeout for proper abort handling
						await new Promise((resolve) => {
							const timeout = setTimeout(resolve, 500);
							ctx.signal.addEventListener(
								'abort',
								() => {
									clearTimeout(timeout);
									resolve(undefined); // Resolve to exit cleanly
								},
								{ once: true }
							);
						});
					}

					if (ctx.signal.aborted) return;

					ctx.setProgress('Processing downloaded data');
					await new Promise((resolve) => {
						const timeout = setTimeout(resolve, 1000);
						ctx.signal.addEventListener(
							'abort',
							() => {
								clearTimeout(timeout);
								resolve(undefined);
							},
							{ once: true }
						);
					});

					if (!ctx.signal.aborted) {
						ctx.success(`Downloaded ${chunks} chunks successfully!`);
					}
				},
			},
			{
				name: 'greet',
				description: 'Greet a person with optional title',
				schema: {
					args: z.tuple([z.string().min(1)]),
					argNames: ['name'],
					options: z.object({
						title: z.string().optional(),
						loud: z.boolean().optional(),
					}),
				},
				handler: (ctx) => {
					const name = ctx.parsed.args[0];
					const title = ctx.parsed.options.title || '';
					const greeting = title ? `Hello, ${title} ${name}!` : `Hello, ${name}!`;

					if (ctx.parsed.options.loud) {
						ctx.success(greeting.toUpperCase());
					} else {
						ctx.success(greeting);
					}
				},
			},
			{
				name: 'options',
				description: 'Show all parsed options for debugging',
				handler: (ctx) => {
					ctx.info('Parsed command:');
					ctx.json(ctx.parsed);
				},
			},
			{
				name: 'json',
				description: 'Display JSON data in colorized format',
				schema: {
					args: z.tuple([z.string().optional()]),
					argNames: ['data'],
				},
				handler: (ctx) => {
					const input = ctx.parsed.args.join(' ').trim();

					if (!input) {
						// Show example JSON
						ctx.json({
							users: [
								{ id: 1, name: 'Alice', active: true, tags: ['admin', 'user'] },
								{ id: 2, name: 'Bob', active: false, tags: ['user'] },
							],
							metadata: {
								total: 2,
								timestamp: new Date().toISOString(),
							},
						});
						return;
					}

					// Try to parse input as JSON
					try {
						const parsed = JSON.parse(input);
						ctx.json(parsed);
					} catch {
						ctx.error('Invalid JSON input');
					}
				},
			},
			{
				name: 'kv',
				description: 'Key-value store commands',
				subcommands: [
					{
						name: 'set',
						description: 'Set a key-value pair',
						schema: {
							args: z.tuple([z.string().min(1), z.string()]),
							argNames: ['key', 'value'],
						},
						handler: (ctx) => {
							const [key, value] = ctx.parsed.args;
							ctx.success(`Set ${key} = ${value}`);
						},
					},
					{
						name: 'get',
						description: 'Get a value by key',
						schema: {
							args: z.tuple([z.string().min(1)]),
							argNames: ['key'],
						},
						handler: (ctx) => {
							const key = ctx.parsed.args[0];
							ctx.write(`Value for ${key}: (example value)`);
						},
					},
					{
						name: 'del',
						description: 'Delete a key',
						aliases: ['delete', 'rm'],
						schema: {
							args: z.tuple([z.string().min(1)]),
							argNames: ['key'],
						},
						handler: (ctx) => {
							const key = ctx.parsed.args[0];
							ctx.success(`Deleted ${key}`);
						},
					},
				],
			},
			{
				name: 'vector',
				description: 'Vector store commands',
				subcommands: [
					{
						name: 'set',
						description: 'Store a vector',
						schema: {
							args: z.tuple([z.string().min(1), z.string()]),
							argNames: ['id', 'vector'],
						},
						handler: (ctx) => {
							const [id, _vector] = ctx.parsed.args;
							ctx.success(`Stored vector ${id}`);
						},
					},
					{
						name: 'get',
						description: 'Retrieve a vector by ID',
						schema: {
							args: z.tuple([z.string().min(1)]),
							argNames: ['id'],
						},
						handler: (ctx) => {
							const id = ctx.parsed.args[0];
							ctx.write(`Vector for ${id}: [0.1, 0.2, 0.3, ...]`);
						},
					},
				],
			},
			{
				name: 'sql',
				description: 'Execute a mock SQL query and display results',
				schema: {
					args: z.tuple([z.string().min(1)]).rest(z.string()),
					argNames: ['query'],
				},
				handler: (ctx) => {
					const query = ctx.parsed.args.join(' ').trim();

					if (!query) {
						ctx.error('Usage: sql <query>');
						return;
					}

					// Simulate different query results based on query pattern
					const queryLower = query.toLowerCase();

					if (queryLower.includes('select') && queryLower.includes('users')) {
						// Mock user table
						ctx.table(
							[
								{ name: 'id', alignment: 'right' },
								{ name: 'name', alignment: 'left' },
								{ name: 'email', alignment: 'left' },
								{ name: 'active', alignment: 'center' },
								{ name: 'created_at', alignment: 'left' },
							],
							[
								{
									id: 1,
									name: 'Alice Johnson',
									email: 'alice@example.com',
									active: 'Yes',
									created_at: '2024-01-15 10:30:00',
								},
								{
									id: 2,
									name: 'Bob Smith',
									email: 'bob@example.com',
									active: 'Yes',
									created_at: '2024-02-20 14:15:00',
								},
								{
									id: 3,
									name: 'Carol Williams',
									email: 'carol@example.com',
									active: 'No',
									created_at: '2024-03-10 09:00:00',
								},
							]
						);
						ctx.info('3 rows returned');
					} else if (queryLower.includes('select') && queryLower.includes('products')) {
						// Mock product table
						ctx.table(
							[
								{ name: 'id', alignment: 'right' },
								{ name: 'name', alignment: 'left' },
								{ name: 'price', alignment: 'right' },
								{ name: 'stock', alignment: 'right' },
								{ name: 'category', alignment: 'left' },
							],
							[
								{
									id: 101,
									name: 'Laptop Pro',
									price: '$1299.99',
									stock: 45,
									category: 'Electronics',
								},
								{
									id: 102,
									name: 'Wireless Mouse',
									price: '$29.99',
									stock: 120,
									category: 'Accessories',
								},
								{
									id: 103,
									name: 'USB-C Cable',
									price: '$12.99',
									stock: 200,
									category: 'Accessories',
								},
								{
									id: 104,
									name: 'Monitor 27"',
									price: '$349.99',
									stock: 30,
									category: 'Electronics',
								},
							]
						);
						ctx.info('4 rows returned');
					} else if (queryLower.includes('select') && queryLower.includes('orders')) {
						// Mock orders table
						ctx.table(
							[
								{ name: 'order_id', alignment: 'right' },
								{ name: 'user_id', alignment: 'right' },
								{ name: 'total', alignment: 'right' },
								{ name: 'status', alignment: 'left' },
								{ name: 'order_date', alignment: 'left' },
							],
							[
								{
									order_id: 1001,
									user_id: 1,
									total: '$1329.98',
									status: 'Shipped',
									order_date: '2024-11-01',
								},
								{
									order_id: 1002,
									user_id: 2,
									total: '$42.98',
									status: 'Processing',
									order_date: '2024-11-15',
								},
								{
									order_id: 1003,
									user_id: 1,
									total: '$349.99',
									status: 'Delivered',
									order_date: '2024-11-10',
								},
							]
						);
						ctx.info('3 rows returned');
					} else if (
						queryLower.includes('insert') ||
						queryLower.includes('update') ||
						queryLower.includes('delete')
					) {
						// Mock mutation result
						const affected = Math.floor(Math.random() * 5) + 1;
						ctx.success(`Query OK, ${affected} row(s) affected`);
					} else {
						// Generic SELECT result
						ctx.table(
							[
								{ name: 'column1', alignment: 'left' },
								{ name: 'column2', alignment: 'left' },
								{ name: 'column3', alignment: 'left' },
							],
							[
								{
									column1: 'value1',
									column2: 'value2',
									column3: 'value3',
								},
								{
									column1: 'data1',
									column2: 'data2',
									column3: 'data3',
								},
							]
						);
						ctx.info('2 rows returned');
					}
				},
			},
		];

		// Start the REPL
		await createRepl({
			name: 'test',
			prompt: '> ',
			welcome: 'Welcome to the Agentuity REPL! Type "help" or / for available commands.',
			exitMessage: 'Goodbye!',
			commands,
		});
	},
});

export default command;
