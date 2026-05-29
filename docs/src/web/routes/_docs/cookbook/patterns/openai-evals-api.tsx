import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../../components/docs/mdx-page';

export const Route = createFileRoute('/_docs/cookbook/patterns/openai-evals-api')({
	component: () => <MDXPage route="cookbook/patterns/openai-evals-api" />,
	staticData: { crumb: 'OpenAI Evals API' },
});
