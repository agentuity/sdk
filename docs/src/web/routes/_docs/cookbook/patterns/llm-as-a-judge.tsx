import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../../components/docs/mdx-page';

export const Route = createFileRoute('/_docs/cookbook/patterns/llm-as-a-judge')({
	component: () => <MDXPage route="cookbook/patterns/llm-as-a-judge" />,
	staticData: { crumb: 'LLM as a Judge' },
});
