import { createFileRoute } from '@tanstack/react-router';
import { DemoView } from '../../components/demo-view';

export const Route = createFileRoute('/explorer/email')({
	component: () => <DemoView demoId="email" />,
	staticData: { crumb: 'Demo' },
});
