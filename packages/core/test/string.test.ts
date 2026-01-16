import { describe, test, expect } from 'bun:test';
import { toCamelCase, toPascalCase } from '../src/string';

describe('toCamelCase', () => {
	describe('dash-separated strings', () => {
		test('should convert dash-separated to camelCase', () => {
			expect(toCamelCase('my-agent')).toBe('myAgent');
			expect(toCamelCase('user-profile-data')).toBe('userProfileData');
			expect(toCamelCase('api-key-manager')).toBe('apiKeyManager');
		});

		test('should handle multiple consecutive dashes', () => {
			expect(toCamelCase('my--multiple--dashes')).toBe('myMultipleDashes');
			expect(toCamelCase('test---value')).toBe('testValue');
		});

		test('should handle leading dash', () => {
			expect(toCamelCase('-leading-dash')).toBe('leadingDash');
			expect(toCamelCase('---multiple')).toBe('multiple');
		});

		test('should handle trailing dash', () => {
			expect(toCamelCase('trailing-dash-')).toBe('trailingDash');
			expect(toCamelCase('value---')).toBe('value');
		});
	});

	describe('underscore-separated strings', () => {
		test('should convert underscore-separated to camelCase', () => {
			expect(toCamelCase('my_agent')).toBe('myAgent');
			expect(toCamelCase('user_profile_data')).toBe('userProfileData');
			expect(toCamelCase('api_key_manager')).toBe('apiKeyManager');
		});

		test('should handle multiple consecutive underscores', () => {
			expect(toCamelCase('my__value')).toBe('myValue');
			expect(toCamelCase('test___data')).toBe('testData');
		});

		test('should handle leading underscore', () => {
			expect(toCamelCase('_private_value')).toBe('privateValue');
			expect(toCamelCase('___multiple')).toBe('multiple');
		});

		test('should handle trailing underscore', () => {
			expect(toCamelCase('value_')).toBe('value');
			expect(toCamelCase('data___')).toBe('data');
		});
	});

	describe('space-separated strings', () => {
		test('should convert space-separated to camelCase', () => {
			expect(toCamelCase('my agent')).toBe('myAgent');
			expect(toCamelCase('user profile data')).toBe('userProfileData');
			expect(toCamelCase('api key manager')).toBe('apiKeyManager');
		});

		test('should handle multiple consecutive spaces', () => {
			expect(toCamelCase('my  value')).toBe('myValue');
			expect(toCamelCase('test   data')).toBe('testData');
		});

		test('should handle leading spaces', () => {
			expect(toCamelCase(' leading space')).toBe('leadingSpace');
			expect(toCamelCase('   multiple')).toBe('multiple');
		});

		test('should handle trailing spaces', () => {
			expect(toCamelCase('value ')).toBe('value');
			expect(toCamelCase('data   ')).toBe('data');
		});
	});

	describe('mixed separators', () => {
		test('should handle mixed dash, underscore, and space', () => {
			expect(toCamelCase('my-agent_name value')).toBe('myAgentNameValue');
			expect(toCamelCase('user_profile-data test')).toBe('userProfileDataTest');
		});

		test('should handle consecutive mixed separators', () => {
			expect(toCamelCase('test-_value')).toBe('testValue');
			expect(toCamelCase('data_ -key')).toBe('dataKey');
		});
	});

	describe('already camelCase strings', () => {
		test('should preserve already camelCase strings', () => {
			expect(toCamelCase('myAgent')).toBe('myAgent');
			expect(toCamelCase('userProfileData')).toBe('userProfileData');
			expect(toCamelCase('apiKeyManager')).toBe('apiKeyManager');
		});

		test('should lowercase first char if PascalCase', () => {
			expect(toCamelCase('MyAgent')).toBe('myAgent');
			expect(toCamelCase('UserProfile')).toBe('userProfile');
		});
	});

	describe('edge cases', () => {
		test('should handle empty string', () => {
			expect(toCamelCase('')).toBe('');
		});

		test('should handle single character', () => {
			expect(toCamelCase('a')).toBe('a');
			expect(toCamelCase('A')).toBe('a');
		});

		test('should handle single word', () => {
			expect(toCamelCase('word')).toBe('word');
			expect(toCamelCase('WORD')).toBe('wORD'); // Only lowercases first char
		});

		test('should handle numbers in middle of string', () => {
			expect(toCamelCase('my-agent-2')).toBe('myAgent2');
			expect(toCamelCase('user_123_data')).toBe('user123Data');
		});

		test('should prefix with underscore when result starts with digit (invalid identifier)', () => {
			expect(toCamelCase('123-agent')).toBe('_123Agent');
			expect(toCamelCase('123')).toBe('_123');
			expect(toCamelCase('0-test')).toBe('_0Test');
			expect(toCamelCase('9agent')).toBe('_9agent');
			expect(toCamelCase('1_2_3')).toBe('_123');
		});

		test('should handle only separators', () => {
			expect(toCamelCase('---')).toBe('');
			expect(toCamelCase('___')).toBe('');
			expect(toCamelCase('   ')).toBe('');
		});

		test('should preserve uppercase letters after separator', () => {
			expect(toCamelCase('my-API')).toBe('myAPI'); // Preserves case after separator
			expect(toCamelCase('user-ID')).toBe('userID');
		});
	});
});

