import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../../components/docs/mdx-page';

export const Route = createFileRoute('/_docs/cookbook/patterns/web-exploration')({
	component: () => <MDXPage route="cookbook/patterns/web-exploration" />,
	staticData: { crumb: 'Web Exploration' },
});
