import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../../components/docs/mdx-page';

export const Route = createFileRoute('/_docs/reference/api/sessions')({
	component: () => <MDXPage route="reference/api/sessions" />,
	staticData: { crumb: 'Sessions' },
});
