import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../components/docs/mdx-page';

export const Route = createFileRoute('/_docs/build/coding-agent')({
	component: () => <MDXPage route="build/coding-agent" />,
	staticData: { crumb: 'The coding agent is a general-purpose agent' },
});
