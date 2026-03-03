import { s } from '../src/index.js';

console.log('=== Coercion Examples (like zod.coerce) ===\n');

// Example 1: String coercion
console.log('1. String coercion:');
const stringSchema = s.coerce.string();

console.log('  123 →', stringSchema.parse(123)); // "123"
console.log('  true →', stringSchema.parse(true)); // "true"
console.log('  null →', stringSchema.parse(null)); // "null"
console.log('  undefined →', stringSchema.parse(undefined)); // "undefined"
console.log('  [1,2,3] →', stringSchema.parse([1, 2, 3])); // "1,2,3"

// Example 2: Number coercion
console.log('\n2. Number coercion:');
const numberSchema = s.coerce.number();

console.log('  "123" →', numberSchema.parse('123')); // 123
console.log('  "45.67" →', numberSchema.parse('45.67')); // 45.67
console.log('  true →', numberSchema.parse(true)); // 1
console.log('  false →', numberSchema.parse(false)); // 0
console.log('  "0x10" →', numberSchema.parse('0x10')); // 16

const badNumberResult = numberSchema.safeParse('not-a-number');
console.log(
	'  "not-a-number" →',
	badNumberResult.success ? 'Success' : `Error: ${badNumberResult.error.message}`
);

// Example 3: Boolean coercion
console.log('\n3. Boolean coercion:');
const boolSchema = s.coerce.boolean();

console.log('  "true" →', boolSchema.parse('true')); // true
console.log('  "false" →', boolSchema.parse('false')); // true (non-empty string is truthy!)
console.log('  "" →', boolSchema.parse('')); // false (empty string is falsy)
console.log('  1 →', boolSchema.parse(1)); // true
console.log('  0 →', boolSchema.parse(0)); // false
console.log('  null →', boolSchema.parse(null)); // false
console.log('  undefined →', boolSchema.parse(undefined)); // false
console.log('  [] →', boolSchema.parse([])); // true (empty array is truthy)

// Example 4: Date coercion
console.log('\n4. Date coercion:');
const dateSchema = s.coerce.date();

console.log('  "2025-01-01" →', dateSchema.parse('2025-01-01'));
console.log('  1609459200000 →', dateSchema.parse(1609459200000)); // Unix timestamp
console.log('  new Date() →', dateSchema.parse(new Date()));

const badDateResult = dateSchema.safeParse('invalid-date');
console.log(
	'  "invalid-date" →',
	badDateResult.success ? 'Success' : `Error: ${badDateResult.error.message}`
);

// Example 5: Using coercion in objects
console.log('\n5. Coercion in objects:');

const formSchema = s.object({
	name: s.string(),
	age: s.coerce.number(), // Coerce string input to number
	newsletter: s.coerce.boolean(), // Coerce checkbox value to boolean
	createdAt: s.coerce.date(), // Coerce ISO string to Date
});

// Simulating form data (strings from HTML form)
const formData = formSchema.parse({
	name: 'John Doe',
	age: '30', // String will be coerced to number
	newsletter: 'on', // "on" is truthy, becomes true
	createdAt: '2025-01-01', // String will be coerced to Date
});

console.log('  Form data parsed:');
console.log('    name:', formData.name, '(type:', typeof formData.name, ')');
console.log('    age:', formData.age, '(type:', typeof formData.age, ')');
console.log('    newsletter:', formData.newsletter, '(type:', typeof formData.newsletter, ')');
console.log(
	'    createdAt:',
	formData.createdAt,
	'(type:',
	formData.createdAt.constructor.name,
	')'
);

// Example 6: Query parameters
console.log('\n6. Query parameter parsing:');

const queryParamsSchema = s.object({
	page: s.coerce.number().describe('Page number'),
	limit: s.coerce.number().describe('Items per page'),
	sort: s.string(),
	active: s.coerce.boolean().describe('Show only active items'),
});

// URL query params are always strings
const queryParams = queryParamsSchema.parse({
	page: '2', // "2" → 2
	limit: '20', // "20" → 20
	sort: 'name',
	active: '1', // "1" → true
});

console.log('  Query params:', queryParams);

// Example 7: Difference between regular and coerce
console.log('\n7. Regular vs Coerce comparison:');

const regularNumberSchema = s.number();
const coerceNumberSchema = s.coerce.number();

try {
	console.log('  Regular number with "123":');
	regularNumberSchema.parse('123');
	console.log('    Success');
} catch (_error) {
	console.log('    ✗ Failed (as expected) - no coercion');
}

try {
	console.log('  Coerce number with "123":');
	const result = coerceNumberSchema.parse('123');
	console.log('    ✓ Success:', result);
} catch (_error) {
	console.log('    Failed');
}

// Example 8: Using with descriptions
console.log('\n8. Coerce with descriptions:');

const apiSchema = s.object({
	userId: s.coerce.number().describe('User ID from URL parameter'),
	timestamp: s.coerce.date().describe('ISO timestamp string'),
	enabled: s.coerce.boolean().describe('Feature flag'),
});

const jsonSchema = s.toJSONSchema(apiSchema);
console.log('  JSON Schema with coercion:', JSON.stringify(jsonSchema, null, 2));

console.log('\n=== All coercion features working! ===');
