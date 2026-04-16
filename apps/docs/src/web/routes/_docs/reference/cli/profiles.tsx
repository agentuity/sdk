import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../../components/docs/mdx-page';

export const Route = createFileRoute('/_docs/reference/cli/profiles')({
	component: () => <MDXPage route="reference/cli/profiles" />,
	staticData: { crumb: 'Profiles' },
});
