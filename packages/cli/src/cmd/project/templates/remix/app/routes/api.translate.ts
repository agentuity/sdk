import { data } from 'react-router';
import type { Route } from './+types/api.translate';
import { translate } from '~/lib/translate';

export async function action({ request }: Route.ActionArgs) {
	const { text, toLanguage, model = 'gpt-4o-mini' } = await request.json();

	try {
		const result = await translate({ text, toLanguage, model });
		return data(result);
	} catch (error) {
		throw data(
			{ message: error instanceof Error ? error.message : 'Translation failed' },
			{ status: 500 }
		);
	}
}
