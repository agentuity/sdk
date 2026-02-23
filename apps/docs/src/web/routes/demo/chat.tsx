import { createFileRoute } from '@tanstack/react-router';
import { DemoView } from '../../components/demo-view';

export const Route = createFileRoute('/demo/chat')({
	component: () => <DemoView demoId="chat" />,
	staticData: { crumb: 'Demo' },
});