describe('toPascalCase', () => {
	describe('dash-separated strings', () => {
		test('should convert dash-separated to PascalCase', () => {
			expect(toPascalCase('my-agent')).toBe('MyAgent');
			expect(toPascalCase('user-profile-data')).toBe('UserProfileData');
			expect(toPascalCase('api-key-manager')).toBe('ApiKeyManager');
		});

		test('should handle multiple consecutive dashes', () => {
			expect(toPascalCase('my--multiple--dashes')).toBe('MyMultipleDashes');
		});
	});

	describe('underscore-separated strings', () => {
		test('should convert underscore-separated to PascalCase', () => {
			expect(toPascalCase('my_agent')).toBe('MyAgent');
			expect(toPascalCase('user_profile_data')).toBe('UserProfileData');
			expect(toPascalCase('api_key_manager')).toBe('ApiKeyManager');
		});
	});

	describe('space-separated strings', () => {
		test('should convert space-separated to PascalCase', () => {
			expect(toPascalCase('my agent')).toBe('MyAgent');
			expect(toPascalCase('user profile data')).toBe('UserProfileData');
			expect(toPascalCase('api key manager')).toBe('ApiKeyManager');
		});
	});

	describe('mixed separators', () => {
		test('should handle mixed separators', () => {
			expect(toPascalCase('my-agent_name value')).toBe('MyAgentNameValue');
			expect(toPascalCase('user_profile-data test')).toBe('UserProfileDataTest');
		});
	});

	describe('already PascalCase strings', () => {
		test('should preserve already PascalCase strings', () => {
			expect(toPascalCase('MyAgent')).toBe('MyAgent');
			expect(toPascalCase('UserProfileData')).toBe('UserProfileData');
			expect(toPascalCase('ApiKeyManager')).toBe('ApiKeyManager');
		});

		test('should capitalize first char if camelCase', () => {
			expect(toPascalCase('myAgent')).toBe('MyAgent');
			expect(toPascalCase('userProfile')).toBe('UserProfile');
		});
	});

	describe('edge cases', () => {
		test('should handle empty string', () => {
			expect(toPascalCase('')).toBe('');
		});

		test('should handle single character', () => {
			expect(toPascalCase('a')).toBe('A');
			expect(toPascalCase('A')).toBe('A');
		});

		test('should handle single word', () => {
			expect(toPascalCase('word')).toBe('Word');
			expect(toPascalCase('WORD')).toBe('WORD'); // Only uppercases first char
		});

		test('should handle numbers in middle of string', () => {
			expect(toPascalCase('my-agent-2')).toBe('MyAgent2');
			expect(toPascalCase('user_123_data')).toBe('User123Data');
		});

		test('should prefix with underscore when result starts with digit (invalid identifier)', () => {
			expect(toPascalCase('123-agent')).toBe('_123Agent');
			expect(toPascalCase('123')).toBe('_123');
			expect(toPascalCase('0-test')).toBe('_0Test');
			expect(toPascalCase('9agent')).toBe('_9agent');
		});

		test('should handle only separators', () => {
			expect(toPascalCase('---')).toBe('');
			expect(toPascalCase('___')).toBe('');
			expect(toPascalCase('   ')).toBe('');
		});
	});

	describe('uses toCamelCase internally', () => {
		test('should behave consistently with toCamelCase', () => {
			const inputs = ['my-agent', 'user_profile', 'api key', 'test--value', 'data___key'];

			inputs.forEach((input) => {
				const camel = toCamelCase(input);
				const pascal = toPascalCase(input);
				// Pascal should be camel with first char uppercased
				expect(pascal).toBe(camel.charAt(0).toUpperCase() + camel.slice(1));
			});
		});
	});
});
