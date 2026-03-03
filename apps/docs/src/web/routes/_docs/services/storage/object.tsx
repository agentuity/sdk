import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../../components/docs/mdx-page.tsx';

export const Route = createFileRoute('/_docs/services/storage/object')({
	component: () => <MDXPage route="services/storage/object" />,
	staticData: { crumb: 'Object' },
});
