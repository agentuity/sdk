import { s, type Infer, ValidationError } from '../src/index.js';

// Define schemas with descriptions
const Player = s
	.object({
		username: s.string().describe('Player username'),
		xp: s.number().describe('Experience points'),
		level: s.number().describe('Player level'),
		inventory: s.array(s.string()).describe('Player inventory'),
		status: s
			.union(s.literal('online'), s.literal('offline'), s.literal('away'))
			.describe('Online status'),
	})
	.describe('Player profile');

// Extract inferred type (like zod's z.infer)
type Player = Infer<typeof Player>;

console.log('=== Complete Example: Player Schema ===\n');

// Example 1: Valid data with .parse()
console.log('1. Parsing valid data:');
const player1: Player = Player.parse({
	username: 'hero123',
	xp: 9999,
	level: 50,
	inventory: ['sword', 'shield', 'potion'],
	status: 'online',
});
console.log('✓ Success:', player1);

// Example 2: Invalid data with .parse() throws error
console.log('\n2. Parsing invalid data (throws):');
try {
	Player.parse({
		username: 'villain',
		xp: 'lots', // Wrong type
		level: 10,
		inventory: ['dagger'],
		status: 'online',
	});
} catch (error) {
	if (error instanceof ValidationError) {
		console.log('✓ Caught error:', error.message);
		console.log('  Issues:', error.issues);
	}
}

// Example 3: Using safeParse for error handling
console.log('\n3. Safe parsing:');
const result1 = Player.safeParse({
	username: 'test',
	xp: 100,
	level: 5,
	inventory: [],
	status: 'away',
});

if (result1.success) {
	console.log('✓ Valid:', result1.data);
} else {
	console.log('✗ Invalid:', result1.error.message);
}

// Example 4: Convert to JSON Schema
console.log('\n4. JSON Schema conversion:');
const jsonSchema = s.toJSONSchema(Player);
console.log(JSON.stringify(jsonSchema, null, 2));

// Example 5: Convert from JSON Schema
console.log('\n5. Creating schema from JSON Schema:');
const simpleJsonSchema = {
	type: 'object' as const,
	properties: {
		id: { type: 'string' as const },
		name: { type: 'string' as const },
		active: { type: 'boolean' as const },
	},
	required: ['id', 'name', 'active'],
};

const simpleSchema = s.fromJSONSchema(simpleJsonSchema);
const simpleData = simpleSchema.parse({
	id: '123',
	name: 'Test',
	active: true,
});
console.log('✓ Parsed from JSON Schema:', simpleData);

// Example 6: Type inference works perfectly
console.log('\n6. TypeScript type inference:');

// TypeScript knows the exact type structure!
const typedPlayer: Player = {
	username: 'typed',
	xp: 500,
	level: 10,
	inventory: ['item1'],
	status: 'offline',
};

// This would cause TypeScript errors:
// const badPlayer: Player = {
//   username: 'bad',
//   xp: 'invalid',     // TS Error!
//   level: 1,
//   inventory: ['x'],
//   status: 'sleeping' // TS Error!
// };

console.log('✓ Type-safe player:', typedPlayer);

console.log('\n=== All features working! ===');
