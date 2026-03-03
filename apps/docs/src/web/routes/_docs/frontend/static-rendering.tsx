import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../components/docs/mdx-page';

export const Route = createFileRoute('/_docs/frontend/static-rendering')({
	component: () => <MDXPage route="frontend/static-rendering" />,
	staticData: { crumb: 'Static Rendering' },
});
