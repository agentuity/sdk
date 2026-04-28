import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../components/docs/mdx-page';

export const Route = createFileRoute('/_docs/frameworks/react-router')({
	component: () => <MDXPage route="frameworks/react-router" />,
	staticData: { crumb: 'React Router' },
});
