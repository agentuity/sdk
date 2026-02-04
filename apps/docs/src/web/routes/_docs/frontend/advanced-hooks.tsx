import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../components/docs/mdx-page';

export const Route = createFileRoute('/_docs/frontend/advanced-hooks')({
	component: () => <MDXPage route="frontend/advanced-hooks" />,
	staticData: { crumb: 'Advanced Hooks' },
});
