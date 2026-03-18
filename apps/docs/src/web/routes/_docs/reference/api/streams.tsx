import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../../components/docs/mdx-page';

export const Route = createFileRoute('/_docs/reference/api/streams')({
	component: () => <MDXPage route="reference/api/streams" />,
	staticData: { crumb: 'Durable Streams' },
});
