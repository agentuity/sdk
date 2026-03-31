import { ScriptOnce } from '@tanstack/react-router';

export function RedirectFallback({ target }: { target: string }) {
	return (
		<>
			<ScriptOnce>{`window.location.replace(${JSON.stringify(target)})`}</ScriptOnce>
			<p>
				This page has moved to <a href={target}>{target}</a>. If you are not redirected
				automatically, use this link.
			</p>
		</>
	);
}
