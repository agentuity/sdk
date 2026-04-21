import { createFileRoute, redirect } from '@tanstack/react-router';
import { RedirectFallback } from '../../components/docs/RedirectFallback';

const target = '/explorer/schedules';

export const Route = createFileRoute('/explorer/cron')({
	beforeLoad: () => {
		if (typeof window !== 'undefined') {
			throw redirect({ to: target, replace: true });
		}
	},
	component: () => <RedirectFallback target={target} />,
	staticData: { crumb: 'Demo' },
});
