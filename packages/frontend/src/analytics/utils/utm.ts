export interface UTMParams {
	utm_source?: string;
	utm_medium?: string;
	utm_campaign?: string;
	utm_term?: string;
	utm_content?: string;
}

/**
 * Extract UTM parameters from the current URL
 */
export function getUTMParams(): UTMParams {
	if (typeof window === 'undefined') {
		return {};
	}

	const params = new URLSearchParams(window.location.search);
	const utm: UTMParams = {};

	const source = params.get('utm_source');
	if (source) utm.utm_source = source;

	const medium = params.get('utm_medium');
	if (medium) utm.utm_medium = medium;

	const campaign = params.get('utm_campaign');
	if (campaign) utm.utm_campaign = campaign;

	const term = params.get('utm_term');
	if (term) utm.utm_term = term;

	const content = params.get('utm_content');
	if (content) utm.utm_content = content;

	return utm;
}
