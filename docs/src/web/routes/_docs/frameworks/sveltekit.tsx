import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../components/docs/mdx-page';

export const Route = createFileRoute('/_docs/frameworks/sveltekit')({
	component: () => <MDXPage route="frameworks/sveltekit" />,
	staticData: { crumb: 'SvelteKit' },
});
