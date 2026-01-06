import { createBaseEvent } from './pageview';
import { queueEvent } from '../events';

/**
 * Initialize click tracking
 * Tracks clicks on elements with data-analytics attribute
 */
export function initClickTracking(): void {
	if (typeof document === 'undefined') {
		return;
	}

	document.addEventListener(
		'click',
		(e) => {
			const target = e.target as HTMLElement | null;
			if (!target) return;

			// Find closest element with data-analytics attribute
			const analyticsElement = target.closest('[data-analytics]');
			if (!analyticsElement) return;

			const eventName = analyticsElement.getAttribute('data-analytics');
			if (!eventName) return;

			const event = createBaseEvent('click');
			event.event_name = eventName;

			// Collect additional data attributes
			const eventData: Record<string, unknown> = {};
			for (const attr of Array.from(analyticsElement.attributes)) {
				if (attr.name.startsWith('data-analytics-')) {
					const key = attr.name.replace('data-analytics-', '');
					eventData[key] = attr.value;
				}
			}

			// Add element info
			eventData.tag = analyticsElement.tagName.toLowerCase();
			if (analyticsElement.id) {
				eventData.id = analyticsElement.id;
			}
			const text = (analyticsElement as HTMLElement).innerText?.slice(0, 100);
			if (text) {
				eventData.text = text;
			}

			if (Object.keys(eventData).length > 0) {
				event.event_data = eventData;
			}

			queueEvent(event);
		},
		{ capture: true, passive: true }
	);
}

/**
 * Initialize outbound link tracking
 */
export function initOutboundLinkTracking(): void {
	if (typeof document === 'undefined') {
		return;
	}

	document.addEventListener(
		'click',
		(e) => {
			const target = e.target as HTMLElement | null;
			if (!target) return;

			const link = target.closest('a');
			if (!link) return;

			const href = link.href;
			if (!href) return;

			// Check if it's an outbound link
			try {
				const url = new URL(href, window.location.origin);
				if (url.hostname === window.location.hostname) {
					return; // Same domain, not outbound
				}

				const event = createBaseEvent('outbound_link');
				event.event_name = 'outbound_link';
				event.event_data = {
					href,
					hostname: url.hostname,
					text: link.innerText?.slice(0, 100) || '',
				};

				queueEvent(event);
			} catch {
				// Invalid URL, ignore
			}
		},
		{ capture: true, passive: true }
	);
}
