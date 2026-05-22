import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../../components/docs/mdx-page';

export const Route = createFileRoute('/_docs/reference/sdk-reference/email-service')({
	component: () => <MDXPage route="reference/sdk-reference/email-service" />,
	staticData: { crumb: 'Email Service' },
});
