import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../components/docs/mdx-page.tsx';

export const Route = createFileRoute('/_docs/reference/gravity-network')({
	component: () => <MDXPage route="reference/gravity-network" />,
	staticData: { crumb: 'Gravity Network' },
});
