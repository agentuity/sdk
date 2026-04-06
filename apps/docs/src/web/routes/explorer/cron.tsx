import { createFileRoute } from '@tanstack/react-router';
import { DemoView } from '../../components/demo-view';

export const Route = createFileRoute('/explorer/cron')({
	component: () => <DemoView demoId="cron" />,
	staticData: { crumb: 'Demo' },
});
