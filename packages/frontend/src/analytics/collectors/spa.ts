import { trackPageview } from './pageview';

let currentPath = '';
let originalPushState: typeof history.pushState | null = null;
let originalReplaceState: typeof history.replaceState | null = null;

/**
 * Handle URL change for SPA navigation
 */
function handleUrlChange(): void {
	const newPath = window.location.pathname;
	if (newPath !== currentPath) {
		currentPath = newPath;
		trackPageview(newPath);
	}
}

/**
 * Initialize SPA navigation tracking
 * Hooks into history.pushState, history.replaceState, and popstate event
 */
export function initSPATracking(): void {
	if (typeof window === 'undefined' || typeof history === 'undefined') {
		return;
	}

	currentPath = window.location.pathname;

	// Hook into history.pushState
	originalPushState = history.pushState.bind(history);
	history.pushState = function (...args) {
		originalPushState?.apply(this, args);
		handleUrlChange();
	};

	// Hook into history.replaceState
	originalReplaceState = history.replaceState.bind(history);
	history.replaceState = function (...args) {
		originalReplaceState?.apply(this, args);
		handleUrlChange();
	};

	// Listen for popstate (back/forward navigation)
	window.addEventListener('popstate', handleUrlChange);
}

/**
 * Cleanup SPA tracking (for testing)
 */
export function cleanupSPATracking(): void {
	if (originalPushState) {
		history.pushState = originalPushState;
		originalPushState = null;
	}
	if (originalReplaceState) {
		history.replaceState = originalReplaceState;
		originalReplaceState = null;
	}
	window.removeEventListener('popstate', handleUrlChange);
}
