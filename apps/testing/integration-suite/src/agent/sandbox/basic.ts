import { createAgent } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

const sandboxBasicAgent = createAgent('sandbox-basic', {
	description: 'Sandbox service integration tests via ctx.sandbox',
	schema: {
		input: s.object({
			operation: s.string(),
			sandboxId: s.string().optional(),
			command: s.array(s.string()).optional(),
			filePath: s.string().optional(),
			fileContent: s.string().optional(),
			dirPath: s.string().optional(),
			recursive: s.boolean().optional(),
			env: s.record(s.string(), s.string().nullable()).optional(),
		}),
		output: s.object({
			operation: s.string(),
			success: s.boolean(),
			sandboxId: s.string().optional(),
			status: s.string().optional(),
			exitCode: s.number().optional(),
			executionId: s.string().optional(),
			fileContent: s.string().optional(),
			files: s
				.array(s.object({ path: s.string(), size: s.number(), isDir: s.boolean() }))
				.optional(),
			env: s.record(s.string(), s.string()).optional(),
			info: s
				.object({
					sandboxId: s.string(),
					status: s.string(),
				})
				.optional(),
			error: s.string().optional(),
			errorTag: s.string().optional(),
			statusCode: s.number().optional(),
			errorMethod: s.string().optional(),
			errorUrl: s.string().optional(),
			sessionId: s.string().optional(),
		}),
	},
	handler: async (ctx, input) => {
		const { operation, sandboxId } = input;

		try {
			switch (operation) {
				case 'create': {
					const sb = await ctx.sandbox.create();
					return {
						operation,
						success: true,
						sandboxId: sb.id,
						status: sb.status,
					};
				}

				case 'connect': {
					if (!sandboxId) throw new Error('sandboxId required');
					const sb = await ctx.sandbox.connect(sandboxId);
					return {
						operation,
						success: true,
						sandboxId: sb.id,
						status: sb.status,
					};
				}

				case 'execute': {
					if (!sandboxId) throw new Error('sandboxId required');
					const sb = await ctx.sandbox.connect(sandboxId);
					const exec = await sb.execute({
						command: input.command || ['echo', 'hello'],
					});
					return {
						operation,
						success: true,
						sandboxId,
						exitCode: exec.exitCode,
						executionId: exec.executionId,
						status: exec.status,
					};
				}

				case 'write-file': {
					if (!sandboxId) throw new Error('sandboxId required');
					if (!input.filePath || !input.fileContent) {
						throw new Error('filePath and fileContent required');
					}
					const sb = await ctx.sandbox.connect(sandboxId);
					await sb.writeFiles([
						{
							path: input.filePath,
							content: Buffer.from(input.fileContent),
						},
					]);
					return { operation, success: true, sandboxId };
				}

				case 'read-file': {
					if (!sandboxId) throw new Error('sandboxId required');
					if (!input.filePath) throw new Error('filePath required');
					const sb = await ctx.sandbox.connect(sandboxId);
					const stream = await sb.readFile(input.filePath);
					const reader = stream.getReader();
					const chunks: Uint8Array[] = [];
					while (true) {
						const { done, value } = await reader.read();
						if (done) break;
						chunks.push(value);
					}
					const combined = new Uint8Array(chunks.reduce((sum, c) => sum + c.length, 0));
					let offset = 0;
					for (const chunk of chunks) {
						combined.set(chunk, offset);
						offset += chunk.length;
					}
					return {
						operation,
						success: true,
						sandboxId,
						fileContent: new TextDecoder().decode(combined),
					};
				}

				case 'list-files': {
					if (!sandboxId) throw new Error('sandboxId required');
					const sb = await ctx.sandbox.connect(sandboxId);
					const files = await sb.listFiles(input.dirPath);
					return {
						operation,
						success: true,
						sandboxId,
						files: files.map((f) => ({
							path: f.path,
							size: f.size,
							isDir: f.isDir,
						})),
					};
				}

				case 'mkdir': {
					if (!sandboxId) throw new Error('sandboxId required');
					if (!input.dirPath) throw new Error('dirPath required');
					const sb = await ctx.sandbox.connect(sandboxId);
					await sb.mkDir(input.dirPath, input.recursive);
					return { operation, success: true, sandboxId };
				}

				case 'rmfile': {
					if (!sandboxId) throw new Error('sandboxId required');
					if (!input.filePath) throw new Error('filePath required');
					const sb = await ctx.sandbox.connect(sandboxId);
					await sb.rmFile(input.filePath);
					return { operation, success: true, sandboxId };
				}

				case 'rmdir': {
					if (!sandboxId) throw new Error('sandboxId required');
					if (!input.dirPath) throw new Error('dirPath required');
					const sb = await ctx.sandbox.connect(sandboxId);
					await sb.rmDir(input.dirPath, input.recursive);
					return { operation, success: true, sandboxId };
				}

				case 'set-env': {
					if (!sandboxId) throw new Error('sandboxId required');
					if (!input.env) throw new Error('env required');
					const sb = await ctx.sandbox.connect(sandboxId);
					const env = await sb.setEnv(input.env);
					return { operation, success: true, sandboxId, env };
				}

				case 'get': {
					if (!sandboxId) throw new Error('sandboxId required');
					const info = await ctx.sandbox.get(sandboxId);
					return {
						operation,
						success: true,
						sandboxId,
						info: { sandboxId: info.sandboxId, status: info.status },
					};
				}

				case 'pause': {
					if (!sandboxId) throw new Error('sandboxId required');
					await ctx.sandbox.pause(sandboxId);
					return { operation, success: true, sandboxId };
				}

				case 'resume': {
					if (!sandboxId) throw new Error('sandboxId required');
					await ctx.sandbox.resume(sandboxId);
					return { operation, success: true, sandboxId };
				}

				case 'destroy': {
					if (!sandboxId) throw new Error('sandboxId required');
					await ctx.sandbox.destroy(sandboxId);
					return { operation, success: true, sandboxId };
				}

				case 'run': {
					const result = await ctx.sandbox.run({
						command: { exec: input.command || ['echo', 'hello from run'] },
					});
					return {
						operation,
						success: true,
						sandboxId: result.sandboxId,
						exitCode: result.exitCode,
					};
				}

				default:
					throw new Error(`Unknown operation: ${operation}`);
			}
		} catch (err) {
			const e = err as Record<string, unknown>;
			return {
				operation,
				success: false,
				sandboxId,
				error: err instanceof Error ? err.message : String(err),
				errorTag: typeof e._tag === 'string' ? e._tag : undefined,
				statusCode: typeof e.statusCode === 'number' ? e.statusCode : undefined,
				errorMethod: typeof e.method === 'string' ? e.method : undefined,
				errorUrl: typeof e.url === 'string' ? e.url : undefined,
				sessionId: typeof e.sessionId === 'string' ? e.sessionId : undefined,
			};
		}
	},
});

export default sandboxBasicAgent;
