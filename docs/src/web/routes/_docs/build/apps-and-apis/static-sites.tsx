import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../../components/docs/mdx-page';

export const Route = createFileRoute('/_docs/build/apps-and-apis/static-sites')({
	component: () => <MDXPage route="build/apps-and-apis/static-sites" />,
	staticData: { crumb: 'Static Sites' },
});
