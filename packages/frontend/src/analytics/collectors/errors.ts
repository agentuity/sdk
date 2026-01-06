import { createBaseEvent } from './pageview';
import { queueEvent } from '../events';

/**
 * Initialize JavaScript error tracking
 */
export function initErrorTracking(): void {
	if (typeof window === 'undefined') {
		return;
	}

	// Handle uncaught errors
	window.addEventListener('error', (e) => {
		const event = createBaseEvent('error');
		event.event_name = 'js_error';
		event.event_data = {
			message: e.message || 'Unknown error',
			filename: e.filename || '',
			lineno: e.lineno || 0,
			colno: e.colno || 0,
			stack: e.error?.stack?.slice(0, 1000) || '',
		};

		queueEvent(event);
	});

	// Handle unhandled promise rejections
	window.addEventListener('unhandledrejection', (e) => {
		const event = createBaseEvent('error');
		event.event_name = 'unhandled_rejection';

		let message = 'Unhandled Promise Rejection';
		let stack = '';

		if (e.reason instanceof Error) {
			message = e.reason.message;
			stack = e.reason.stack?.slice(0, 1000) || '';
		} else if (typeof e.reason === 'string') {
			message = e.reason;
		}

		event.event_data = {
			message,
			stack,
		};

		queueEvent(event);
	});
}
