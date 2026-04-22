import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../../components/docs/mdx-page';

export const Route = createFileRoute('/_docs/reference/api/key-value')({
	component: () => <MDXPage route="reference/api/key-value" />,
	staticData: { crumb: 'Key-Value Storage' },
});
