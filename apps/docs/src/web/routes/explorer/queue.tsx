import { createFileRoute } from '@tanstack/react-router';
import { DemoView } from '../../components/demo-view';

export const Route = createFileRoute('/explorer/queue')({
	component: () => <DemoView demoId="queue" />,
	staticData: { crumb: 'Demo' },
});
