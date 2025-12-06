import { createAgent } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

const crashAttemptsAgent = createAgent('resilience-crash-attempts', {
	description: 'Tests various ways that should NOT crash the server',
	schema: {
		input: s.object({
			scenario: s.string(),
		}),
		output: s.object({
			scenario: s.string(),
			survived: s.boolean(),
			message: s.string(),
		}),
	},
	handler: async (ctx, input) => {
		const { scenario } = input;

		switch (scenario) {
			case 'sync-throw': {
				// Synchronous throw in handler - should be caught by Hono error handler
				throw new Error('Intentional synchronous throw');
			}

			case 'async-throw': {
				// Async throw - should be caught
				await new Promise((resolve) => setTimeout(resolve, 10));
				throw new Error('Intentional async throw');
			}

			case 'waituntil-throw': {
				// Background task throws - should be caught by waitUntil error handler
				ctx.waitUntil(async () => {
					await new Promise((resolve) => setTimeout(resolve, 10));
					throw new Error('Intentional waitUntil throw');
				});
				return {
					scenario,
					survived: true,
					message: 'Background task scheduled with throw',
				};
			}

			case 'waituntil-sync-throw': {
				// Synchronous throw in background task
				ctx.waitUntil(() => {
					throw new Error('Intentional sync waitUntil throw');
				});
				return {
					scenario,
					survived: true,
					message: 'Sync background task scheduled with throw',
				};
			}

			case 'unhandled-promise': {
				// NOTE: We don't actually create an unhandled rejection here because
				// the runtime correctly crashes on unhandled rejections (as it should).
				// This is expected behavior - unhandled rejections indicate bugs.
				return {
					scenario,
					survived: true,
					message: 'Skipped: unhandled rejections correctly crash the server',
				};
			}

			case 'nested-error': {
				// Nested async errors
				const causeError = async () => {
					throw new Error('Inner error');
				};
				
				try {
					await causeError();
				} catch (err) {
					throw new Error('Outer error wrapping inner', { cause: err });
				}
			}

			case 'stack-overflow': {
				// Careful stack overflow - limited recursion
				let depth = 0;
				const recurse = (): any => {
					depth++;
					if (depth > 1000) {
						throw new Error('Recursion limit reached (prevented stack overflow)');
					}
					return recurse();
				};
				
				try {
					recurse();
				} catch (err) {
					return {
						scenario,
						survived: true,
						message: `Caught recursion at depth ${depth}`,
					};
				}
			}

			case 'null-deref': {
				// Null dereference
				const obj: any = null;
				const value = obj.property; // This will throw
				return {
					scenario,
					survived: false,
					message: `Got value: ${value}`,
				};
			}

			case 'type-error': {
				// Type errors
				const num: any = 'not a number';
				const result = num.toFixed(2); // This will throw
				return {
					scenario,
					survived: false,
					message: `Result: ${result}`,
				};
			}

			case 'multiple-waituntil-throws': {
				// Multiple background tasks all throwing
				for (let i = 0; i < 5; i++) {
					ctx.waitUntil(async () => {
						await new Promise((resolve) => setTimeout(resolve, i * 10));
						throw new Error(`Background task ${i} error`);
					});
				}
				return {
					scenario,
					survived: true,
					message: 'Scheduled 5 background tasks that all throw',
				};
			}

			case 'event-listener-throw': {
				// Throw in event listener
				ctx.session.addEventListener('completed', () => {
					throw new Error('Event listener throw');
				});
				return {
					scenario,
					survived: true,
					message: 'Registered event listener that throws',
				};
			}

			case 'process-exit-attempt': {
				// Attempt to call process.exit - should throw an error
				try {
					process.exit(1);
					return {
						scenario,
						survived: false,
						message: 'process.exit did not throw - server would have crashed!',
					};
				} catch (err: any) {
					return {
						scenario,
						survived: true,
						message: `process.exit was blocked: ${err.message}`,
					};
				}
			}

			default:
				return {
					scenario,
					survived: true,
					message: 'Unknown scenario',
				};
		}
	},
});

export default crashAttemptsAgent;
