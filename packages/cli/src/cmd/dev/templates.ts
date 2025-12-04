/* eslint-disable no-control-regex */
import { writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { toCamelCase } from '../../utils/string';

const newAgentTemplate = (name: string) => `import { createAgent } from '@agentuity/runtime';
import { z } from 'zod';

const agent = createAgent({
	metadata: {
        name: '${name}',
        description: 'Add your agent description here',
    },
	schema: {
		input: z.string(),
		output: z.string(),
	},
	handler: async (_c, input) => {
		// TODO: add your code here
		return input;
	},
});

export default agent;
`;

const newAgentRouteTemplate = (name: string) => {
	const camelName = toCamelCase(name);
	return `import { createRouter } from '@agentuity/runtime';
import agent from './agent';

const router = createRouter();

router.get('/', async (c) => {
	// TODO: add your code here
	const output = await c.agent.${camelName}.run('hello world');
	return c.text(output);
});

router.post('/', agent.validator(), async (c) => {
	const data = c.req.valid('json');
	const output = await c.agent.${camelName}.run(data);
	return c.json(output);
});

export default router;

`;
};

const newAPIRouteTemplate = (_name: string) => `import { createRouter } from '@agentuity/runtime';

const router = createRouter();

router.get('/', async (c) => {
	// TODO: add your code here
	return c.text('Hello');
});

export default router;

`;

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
	writeFileSync(join(dir, 'agent.ts'), newAgentTemplate(name));
	writeFileSync(join(dir, 'route.ts'), newAgentRouteTemplate(name));
}

export function createAPITemplates(dir: string) {
	const name = basename(dir);
	if (!isValidDirectoryName(name)) {
		return;
	}
	writeFileSync(join(dir, 'route.ts'), newAPIRouteTemplate(name));
}
