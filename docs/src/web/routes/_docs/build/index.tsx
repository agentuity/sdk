import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../components/docs/mdx-page';

export const Route = createFileRoute('/_docs/build/')({
	component: () => <MDXPage route="build" />,
	staticData: { crumb: 'Build' },
});
