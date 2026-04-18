import { KeyValueClient } from '@agentuity/keyvalue';

async function main() {
	console.log('🚀 Starting KeyValue Test...\n');

	const client = new KeyValueClient();

	console.log('📦 Setting a key-value pair...');
	await client.set('test-namespace', 'greeting', { message: 'Hello, World!' }, { ttl: 3600 });
	console.log('✅ Key set successfully');

	console.log('\n📋 Getting the value back...');
	const result = await client.get<{ message: string }>('test-namespace', 'greeting');
	if (result.exists) {
		console.log(`✅ Found: ${result.data.message}`);
		console.log(`   Content-Type: ${result.contentType}`);
	} else {
		console.log('❌ Key not found');
	}

	console.log('\n🗑️  Deleting the key...');
	await client.delete('test-namespace', 'greeting');
	console.log('✅ Key deleted');

	console.log('\n📋 Listing namespaces...');
	const namespaces = await client.getNamespaces();
	console.log(`   Found ${namespaces.length} namespace(s)`);

	console.log('\n✨ KeyValue test completed successfully!');
}

main().catch((error) => {
	console.error('❌ Error:', error.message);
	process.exit(1);
});
