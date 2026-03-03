import { s } from '../src/index.js';

// Example with descriptions
const userSchema = s
	.object({
		id: s.string().describe('The unique identifier for the user'),
		name: s.string().describe('The full name of the user'),
		email: s.string().describe('The email address of the user'),
		age: s.number().describe('The age of the user in years'),
		role: s
			.union(s.literal('admin'), s.literal('user'), s.literal('guest'))
			.describe('The role of the user in the system'),
		isActive: s.boolean().describe('Whether the user account is active'),
		metadata: s
			.nullable(
				s.object({
					lastLogin: s.string().describe('ISO timestamp of last login'),
					preferences: s.object({
						theme: s.string().describe('UI theme preference'),
						notifications: s.boolean().describe('Whether notifications are enabled'),
					}),
				})
			)
			.describe('Optional metadata about the user'),
		tags: s.array(s.string()).describe('Tags associated with the user'),
		nickname: s.optional(s.string()).describe('Optional nickname'),
	})
	.describe('User profile schema');

// Convert to JSON Schema
const jsonSchema = s.toJSONSchema(userSchema);

console.log('JSON Schema:');
console.log(JSON.stringify(jsonSchema, null, 2));

// Test validation
const validUser = {
	id: '123',
	name: 'John Doe',
	email: 'john@example.com',
	age: 30,
	role: 'admin',
	isActive: true,
	metadata: {
		lastLogin: '2025-01-01T00:00:00Z',
		preferences: {
			theme: 'dark',
			notifications: true,
		},
	},
	tags: ['developer', 'admin'],
};

const result = userSchema['~standard'].validate(validUser);
console.log('\nValidation result:');
console.log(result.issues ? 'Invalid' : 'Valid');

// Example with simpler schema
const addressSchema = s
	.object({
		street: s.string().describe('Street address'),
		city: s.string().describe('City name'),
		state: s.string().describe('State or province'),
		zipCode: s.string().describe('Postal code'),
		country: s.string().describe('Country name'),
	})
	.describe('Physical mailing address');

const addressJSON = s.toJSONSchema(addressSchema);
console.log('\nAddress JSON Schema:');
console.log(JSON.stringify(addressJSON, null, 2));

// Example with array of objects
const productsSchema = s
	.array(
		s
			.object({
				id: s.string().describe('Product ID'),
				name: s.string().describe('Product name'),
				price: s.number().describe('Price in USD'),
				inStock: s.boolean().describe('Whether the product is in stock'),
			})
			.describe('Product information')
	)
	.describe('List of products');

const productsJSON = s.toJSONSchema(productsSchema);
console.log('\nProducts JSON Schema:');
console.log(JSON.stringify(productsJSON, null, 2));
