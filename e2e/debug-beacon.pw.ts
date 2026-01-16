import { test, expect } from '@playwright/test';

test('debug beacon script loading', async ({ page, request }) => {
	// First check if the beacon endpoint returns content
	const beaconResponse = await request.get(
		'http://localhost:3500/_agentuity/webanalytics/analytics.js'
	);
	console.log('\n=== Beacon Endpoint Check ===');
	console.log('Status:', beaconResponse.status());
	const beaconText = await beaconResponse.text();
	console.log('Content length:', beaconText.length);
	console.log('First 200 chars:', beaconText.substring(0, 200));
	console.log('Has agentuityAnalytics:', beaconText.includes('agentuityAnalytics'));

	// Check if it's empty or an error
	if (beaconText.length < 100) {
		console.log('FULL CONTENT:', beaconText);
	}
});
