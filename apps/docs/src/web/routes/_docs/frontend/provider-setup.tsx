import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../components/docs/mdx-page';

export const Route = createFileRoute('/_docs/frontend/provider-setup')({
	component: () => <MDXPage route="frontend/provider-setup" />,
	staticData: { crumb: 'Provider Setup' },
});
