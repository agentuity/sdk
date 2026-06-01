import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../../components/docs/mdx-page';

export const Route = createFileRoute(
	'/_docs/cookbook/patterns/running-external-coding-tools-in-sandbox'
)({
	component: () => <MDXPage route="cookbook/patterns/running-external-coding-tools-in-sandbox" />,
	staticData: { crumb: 'External Coding Tools' },
});
