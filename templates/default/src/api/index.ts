// Exposes the translate agent via HTTP - validator() auto-validates against the agent's input schema
import { createRouter } from '@agentuity/runtime';
import translate from '@agent/translate';

const api = createRouter();

api.post('/translate', translate.validator(), async (c) => {
	const data = c.req.valid('json');
	const result = await translate.run(data);
	return c.json(result);
});

export default api;
