/**
 * Generic demo module invoker
 *
 * Loads one legacy Explorer demo module and runs it with the local docs
 * context. This helper is excluded from generated sandbox scripts.
 *
 * Usage: bun run src/run/invoke.ts <module-name> '<json-input>'
 *
 * Examples:
 *   bun run src/run/invoke.ts hello '{"name":"World"}'
 *   bun run src/run/invoke.ts vector '{"query":"ergonomic chair","seedData":true}'
 */
const [moduleName, inputJson] = process.argv.slice(2);

if (!moduleName) {
	console.error("Usage: bun run src/run/invoke.ts <module-name> '<json-input>'");
	process.exit(1);
}

const input = inputJson ? JSON.parse(inputJson) : {};

let moduleRunner: { run: (input: unknown) => Promise<unknown> };
try {
	const module = await import(`../agent/${moduleName}/agent`);
	moduleRunner = module.default;
} catch {
	console.error(`Demo module not found: ${moduleName}`);
	process.exit(1);
}

try {
	const result = await moduleRunner.run(input);

	console.log('---OUTPUT---');
	console.log(JSON.stringify(result, null, 2));
} catch (error) {
	console.log('---OUTPUT---');
	console.log(`Error: ${error instanceof Error ? error.message : String(error)}`);
}
