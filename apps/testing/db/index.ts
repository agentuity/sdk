/**
 * Database Test App
 *
 * A simple standalone Bun app to test the DBClient from @agentuity/db.
 * Demonstrates querying databases and listing tables.
 */

import { DBClient } from '@agentuity/db';
import { isStructuredError } from '@agentuity/core';

async function main() {
	console.log('🚀 Starting Database Test...\n');

	const client = new DBClient({
		database: process.env.AGENTUITY_DB_DATABASE || 'test-db',
		orgId: process.env.AGENTUITY_ORG_ID || 'test-org',
	});

	// ============================================================
	// Test 1: List tables
	// ============================================================
	console.log('═'.repeat(60));
	console.log('Test 1: List tables');
	console.log('═'.repeat(60));

	console.log('\n📋 Fetching table list...');
	const tables = await client.tables();
	console.log(`   Found ${tables.length} tables:`);
	for (const table of tables) {
		console.log(`   - ${table.table_name}`);
	}

	// ============================================================
	// Test 2: Run a simple query
	// ============================================================
	console.log(`\n${'═'.repeat(60)}`);
	console.log('Test 2: Run a simple query');
	console.log('═'.repeat(60));

	console.log('\n🔍 Running: SELECT 1 as test_value...');
	const result1 = await client.query('SELECT 1 as test_value');
	console.log(`   Rows returned: ${result1.rows.length}`);
	console.log(`   Result: ${JSON.stringify(result1.rows[0])}`);

	// ============================================================
	// Test 3: Run a query with parameters
	// ============================================================
	console.log(`\n${'═'.repeat(60)}`);
	console.log('Test 3: Run a more complex query');
	console.log('═'.repeat(60));

	console.log("\n🔍 Running: SELECT current_timestamp as now, 'hello' as greeting...");
	const result2 = await client.query("SELECT current_timestamp as now, 'hello' as greeting");
	console.log(`   Rows returned: ${result2.rows.length}`);
	console.log(`   Result: ${JSON.stringify(result2.rows[0])}`);

	// ============================================================
	// Test 4: Query with LIMIT
	// ============================================================
	console.log(`\n${'═'.repeat(60)}`);
	console.log('Test 4: Query tables with LIMIT');
	console.log('═'.repeat(60));

	if (tables.length > 0) {
		const tableName = tables[0].table_name;
		// Safely quote the identifier to prevent SQL injection
		const quotedTableName = `"${tableName.replace(/"/g, '""')}"`;
		console.log(`\n🔍 Running: SELECT * FROM ${quotedTableName} LIMIT 5...`);
		const result3 = await client.query(`SELECT * FROM ${quotedTableName} LIMIT 5`);
		console.log(`   Rows returned: ${result3.rows.length}`);
		if (result3.rows.length > 0) {
			console.log(`   Columns: ${Object.keys(result3.rows[0]).join(', ')}`);
			console.log(`   First row: ${JSON.stringify(result3.rows[0])}`);
		}
	} else {
		console.log('\n   ⏭️  Skipping (no tables found)');
	}

	console.log(`\n${'═'.repeat(60)}`);
	console.log('✨ Database test completed successfully!');
	console.log('═'.repeat(60));
}

main().catch((error: unknown) => {
	if (isStructuredError(error)) {
		console.error('❌ Error:', error.message);
		console.error('   Code:', error._tag);
	} else if (error instanceof Error) {
		console.error('❌ Error:', error.message);
	} else {
		console.error('❌ Error:', String(error));
	}
	process.exit(1);
});
