import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../../components/docs/mdx-page.tsx';

export const Route = createFileRoute('/_docs/services/storage/key-value')({
	component: () => <MDXPage route="services/storage/key-value" />,
	staticData: { crumb: 'Key-Value' },
});
