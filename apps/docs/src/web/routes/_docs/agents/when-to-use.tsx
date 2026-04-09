import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../components/docs/mdx-page';

export const Route = createFileRoute('/_docs/agents/when-to-use')({
	component: () => <MDXPage route="agents/when-to-use" />,
	staticData: { crumb: 'When to Use' },
});
