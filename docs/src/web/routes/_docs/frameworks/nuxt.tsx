import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../components/docs/mdx-page';

export const Route = createFileRoute('/_docs/frameworks/nuxt')({
	component: () => <MDXPage route="frameworks/nuxt" />,
	staticData: { crumb: 'Nuxt' },
});
