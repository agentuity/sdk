import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../../components/docs/mdx-page';

export const Route = createFileRoute('/_docs/reference/cli/monitoring')({
	component: () => <MDXPage route="reference/cli/monitoring" />,
	staticData: { crumb: 'Monitoring' },
});
