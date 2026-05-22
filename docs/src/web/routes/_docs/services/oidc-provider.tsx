import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../components/docs/mdx-page';

export const Route = createFileRoute('/_docs/services/oidc-provider')({
	component: () => <MDXPage route="services/oidc-provider" />,
	staticData: { crumb: 'OIDC Provider' },
});
