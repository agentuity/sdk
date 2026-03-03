import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../../components/docs/mdx-page.tsx';

export const Route = createFileRoute('/_docs/reference/cli/storage')({
	component: () => <MDXPage route="reference/cli/storage" />,
	staticData: { crumb: 'Storage' },
});
