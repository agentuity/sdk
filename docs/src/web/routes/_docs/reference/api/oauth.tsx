import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../../components/docs/mdx-page';

export const Route = createFileRoute('/_docs/reference/api/oauth')({
	component: () => <MDXPage route="reference/api/oauth" />,
	staticData: { crumb: 'OAuth Applications' },
});
