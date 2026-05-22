import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../../components/docs/mdx-page';

export const Route = createFileRoute('/_docs/reference/api/api-keys')({
	component: () => <MDXPage route="reference/api/api-keys" />,
	staticData: { crumb: 'API Keys' },
});
