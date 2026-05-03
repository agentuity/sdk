import type { ExtensionAPI, ExtensionContext, Theme } from '@mariozechner/pi-coding-agent';

type TuiRenderer = {
	requestRender(): void;
};

type LogoCell = {
	ri: number;
	ci: number;
	sr: number;
	sc: number;
	delay: number;
};

const LOGO = [
	'                      ##                          ',
	'                     ####                         ',
	'                    ######                        ',
	'                  ##########                      ',
	'                 #####  #####                     ',
	'                #####    #####                    ',
	'               #####      #####                   ',
	'              #####        #####                  ',
	'             #####          #####                 ',
	'            #############################         ',
	'           ##############################         ',
	'                                                  ',
	'                                                  ',
	' #####################################            ',
	'########################################          ',
	'     #####                          #####         ',
	'    #####                            #####        ',
	'   #####                              #####       ',
	'  #####                                #####      ',
	' ############################################     ',
	'##############################################    ',
];

const ASSEMBLE_FRAMES = 30;
const SHIMMER_FRAMES = 56;
const PULSE_FRAMES = 40;
const FRAME_INTERVAL_MS = 35;
const CHARS = '░▒▓█#@%&*+=-:.';
const TITLE = 'Agentuity Coder';
const SANDBOX_ID_ENV = 'AGENTUITY_SANDBOX_ID';

const LOGO_ROWS = LOGO.length;
const LOGO_COLS = LOGO[0]?.length ?? 0;
const CELLS = LOGO.flatMap((row, ri) =>
	[...row].flatMap((ch, ci) => (ch === '#' ? [{ ri, ci }] : []))
);
const TOTAL_FRAMES = ASSEMBLE_FRAMES + SHIMMER_FRAMES + PULSE_FRAMES;
const TITLE_OFFSET = 3;

function mulberry32(seed: number): () => number {
	return () => {
		let value = (seed += 0x6d2b79f5);
		value = Math.imul(value ^ (value >>> 15), value | 1);
		value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
		return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
	};
}

function center(line: string, width: number): string {
	if (width <= LOGO_COLS) return line;
	const padding = Math.max(0, Math.floor((width - LOGO_COLS) / 2));
	return `${' '.repeat(padding)}${line}`;
}

function centerText(line: string, width: number): string {
	const padding = Math.max(0, Math.floor((width - line.length) / 2) - TITLE_OFFSET);
	return `${' '.repeat(padding)}${line}`;
}

function randomChar(rand: () => number): string {
	return CHARS[Math.floor(rand() * CHARS.length)] ?? '#';
}

function makeParticles(seed: number): LogoCell[] {
	const rand = mulberry32(seed);
	return CELLS.map((cell) => ({
		...cell,
		sr: Math.floor(rand() * LOGO_ROWS),
		sc: Math.floor(rand() * LOGO_COLS),
		delay: rand() * 0.6,
	}));
}

function makeGrid(): string[][] {
	return LOGO.map((row) => [...row].map(() => ' '));
}

function phaseForFrame(
	frame: number
):
	| { type: 'assemble'; frame: number }
	| { type: 'shimmer'; frame: number }
	| { type: 'pulse'; frame: number }
	| { type: 'final' } {
	if (frame < ASSEMBLE_FRAMES) return { type: 'assemble', frame };
	if (frame < ASSEMBLE_FRAMES + SHIMMER_FRAMES) {
		return { type: 'shimmer', frame: frame - ASSEMBLE_FRAMES };
	}
	if (frame < TOTAL_FRAMES) {
		return { type: 'pulse', frame: frame - ASSEMBLE_FRAMES - SHIMMER_FRAMES };
	}
	return { type: 'final' };
}

class StartupLogoHeader {
	#frame = 0;
	#timer: ReturnType<typeof setInterval> | null = null;
	readonly #particles = makeParticles(Date.now());

