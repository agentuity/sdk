import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../../components/docs/mdx-page';

export const Route = createFileRoute('/_docs/reference/api/email')({
	component: () => <MDXPage route="reference/api/email" />,
	staticData: { crumb: 'Emails' },
});
