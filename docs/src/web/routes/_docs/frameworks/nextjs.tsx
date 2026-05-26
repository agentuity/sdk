import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../components/docs/mdx-page';

export const Route = createFileRoute('/_docs/frameworks/nextjs')({
	component: () => <MDXPage route="frameworks/nextjs" />,
	staticData: { crumb: 'Next.js' },
});
