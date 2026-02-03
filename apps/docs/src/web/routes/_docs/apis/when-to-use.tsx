import { createFileRoute } from '@tanstack/react-router';
import { PlaceholderPage } from '../../../components/docs/placeholder-page';

export const Route = createFileRoute('/_docs/apis/when-to-use')({
	component: () => (
		<PlaceholderPage title="When to Use APIs" description="Understand when to use APIs vs agents." />
	),
	staticData: { crumb: 'When to Use' },
});
