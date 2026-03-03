import { createFileRoute } from '@tanstack/react-router';
import { DemoView } from '../../components/demo-view.tsx';

export const Route = createFileRoute('/demo/cron')({
	component: () => <DemoView demoId="cron" />,
	staticData: { crumb: 'Demo' },
});
