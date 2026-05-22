import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../../components/docs/mdx-page';

export const Route = createFileRoute('/_docs/reference/sdk-reference/advanced')({
	component: () => <MDXPage route="reference/sdk-reference/advanced" />,
	staticData: { crumb: 'Standalone & Build' },
});