	constructor(
		private readonly tui: TuiRenderer,
		private readonly theme: Theme
	) {
		this.#timer = setInterval(() => {
			this.#frame++;
			if (this.#frame >= TOTAL_FRAMES) this.#stop();
			this.tui.requestRender();
		}, FRAME_INTERVAL_MS);
	}

	render(width: number): string[] {
		const grid = this.#renderGrid();
		return [
			'',
			...grid.map((row) => center(row.join(''), width)),
			'',
			this.#renderTitle(width),
			'',
		];
	}

	invalidate(): void {
		this.tui.requestRender();
	}

	dispose(): void {
		this.#stop();
	}

	#renderGrid(): string[][] {
		const phase = phaseForFrame(this.#frame);
		if (phase.type === 'assemble') return this.#renderAssemble(phase.frame);
		if (phase.type === 'shimmer') return this.#renderShimmer(phase.frame);
		if (phase.type === 'pulse') return this.#renderPulse(phase.frame);
		return this.#renderFinal();
	}

	#renderAssemble(frame: number): string[][] {
		const rand = mulberry32(frame + 1);
		const grid = makeGrid();
		const t = frame / Math.max(1, ASSEMBLE_FRAMES - 1);

		for (const particle of this.#particles) {
			const pt = Math.max(0, (t - particle.delay) / (1 - particle.delay));
			const eased = 1 - (1 - Math.min(pt, 1)) ** 3;
			const ri = Math.round(particle.sr + (particle.ri - particle.sr) * eased);
			const ci = Math.round(particle.sc + (particle.ci - particle.sc) * eased);

			if (pt >= 1) {
				grid[particle.ri]![particle.ci] = this.#cyan('#');
			} else if (ri >= 0 && ri < LOGO_ROWS && ci >= 0 && ci < LOGO_COLS) {
				grid[ri]![ci] = this.#dim(randomChar(rand));
			}
		}

		return grid;
	}

	#renderShimmer(frame: number): string[][] {
		const wave = (frame / SHIMMER_FRAMES) * (LOGO_ROWS + LOGO_COLS) * 1.5;
		return LOGO.map((row, ri) =>
			[...row].map((ch, ci) => {
				if (ch !== '#') return ' ';
				const dist = Math.abs(ri + ci * 0.5 - wave);
				if (dist < 1.5) return this.#brightCyan('█');
				if (dist < 3.5) return this.#cyan('#');
				if (dist < 5) return this.#dim('#');
				return this.#cyan('#');
			})
		);
	}

	#renderPulse(frame: number): string[][] {
		const step = frame % 20;
		const t = step / 20;
		const bright = t < 0.5 ? t * 2 : (1 - t) * 2;

		return LOGO.map((row) =>
			[...row].map((ch) => {
				if (ch !== '#') return ' ';
				if (bright > 0.5) return this.#brightCyan('#');
				if (bright > 0.2) return this.#cyan('#');
				return this.#dim('#');
			})
		);
	}

	#renderFinal(): string[][] {
		return LOGO.map((row) => [...row].map((ch) => (ch === '#' ? this.#cyan('#') : ' ')));
	}

	#renderTitle(width: number): string {
		if (this.#frame < ASSEMBLE_FRAMES) return '';

		const titleFrame = Math.min(this.#frame - ASSEMBLE_FRAMES, SHIMMER_FRAMES);
		const visibleChars = Math.min(
			TITLE.length,
			Math.floor((titleFrame / Math.max(1, SHIMMER_FRAMES - 1)) * TITLE.length)
		);
		const title = TITLE.slice(0, visibleChars);

		if (this.#frame >= ASSEMBLE_FRAMES + SHIMMER_FRAMES) {
			return this.#brightCyan(centerText(TITLE, width));
		}

		return this.#cyan(centerText(title, width));
	}

	#cyan(text: string): string {
		return this.theme.fg('accent', text);
	}

	#brightCyan(text: string): string {
		return `\x1b[96m${text}\x1b[0m`;
	}

	#dim(text: string): string {
		return this.theme.fg('dim', this.theme.fg('accent', text));
	}

	#stop(): void {
		if (!this.#timer) return;
		clearInterval(this.#timer);
		this.#timer = null;
	}
}

function installStartupLogo(ctx: ExtensionContext): void {
	if (!ctx.hasUI) return;
	ctx.ui.setHeader((tui, theme) => new StartupLogoHeader(tui, theme));
}

export function setupStartupLogo(pi: ExtensionAPI): void {
	if (process.env[SANDBOX_ID_ENV]) return;

	pi.on('session_start', async (_event, ctx) => {
		installStartupLogo(ctx);
	});

	pi.registerCommand('startup-logo', {
		description: 'Replay the Agentuity Coder startup logo animation, or reset the header.',
		handler: async (args, ctx) => {
			if (!ctx.hasUI) return;

			if (args.trim().toLowerCase() === 'reset') {
				ctx.ui.setHeader(undefined);
				ctx.ui.notify('Built-in header restored', 'info');
				return;
			}

			installStartupLogo(ctx);
		},
	});
}
