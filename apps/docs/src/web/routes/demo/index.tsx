import { createFileRoute, redirect } from '@tanstack/react-router';
import { RedirectFallback } from '../../components/docs/RedirectFallback';

const target = '/explorer';

export const Route = createFileRoute('/demo/')({
	beforeLoad: () => {
		if (typeof window !== 'undefined') {
			throw redirect({ to: target, replace: true });
		}
	},
	component: () => <RedirectFallback target={target} />,
});
