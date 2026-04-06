import { createFileRoute, redirect, useParams } from '@tanstack/react-router';
import { RedirectFallback } from '../../components/docs/RedirectFallback';

export const Route = createFileRoute('/demo/$')({
	beforeLoad: ({ params }) => {
		const target = `/explorer/${params._splat}`;
		if (typeof window !== 'undefined') {
			throw redirect({ to: target, replace: true });
		}
	},
	component: function DemoSplatRedirect() {
		const { _splat } = useParams({ from: '/demo/$' });
		return <RedirectFallback target={`/explorer/${_splat}`} />;
	},
});
