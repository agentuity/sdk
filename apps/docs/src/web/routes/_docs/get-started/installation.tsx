import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../components/docs/mdx-page';

export const Route = createFileRoute('/_docs/get-started/installation')({
	component: () => <MDXPage route="get-started/installation" />,
	staticData: { crumb: 'Installation' },
});
