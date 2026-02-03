import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../components/docs/mdx-page';

export const Route = createFileRoute('/_docs/services/')({
	component: () => <MDXPage route="services" />,
	staticData: { crumb: 'Services' },
});
