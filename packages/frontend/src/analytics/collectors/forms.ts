import { createBaseEvent } from './pageview';
import { queueEvent } from '../events';

/**
 * Initialize form submission tracking
 */
export function initFormTracking(): void {
	if (typeof document === 'undefined') {
		return;
	}

	document.addEventListener(
		'submit',
		(e) => {
			const form = e.target as HTMLFormElement | null;
			if (!form || form.tagName !== 'FORM') {
				return;
			}

			const event = createBaseEvent('form_submit');
			event.event_name = 'form_submit';

			const eventData: Record<string, unknown> = {};

			// Form identification
			if (form.id) {
				eventData.form_id = form.id;
			}
			if (form.name) {
				eventData.form_name = form.name;
			}
			if (form.action) {
				eventData.form_action = form.action;
			}
			eventData.form_method = form.method || 'get';

			// Count form fields (don't capture values for privacy)
			const inputs = form.querySelectorAll('input, select, textarea');
			eventData.field_count = inputs.length;

			// Check for common form types
			const hasEmail = form.querySelector('input[type="email"]') !== null;
			const hasPassword = form.querySelector('input[type="password"]') !== null;
			const hasSearch = form.querySelector('input[type="search"]') !== null;

			if (hasEmail && hasPassword) {
				eventData.form_type = 'auth';
			} else if (hasEmail) {
				eventData.form_type = 'email';
			} else if (hasSearch) {
				eventData.form_type = 'search';
			} else if (hasPassword) {
				eventData.form_type = 'password';
			} else {
				eventData.form_type = 'other';
			}

			event.event_data = eventData;

			queueEvent(event);
		},
		{ capture: true }
	);
}
