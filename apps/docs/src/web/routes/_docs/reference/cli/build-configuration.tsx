import { createFileRoute } from '@tanstack/react-router';
import { PlaceholderPage } from '../../../../components/docs/placeholder-page';

export const Route = createFileRoute('/_docs/reference/cli/build-configuration')({
	component: () => (
		<PlaceholderPage title="CLI: Build Configuration" description="Configure the build process." />
	),
	staticData: { crumb: 'Build Configuration' },
});
