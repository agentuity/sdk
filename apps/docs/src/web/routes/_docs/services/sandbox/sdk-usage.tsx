import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../../components/docs/mdx-page';

export const Route = createFileRoute('/_docs/services/sandbox/sdk-usage')({
	component: () => <MDXPage route="services/sandbox/sdk-usage" />,
	staticData: { crumb: 'SDK Usage' },
});
