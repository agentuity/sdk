export function App() {
	return (
		<div style={{ fontFamily: 'system-ui, sans-serif', padding: '2rem', maxWidth: '600px', margin: '0 auto' }}>
			<h1>Cloud Deployment Test</h1>
			<p>This page is used to verify analytics beacon injection in production deployments.</p>
			<div id="analytics-status" style={{ marginTop: '2rem', padding: '1rem', background: '#f0f0f0', borderRadius: '8px' }}>
				<h2>Analytics Status</h2>
				<p id="config-status">Checking analytics config...</p>
				<p id="beacon-status">Checking beacon script...</p>
			</div>
			<script
				dangerouslySetInnerHTML={{
					__html: `
						(function() {
							var configStatus = document.getElementById('config-status');
							var beaconStatus = document.getElementById('beacon-status');
							
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
						})();
					`,
				}}
			/>
		</div>
	);
}
