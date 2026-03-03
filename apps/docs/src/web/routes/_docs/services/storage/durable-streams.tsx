import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../../components/docs/mdx-page.tsx';

export const Route = createFileRoute('/_docs/services/storage/durable-streams')({
	component: () => <MDXPage route="services/storage/durable-streams" />,
	staticData: { crumb: 'Durable Streams' },
});
