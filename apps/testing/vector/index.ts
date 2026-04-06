/**
 * Vector Test App
 *
 * A simple standalone Bun app to test the VectorClient from @agentuity/vector.
 * Demonstrates upserting documents and searching for similar vectors.
 */

import { VectorClient } from '@agentuity/vector';

async function main() {
	console.log('🚀 Starting Vector Test...\n');

	const client = new VectorClient();

	// Generate a unique namespace to avoid conflicts
	const randomSuffix = Date.now().toString(36);
	const NAMESPACE = `test-products-${randomSuffix}`;

	// ============================================================
	// Test 1: Upsert vector documents
	// ============================================================
	console.log('═'.repeat(60));
	console.log('Test 1: Upsert vector documents');
	console.log('═'.repeat(60));

	console.log('\n📦 Upserting documents...');

	await client.upsert(NAMESPACE, {
		key: 'chair-001',
		document: 'Comfortable ergonomic office chair with lumbar support and adjustable height',
		metadata: { category: 'furniture', price: 299.99 },
	});
	console.log('   ✅ Upserted: chair-001');

	await client.upsert(NAMESPACE, {
		key: 'desk-001',
		document: 'Standing desk with electric height adjustment and cable management',
		metadata: { category: 'furniture', price: 599.99 },
	});
	console.log('   ✅ Upserted: desk-001');

	await client.upsert(NAMESPACE, {
		key: 'monitor-001',
		document: '27-inch 4K monitor with USB-C connectivity and built-in speakers',
		metadata: { category: 'electronics', price: 449.99 },
	});
	console.log('   ✅ Upserted: monitor-001');

	await client.upsert(NAMESPACE, {
		key: 'keyboard-001',
		document: 'Mechanical keyboard with Cherry MX switches and RGB backlighting',
		metadata: { category: 'electronics', price: 149.99 },
	});
	console.log('   ✅ Upserted: keyboard-001');

	// ============================================================
	// Test 2: Search for similar vectors
	// ============================================================
	console.log(`\n${'═'.repeat(60)}`);
	console.log('Test 2: Search for similar vectors');
	console.log('═'.repeat(60));

	console.log('\n🔍 Searching for "office seating"...');
	const results1 = await client.search(NAMESPACE, {
		query: 'office seating',
		limit: 3,
	});
	console.log(`   Found ${results1.length} results:`);
	for (const result of results1) {
		console.log(`   - ${result.key} (score: ${result.similarity?.toFixed(4)})`);
	}

	console.log('\n🔍 Searching for "computer display screen"...');
	const results2 = await client.search(NAMESPACE, {
		query: 'computer display screen',
		limit: 3,
	});
	console.log(`   Found ${results2.length} results:`);
	for (const result of results2) {
		console.log(`   - ${result.key} (score: ${result.similarity?.toFixed(4)})`);
	}

	console.log('\n🔍 Searching for "typing device"...');
	const results3 = await client.search(NAMESPACE, {
		query: 'typing device',
		limit: 2,
	});
	console.log(`   Found ${results3.length} results:`);
	for (const result of results3) {
		console.log(`   - ${result.key} (score: ${result.similarity?.toFixed(4)})`);
	}

	console.log(`\n${'═'.repeat(60)}`);
	console.log('✨ Vector test completed successfully!');
	console.log('═'.repeat(60));
}

main().catch((error) => {
	console.error('❌ Error:', error.message);
	process.exit(1);
});
