import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../components/docs/mdx-page';

export const Route = createFileRoute('/_docs/patterns/')({
	component: () => <MDXPage route="patterns" />,
	staticData: { crumb: 'Patterns' },
});
