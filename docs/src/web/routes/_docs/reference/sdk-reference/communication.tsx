import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../../components/docs/mdx-page';

export const Route = createFileRoute('/_docs/reference/sdk-reference/communication')({
	component: () => <MDXPage route="reference/sdk-reference/communication" />,
	staticData: { crumb: 'Communication' },
});
