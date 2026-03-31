import { createFileRoute, redirect, ScriptOnce, useParams } from '@tanstack/react-router';

export const Route = createFileRoute('/demo/$')({
	beforeLoad: ({ params }) => {
		const target = `/explorer/${params._splat}`;
		if (typeof window !== 'undefined') {
			throw redirect({ to: target, replace: true });
		}
	},
	component: function DemoSplatRedirect() {
		const { _splat } = useParams({ from: '/demo/$' });
		const target = `/explorer/${_splat}`;
		return (
			<>
				<ScriptOnce>{`window.location.replace(${JSON.stringify(target)})`}</ScriptOnce>
				<p>
					This page has moved to <a href={target}>{target}</a>. If you are not redirected
					automatically, use this link.
				</p>
			</>
		);
	},
});
