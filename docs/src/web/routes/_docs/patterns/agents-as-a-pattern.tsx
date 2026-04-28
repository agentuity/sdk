import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../components/docs/mdx-page';

export const Route = createFileRoute('/_docs/patterns/agents-as-a-pattern')({
	component: () => <MDXPage route="patterns/agents-as-a-pattern" />,
	staticData: { crumb: 'Agents as a Pattern' },
});
