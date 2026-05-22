import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../../components/docs/mdx-page';

export const Route = createFileRoute('/_docs/reference/api/projects')({
	component: () => <MDXPage route="reference/api/projects" />,
	staticData: { crumb: 'Projects' },
});
