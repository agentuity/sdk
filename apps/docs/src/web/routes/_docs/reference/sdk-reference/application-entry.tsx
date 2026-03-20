import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../../components/docs/mdx-page';

export const Route = createFileRoute('/_docs/reference/sdk-reference/application-entry')({
	component: () => <MDXPage route="reference/sdk-reference/application-entry" />,
	staticData: { crumb: 'Application Entry' },
});
