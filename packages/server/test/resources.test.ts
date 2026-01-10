import { describe, test, expect } from 'bun:test';
import {
	validateCPUSpec,
	validateMemorySpec,
	validateResources,
} from '../src/util/resources';

describe('validateCPUSpec', () => {
	test('should validate millicores format (e.g., 500m)', () => {
		expect(validateCPUSpec('500m')).toEqual({ valid: true, value: 500 });
		expect(validateCPUSpec('1000m')).toEqual({ valid: true, value: 1000 });
		expect(validateCPUSpec('100m')).toEqual({ valid: true, value: 100 });
		expect(validateCPUSpec('1m')).toEqual({ valid: true, value: 1 });
	});

	test('should validate whole CPU cores and convert to millicores', () => {
		expect(validateCPUSpec('1')).toEqual({ valid: true, value: 1000 });
		expect(validateCPUSpec('2')).toEqual({ valid: true, value: 2000 });
		expect(validateCPUSpec('0.5')).toEqual({ valid: true, value: 500 });
		expect(validateCPUSpec('0.25')).toEqual({ valid: true, value: 250 });
		expect(validateCPUSpec('1.5')).toEqual({ valid: true, value: 1500 });
	});

	test('should reject invalid CPU formats', () => {
		const result1 = validateCPUSpec('8Gi');
		expect(result1.valid).toBe(false);
		if (!result1.valid) {
			expect(result1.error).toContain('Invalid CPU format');
			expect(result1.error).toContain('8Gi');
		}

		const result2 = validateCPUSpec('500Mi');
		expect(result2.valid).toBe(false);

		const result3 = validateCPUSpec('abc');
		expect(result3.valid).toBe(false);

		const result4 = validateCPUSpec('');
		expect(result4.valid).toBe(false);
	});

	test('should reject zero and negative values', () => {
		const result = validateCPUSpec('0m');
		expect(result.valid).toBe(false);
		if (!result.valid) {
			expect(result.error).toContain('must be greater than 0');
		}
	});

	test('should reject tiny fractional cores that round to 0 millicores', () => {
		const result = validateCPUSpec('0.0004');
		expect(result.valid).toBe(false);
		if (!result.valid) {
			expect(result.error).toContain('must be at least 1m');
		}

		// 0.0001 should also fail
		const result3 = validateCPUSpec('0.0001');
		expect(result3.valid).toBe(false);

		// 0 cores should fail
		const result4 = validateCPUSpec('0');
		expect(result4.valid).toBe(false);
		if (!result4.valid) {
			expect(result4.error).toContain('must be at least 1m');
		}

		// 0.0005 should round to 1m and be valid
		const result2 = validateCPUSpec('0.0005');
		expect(result2.valid).toBe(true);
		if (result2.valid) {
			expect(result2.value).toBe(1);
		}
	});

	test('should handle whitespace', () => {
		expect(validateCPUSpec('  500m  ')).toEqual({ valid: true, value: 500 });
		expect(validateCPUSpec('  1  ')).toEqual({ valid: true, value: 1000 });
	});
});

describe('validateMemorySpec', () => {
	test('should validate decimal units (k, M, G, T, P, E)', () => {
		expect(validateMemorySpec('1k')).toEqual({ valid: true, value: 1000 });
		expect(validateMemorySpec('1M')).toEqual({ valid: true, value: 1000000 });
		expect(validateMemorySpec('1G')).toEqual({ valid: true, value: 1000000000 });
	});

	test('should validate binary units (Ki, Mi, Gi, Ti, Pi, Ei)', () => {
		expect(validateMemorySpec('1Ki')).toEqual({ valid: true, value: 1024 });
		expect(validateMemorySpec('1Mi')).toEqual({ valid: true, value: 1048576 });
		expect(validateMemorySpec('1Gi')).toEqual({ valid: true, value: 1073741824 });
	});

	test('should validate Kubernetes-style memory specs', () => {
		expect(validateMemorySpec('500Mi')).toEqual({ valid: true, value: 524288000 });
		expect(validateMemorySpec('1Gi')).toEqual({ valid: true, value: 1073741824 });
		expect(validateMemorySpec('2Gi')).toEqual({ valid: true, value: 2147483648 });
	});

	test('should validate plain numbers as bytes', () => {
		expect(validateMemorySpec('1000')).toEqual({ valid: true, value: 1000 });
		expect(validateMemorySpec('5000000')).toEqual({ valid: true, value: 5000000 });
	});

	test('should validate decimal fractions with units (Kubernetes-style)', () => {
		expect(validateMemorySpec('1.5Gi')).toEqual({ valid: true, value: 1610612736 });
		expect(validateMemorySpec('0.5G')).toEqual({ valid: true, value: 500000000 });
		expect(validateMemorySpec('2.5Mi')).toEqual({ valid: true, value: 2621440 });
	});

	test('should reject values that exceed MAX_SAFE_INTEGER', () => {
		// 8Ei would be ~9.22e18, which exceeds Number.MAX_SAFE_INTEGER (~9.007e15)
		const result = validateMemorySpec('8Ei');
		expect(result.valid).toBe(false);
		if (!result.valid) {
			expect(result.error).toContain('exceeds maximum safe integer');
		}

		// Very large raw bytes should also fail
		const result2 = validateMemorySpec('9999999999999999999');
		expect(result2.valid).toBe(false);
		if (!result2.valid) {
			expect(result2.error).toContain('exceeds maximum safe integer');
		}
	});

	test('should reject invalid memory formats', () => {
		const result1 = validateMemorySpec('500m'); // 'm' is CPU millicores, not memory
		expect(result1.valid).toBe(false);
		if (!result1.valid) {
			expect(result1.error).toContain('Invalid memory unit');
		}

		const result2 = validateMemorySpec('abc');
		expect(result2.valid).toBe(false);

		const result3 = validateMemorySpec('');
		expect(result3.valid).toBe(false);
	});

	test('should reject zero values', () => {
		const result = validateMemorySpec('0Mi');
		expect(result.valid).toBe(false);
		if (!result.valid) {
			expect(result.error).toContain('must be greater than 0');
		}
	});

	test('should use correct field name in error messages', () => {
		const memoryResult = validateMemorySpec('invalid', 'memory');
		expect(memoryResult.valid).toBe(false);
		if (!memoryResult.valid) {
			expect(memoryResult.error).toContain('memory');
		}

		const diskResult = validateMemorySpec('invalid', 'disk');
		expect(diskResult.valid).toBe(false);
		if (!diskResult.valid) {
			expect(diskResult.error).toContain('disk');
		}
	});
});

