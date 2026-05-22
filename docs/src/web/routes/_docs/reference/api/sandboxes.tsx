import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../../components/docs/mdx-page';

export const Route = createFileRoute('/_docs/reference/api/sandboxes')({
	component: () => <MDXPage route="reference/api/sandboxes" />,
	staticData: { crumb: 'Sandboxes' },
});
