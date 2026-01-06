import { createBaseEvent } from './pageview';
import { queueEvent } from '../events';

const SCROLL_MILESTONES = [25, 50, 75, 100];
let trackedMilestones: Set<number> = new Set();
let maxScrollDepth = 0;
let isScrollTrackingInitialized = false;
let scrollHandler: (() => void) | null = null;

/**
 * Calculate current scroll depth percentage
 */
function getScrollDepth(): number {
	if (typeof window === 'undefined' || typeof document === 'undefined') {
		return 0;
	}

	const scrollTop = window.scrollY || document.documentElement.scrollTop;
	const scrollHeight =
		document.documentElement.scrollHeight - document.documentElement.clientHeight;

	if (scrollHeight <= 0) {
		return 100; // Page doesn't scroll
	}

	return Math.min(100, Math.round((scrollTop / scrollHeight) * 100));
}

/**
 * Handle scroll event
 */
function handleScroll(): void {
	const depth = getScrollDepth();

	if (depth > maxScrollDepth) {
		maxScrollDepth = depth;
	}

	// Check for milestone crossings
	for (const milestone of SCROLL_MILESTONES) {
		if (depth >= milestone && !trackedMilestones.has(milestone)) {
			trackedMilestones.add(milestone);

			const event = createBaseEvent('scroll');
			event.event_name = `scroll_${milestone}`;
			event.scroll_depth = milestone;

			queueEvent(event);
		}
	}
}

/**
 * Initialize scroll depth tracking
 */
export function initScrollTracking(): void {
	if (typeof window === 'undefined') {
		return;
	}

	if (isScrollTrackingInitialized) {
		return;
	}
	isScrollTrackingInitialized = true;

	// Reset on page load
	trackedMilestones = new Set();
	maxScrollDepth = 0;

	// Throttled scroll handler
	let ticking = false;
	scrollHandler = () => {
		if (!ticking) {
			requestAnimationFrame(() => {
				handleScroll();
				ticking = false;
			});
			ticking = true;
		}
	};

	window.addEventListener('scroll', scrollHandler, { passive: true });

	// Check initial scroll position (for pages that load scrolled)
	handleScroll();
}

/**
 * Remove scroll tracking listener
 */
export function removeScrollTracking(): void {
	if (scrollHandler) {
		window.removeEventListener('scroll', scrollHandler);
		scrollHandler = null;
	}
	isScrollTrackingInitialized = false;
}

/**
 * Get max scroll depth (for time on page events)
 */
export function getMaxScrollDepth(): number {
	return maxScrollDepth;
}

/**
 * Reset tracked milestones (for SPA navigation)
 */
export function resetScrollTracking(): void {
	trackedMilestones = new Set();
	maxScrollDepth = 0;
}
