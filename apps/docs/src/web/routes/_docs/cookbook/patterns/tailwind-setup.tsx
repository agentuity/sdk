import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../../components/docs/mdx-page';

export const Route = createFileRoute('/_docs/cookbook/patterns/tailwind-setup')({
	component: () => <MDXPage route="cookbook/patterns/tailwind-setup" />,
	staticData: { crumb: 'Tailwind Setup' },
});
