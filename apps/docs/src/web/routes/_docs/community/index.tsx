import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../components/docs/mdx-page';

export const Route = createFileRoute('/_docs/community/')({
	component: () => <MDXPage route="community" />,
	staticData: { crumb: 'Community' },
});
