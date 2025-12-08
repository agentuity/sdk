/* eslint-disable no-control-regex */
import { writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { toPascalCase } from '../../utils/string';

const newAgentTemplate = (name: string) => `import { createAgent } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

export default createAgent('${name}', {
	description: 'Add your agent description here',
	schema: {
		input: s.string(),
		output: s.string(),
	},
	handler: async (_c, input) => {
		// TODO: add your code here
		return input;
	},
});
`;

const newAgentIndexTemplate = (_name: string) => `export { default } from './agent';
`;

const newRouteTemplate = () => {
	return `import { createRouter } from '@agentuity/runtime';

const router = createRouter();

router.get('/', async (c) => {
	// TODO: add your code here - for now we just echo back what you sent
	return c.text(output);
});

export default router;
`;
};

const invalidDirRegex = /[<>:"/\\|?*]/;

// biome-ignore lint/suspicious/noControlCharactersInRegex: checking for invalid control characters in directory names
const invalidControlChars = /[\u0000-\u001F]/;
const reservedWindowsNames = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
const invalidTrailing = /[. ]$/;

function isValidDirectoryName(name: string): boolean {
	return (
		!invalidDirRegex.test(name) &&
		!invalidControlChars.test(name) &&
		!reservedWindowsNames.test(name) &&
		!invalidTrailing.test(name)
	);
}

export function createAgentTemplates(dir: string) {
	const name = basename(dir);
	if (!isValidDirectoryName(name)) {
		return;
	}
	const agentName = toPascalCase(name);
	writeFileSync(join(dir, 'agent.ts'), newAgentTemplate(agentName));
	writeFileSync(join(dir, 'index.ts'), newAgentIndexTemplate(agentName));
}

export function createAPITemplates(dir: string) {
	const name = basename(dir);
	if (!isValidDirectoryName(name)) {
		return;
	}
	writeFileSync(join(dir, 'index.ts'), newRouteTemplate());
}
