import { KeyValueClient } from '@agentuity/keyvalue';

async function main() {
	console.log('🚀 Starting KeyValue Test...\n');

	const client = new KeyValueClient();
	const NAMESPACE = 'test-namespace';
	const KEY = 'greeting';
	let needsCleanup = false;

	try {
		console.log('📦 Setting a key-value pair...');
		await client.set(NAMESPACE, KEY, { message: 'Hello, World!' }, { ttl: 3600 });
		needsCleanup = true;
		console.log('✅ Key set successfully');

		console.log('\n📋 Getting the value back...');
		const result = await client.get<{ message: string }>(NAMESPACE, KEY);
		if (result.exists) {
			console.log(`✅ Found: ${result.data.message}`);
			console.log(`   Content-Type: ${result.contentType}`);
		} else {
			console.log('❌ Key not found');
		}

		console.log('\n🗑️  Deleting the key...');
		await client.delete(NAMESPACE, KEY);
		needsCleanup = false;
		console.log('✅ Key deleted');

		console.log('\n📋 Listing namespaces...');
		const namespaces = await client.getNamespaces();
		console.log(`   Found ${namespaces.length} namespace(s)`);

		console.log('\n✨ KeyValue test completed successfully!');
	} finally {
		// Best-effort cleanup if the test failed before the inline delete
		// ran (or if the inline delete itself failed).
		if (needsCleanup) {
			console.log('\n🗑️  Cleaning up...');
			try {
				await client.delete(NAMESPACE, KEY);
				console.log(`   ✅ Deleted ${NAMESPACE}/${KEY}`);
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				console.log(`   ⚠️  Could not delete ${NAMESPACE}/${KEY}: ${msg}`);
			}
		}
	}
}

main().catch((error) => {
	console.error('❌ Error:', error.message);
	process.exit(1);
});
