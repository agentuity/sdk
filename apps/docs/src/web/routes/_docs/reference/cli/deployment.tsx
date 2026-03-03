import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../../components/docs/mdx-page';

export const Route = createFileRoute('/_docs/reference/cli/deployment')({
	component: () => <MDXPage route="reference/cli/deployment" />,
	staticData: { crumb: 'Deployment' },
});
