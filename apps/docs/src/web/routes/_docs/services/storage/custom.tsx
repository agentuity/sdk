import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../../components/docs/mdx-page.tsx';

export const Route = createFileRoute('/_docs/services/storage/custom')({
	component: () => <MDXPage route="services/storage/custom" />,
	staticData: { crumb: 'Custom' },
});