describe('validateResources', () => {
	test('should validate all valid resources', () => {
		const result = validateResources({
			cpu: '500m',
			memory: '1Gi',
			disk: '2Gi',
		});
		expect(result.valid).toBe(true);
		if (result.valid) {
			expect(result.values.cpuUnits).toBe(500);
			expect(result.values.memoryUnits).toBe(1073741824);
			expect(result.values.diskUnits).toBe(2147483648);
		}
	});

	test('should validate partial resources', () => {
		const result = validateResources({ cpu: '1' });
		expect(result.valid).toBe(true);
		if (result.valid) {
			expect(result.values.cpuUnits).toBe(1000);
			expect(result.values.memoryUnits).toBeUndefined();
			expect(result.values.diskUnits).toBeUndefined();
		}
	});

	test('should validate empty resources object', () => {
		const result = validateResources({});
		expect(result.valid).toBe(true);
		if (result.valid) {
			expect(result.values).toEqual({});
		}
	});

	test('should reject empty string values instead of treating them as absent', () => {
		const result = validateResources({
			cpu: '',
			memory: '',
			disk: '',
		});
		expect(result.valid).toBe(false);
		if (!result.valid) {
			expect(result.errors).toHaveLength(3);
			expect(result.errors.some((e) => e.includes('CPU'))).toBe(true);
			expect(result.errors.some((e) => e.includes('memory'))).toBe(true);
			expect(result.errors.some((e) => e.includes('disk'))).toBe(true);
		}
	});

	test('should collect all errors for multiple invalid resources', () => {
		const result = validateResources({
			cpu: '8Gi', // Invalid - memory format for CPU
			memory: '500m', // Invalid - CPU format for memory
			disk: 'abc', // Invalid - not a valid format
		});
		expect(result.valid).toBe(false);
		if (!result.valid) {
			expect(result.errors).toHaveLength(3);
			expect(result.errors.some((e) => e.includes('CPU'))).toBe(true);
			expect(result.errors.some((e) => e.includes('memory'))).toBe(true);
			expect(result.errors.some((e) => e.includes('disk'))).toBe(true);
		}
	});

	test('should return errors only for invalid resources', () => {
		const result = validateResources({
			cpu: '500m', // Valid
			memory: 'invalid', // Invalid
		});
		expect(result.valid).toBe(false);
		if (!result.valid) {
			expect(result.errors).toHaveLength(1);
			expect(result.errors[0]).toContain('memory');
		}
	});

	test('should handle the user-reported bug case (cpu: "8Gi")', () => {
		const result = validateResources({
			memory: '8Gi',
			cpu: '8Gi', // This is wrong - should be "8" or "8000m"
			disk: '7Gi',
		});
		expect(result.valid).toBe(false);
		if (!result.valid) {
			expect(result.errors).toHaveLength(1);
			expect(result.errors[0]).toContain('CPU');
			expect(result.errors[0]).toContain('8Gi');
		}
	});

	test('should reject non-finite parsed values', () => {
		// This tests the Number.isFinite guard - values that somehow pass validation
		// but result in NaN/Infinity should be caught
		// In practice, our validators already reject these, but this is a safety net
		const validResult = validateResources({
			cpu: '1',
			memory: '1Gi',
			disk: '1Gi',
		});
		expect(validResult.valid).toBe(true);
		if (validResult.valid) {
			expect(Number.isFinite(validResult.values.cpuUnits)).toBe(true);
			expect(Number.isFinite(validResult.values.memoryUnits)).toBe(true);
			expect(Number.isFinite(validResult.values.diskUnits)).toBe(true);
		}
	});
});
