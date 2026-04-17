export function App() {
	return (
		<div
			style={{
				fontFamily: 'system-ui, sans-serif',
				padding: '2rem',
				maxWidth: '600px',
				margin: '0 auto',
			}}
		>
			<h1>Cloud Deployment Test</h1>
			<p>This page is used to verify analytics beacon injection in production deployments.</p>
			<div
				id="analytics-status"
				style={{
					marginTop: '2rem',
					padding: '1rem',
					background: '#f0f0f0',
					borderRadius: '8px',
				}}
			>
				<h2>Analytics Status</h2>
				<p id="config-status">Checking analytics config...</p>
				<p id="beacon-status">Checking beacon script...</p>
				<p id="public-asset-status">Checking public asset...</p>
			</div>
			<script
				// biome-ignore lint/security/noDangerouslySetInnerHtml: inline script needed for analytics config detection before React hydration
				dangerouslySetInnerHTML={{
					__html: `
						(function() {
							var configStatus = document.getElementById('config-status');
							var beaconStatus = document.getElementById('beacon-status');
							var publicAssetStatus = document.getElementById('public-asset-status');
							
							// Check for analytics config
							if (window.__AGENTUITY_ANALYTICS__) {
								configStatus.innerHTML = '✅ Analytics config found: enabled=' + window.__AGENTUITY_ANALYTICS__.enabled;
							} else {
								configStatus.innerHTML = '❌ Analytics config not found';
							}
							
							// Check for beacon script
							var scripts = document.querySelectorAll('script');
							var hasBeacon = false;
							scripts.forEach(function(s) {
								if ((s.src && s.src.includes('analytics.js')) || s.hasAttribute('data-agentuity-beacon')) {
									hasBeacon = true;
								}
							});
							beaconStatus.innerHTML = hasBeacon ? '✅ Beacon script found' : '❌ Beacon script not found';
							
							// Check public asset via fetch (txt files can't use img onLoad).
							// Vite serves src/web/public/ at the URL root, so the request goes
							// to /test-asset.txt directly, with no extra prefix.
							fetch('/test-asset.txt')
								.then(function(res) {
									if (res.ok) {
										return res.text();
									}
									throw new Error('HTTP ' + res.status);
								})
								.then(function(text) {
									if (text.indexOf('AGENTUITY_PUBLIC_ASSET_TEST_OK') !== -1) {
										publicAssetStatus.innerHTML = '✅ Public asset loaded successfully';
									} else {
										publicAssetStatus.innerHTML = '❌ Public asset content mismatch';
									}
								})
								.catch(function(err) {
									publicAssetStatus.innerHTML = '❌ Public asset failed to load: ' + err.message;
								});
						})();
					`,
				}}
			/>
		</div>
	);
}
