import { createFileRoute } from '@tanstack/react-router';
import { DemoView } from '../../components/demo-view';

export const Route = createFileRoute('/demo/webrtc')({
	component: () => <DemoView demoId="webrtc" />,
	staticData: { crumb: 'Demo' },
});
