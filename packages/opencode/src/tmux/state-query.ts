import type { WindowState, TmuxPaneInfo } from './types.ts';
import { runTmuxCommand } from './utils.ts';

/**
 * Query the current tmux window state
 * Returns information about all panes in the current window
 */
export async function queryWindowState(sourcePaneId: string): Promise<WindowState | null> {
	const result = await runTmuxCommand([
		'list-panes',
		'-t',
		sourcePaneId,
		'-F',
		'#{pane_id},#{pane_width},#{pane_height},#{pane_left},#{pane_top},#{pane_title},#{pane_active},#{window_width},#{window_height}',
	]);

	if (!result.success) {
		return null;
	}

	const lines = result.output
		.split('\n')
		.map((line) => line.trim())
		.filter(Boolean);
	if (lines.length === 0) return null;

	const panes: TmuxPaneInfo[] = [];
	let windowWidth = 0;
	let windowHeight = 0;

	for (const line of lines) {
		const parts = line.split(',');
		if (parts.length < 9) continue;

		const paneId = parts[0];
		if (!paneId) continue;

		const windowWidthValue = Number(parts[parts.length - 2]);
		const windowHeightValue = Number(parts[parts.length - 1]);
		const isActiveValue = parts[parts.length - 3] === '1';
		const title = parts.slice(5, parts.length - 3).join(',');

		const width = Number(parts[1]);
		const height = Number(parts[2]);
		const left = Number(parts[3]);
		const top = Number(parts[4]);
		if ([width, height, left, top].some((value) => Number.isNaN(value))) {
			continue;
		}

		const paneInfo: TmuxPaneInfo = {
			paneId,
			width,
			height,
			left,
			top,
			title,
			isActive: isActiveValue,
		};

		if (!Number.isNaN(windowWidthValue)) windowWidth = windowWidthValue;
		if (!Number.isNaN(windowHeightValue)) windowHeight = windowHeightValue;
		panes.push(paneInfo);
	}

	if (panes.length === 0) return null;

	const mainPane = panes.find((pane) => pane.paneId === sourcePaneId) ?? null;
	const agentPanes = panes.filter((pane) => pane.paneId !== sourcePaneId);

	return {
		windowWidth,
		windowHeight,
		mainPane,
		agentPanes,
	};
}
