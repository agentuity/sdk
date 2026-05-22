import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../../components/docs/mdx-page';

export const Route = createFileRoute('/_docs/reference/api/object-storage')({
	component: () => <MDXPage route="reference/api/object-storage" />,
	staticData: { crumb: 'Object Storage' },
});
