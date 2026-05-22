import { createFileRoute } from '@tanstack/react-router';
import { DemoView } from '../../components/demo-view';

export const Route = createFileRoute('/explorer/websocket')({
	component: () => <DemoView demoId="websocket" />,
	staticData: { crumb: 'Demo' },
});
