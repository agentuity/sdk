import { createFileRoute, redirect, ScriptOnce } from '@tanstack/react-router';

const target = '/agents/when-to-use';

export const Route = createFileRoute('/_docs/apis/when-to-use')({
	beforeLoad: () => {
		if (typeof window !== 'undefined') {
			throw redirect({ to: target, replace: true });
		}
	},
	component: () => (
		<>
			<ScriptOnce>{`window.location.replace(${JSON.stringify(target)})`}</ScriptOnce>
			<p>
				This page has moved to <a href={target}>{target}</a>. If you are not redirected
				automatically, use this link.
			</p>
		</>
	),
});
