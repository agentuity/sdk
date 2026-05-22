import type { Actions } from './$types';
import { translate } from '$lib/server/translate';

export const actions: Actions = {
	default: async ({ request }) => {
		const formData = await request.formData();
		const text = formData.get('text') as string;
		const toLanguage = formData.get('toLanguage') as string;
		const model = (formData.get('model') as string) || 'openai/gpt-4o-mini';

		return translate({ text, toLanguage, model });
	},
};
