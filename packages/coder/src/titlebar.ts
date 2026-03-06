import type { ExtensionAPI, ExtensionContext } from '@mariozechner/pi-coding-agent';
import path from 'node:path';

const SPINNER_FRAMES = [
	'\u280B',
	'\u2819',
	'\u2839',
	'\u2838',
	'\u283C',
	'\u2834',
	'\u2826',
	'\u2827',
	'\u2807',
	'\u280F',
];

let timer: ReturnType<typeof setInterval> | null = null;
let frameIndex = 0;

function getBaseTitle(pi: ExtensionAPI): string {
	const cwd = path.basename(process.cwd());
	// getSessionName() may not be in published types yet — use optional chaining
	const session = (pi as any).getSessionName?.() as string | undefined;
	return session ? `\u2A3A Agentuity - ${session} - ${cwd}` : `\u2A3A Agentuity - ${cwd}`;
}

export function setupTitlebar(pi: ExtensionAPI): void {
	// Set initial title on session start
	pi.on('session_start', async (_event, ctx) => {
		if (!ctx.hasUI) return;
		ctx.ui.setTitle(getBaseTitle(pi));
	});

	// Spinner during agent work
	pi.on('agent_start', async (_event, ctx) => {
		if (!ctx.hasUI) return;
		stopSpinner(ctx, pi);
		timer = setInterval(() => {
			const frame = SPINNER_FRAMES[frameIndex % SPINNER_FRAMES.length];
			ctx.ui.setTitle(`${frame} ${getBaseTitle(pi)}`);
			frameIndex++;
		}, 80);
	});

	pi.on('agent_end', async (_event, ctx) => {
		if (!ctx.hasUI) return;
		stopSpinner(ctx, pi);
	});

	pi.on('session_shutdown', async (_event, ctx) => {
		if (!ctx.hasUI) return;
		stopSpinner(ctx, pi);
	});
}

function stopSpinner(ctx: ExtensionContext, pi: ExtensionAPI): void {
	if (timer) {
		clearInterval(timer);
		timer = null;
	}
	frameIndex = 0;
	ctx.ui.setTitle(getBaseTitle(pi));
}
