import type { AgentuityConfig } from '@agentuity/cli';

const config: AgentuityConfig = {
	workbench: {
		route: '/workbench',
	},
	analytics: {
		trackClicks: true,
		trackScroll: true,
		trackErrors: true,
		trackWebVitals: true,
		trackSPANavigation: true,
		trackOutboundLinks: true,
		trackForms: true,
	},
};

export default config;
