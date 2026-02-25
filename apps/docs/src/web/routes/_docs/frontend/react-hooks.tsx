import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../components/docs/mdx-page';

export const Route = createFileRoute('/_docs/frontend/react-hooks')({
	component: () => <MDXPage route="frontend/react-hooks" />,
	staticData: { crumb: 'React Hooks' },
});
