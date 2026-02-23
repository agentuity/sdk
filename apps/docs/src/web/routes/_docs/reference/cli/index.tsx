import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../../components/docs/mdx-page';

export const Route = createFileRoute('/_docs/reference/cli/')({
	component: () => <MDXPage route="reference/cli" />,
	staticData: { crumb: 'CLI' },
});
