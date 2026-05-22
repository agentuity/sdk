import { createFileRoute } from '@tanstack/react-router';
import { DemoView } from '../../components/demo-view';

export const Route = createFileRoute('/explorer/schedules')({
	component: () => <DemoView demoId="schedules" />,
	staticData: { crumb: 'Demo' },
});
