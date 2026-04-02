import { createFileRoute } from '@tanstack/react-router';
import { DemoView } from '../../components/demo-view';

export const Route = createFileRoute('/explorer/schedule')({
	component: () => <DemoView demoId="schedule" />,
	staticData: { crumb: 'Demo' },
});
