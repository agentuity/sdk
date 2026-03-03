import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../components/docs/mdx-page.tsx';

export const Route = createFileRoute('/_docs/get-started/quickstart')({
	component: () => <MDXPage route="get-started/quickstart" />,
	staticData: { crumb: 'Quickstart' },
});
