import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../../components/docs/mdx-page';

export const Route = createFileRoute('/_docs/services/sandbox/')({
	component: () => <MDXPage route="services/sandbox" />,
	staticData: { crumb: 'Sandbox' },
});
