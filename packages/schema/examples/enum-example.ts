import { s } from '../src/index.js';

console.log('=== Enum Feature Examples ===\n');

// Example 1: Basic enum
console.log('1. Basic enum:');
const colorSchema = s.enum(['red', 'green', 'blue']);

type Color = s.infer<typeof colorSchema>;

const color1: Color = colorSchema.parse('red');
console.log('  ✓ Valid color:', color1);

try {
	colorSchema.parse('yellow');
} catch (_error) {
	console.log('  ✓ Invalid color rejected');
}

// Example 2: Number enum
console.log('\n2. Number enum:');
const prioritySchema = s.enum([1, 2, 3, 4, 5]);

type Priority = s.infer<typeof prioritySchema>;

const priority: Priority = prioritySchema.parse(3);
console.log('  ✓ Priority level:', priority);

// Example 3: Mixed enum
console.log('\n3. Mixed type enum:');
const statusSchema = s.enum(['active', 'inactive', 0, 1]);

const status1 = statusSchema.parse('active');
const status2 = statusSchema.parse(1);
console.log('  ✓ String status:', status1);
console.log('  ✓ Number status:', status2);

// Example 4: Using enum in objects
console.log('\n4. Enum in object schema:');

const userSchema = s.object({
	name: s.string(),
	role: s.enum(['admin', 'user', 'guest']).describe('User role'),
	status: s.enum(['active', 'inactive', 'suspended']).describe('Account status'),
	priority: s.enum([1, 2, 3]).describe('Priority level'),
});

type User = s.infer<typeof userSchema>;

const user: User = userSchema.parse({
	name: 'John',
	role: 'admin',
	status: 'active',
	priority: 1,
});

console.log('  ✓ User:', user);

// Example 5: Enum vs Union comparison
console.log('\n5. Enum vs Union:');

// Using enum (simpler)
const _roleEnum = s.enum(['admin', 'user', 'guest']);

// Using union with literals (more verbose)
const _roleUnion = s.union(s.literal('admin'), s.literal('user'), s.literal('guest'));

console.log('  ✓ Enum version: s.enum([...values])');
console.log('  ✓ Union version: s.union(s.literal(...), ...)');
console.log('  Both work the same way!');

// Example 6: JSON Schema conversion
console.log('\n6. JSON Schema conversion:');

const themeSchema = s.enum(['light', 'dark', 'auto']).describe('UI theme');
const jsonSchema = s.toJSONSchema(themeSchema);

console.log('  JSON Schema:', JSON.stringify(jsonSchema, null, 2));

console.log('\n=== Enum feature working perfectly! ===');
