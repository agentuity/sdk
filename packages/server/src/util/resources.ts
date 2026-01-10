export type ResourceValidationResult =
	| { valid: true; value: number }
	| { valid: false; error: string };

/**
 * Validates and parses a CPU spec string.
 * Valid formats:
 * - "500m" (millicores)
 * - "1" or "2" (cores, converted to millicores)
 * - "0.5" (fractional cores, converted to millicores)
 */
export function validateCPUSpec(input: string): ResourceValidationResult {
	if (!input || typeof input !== 'string') {
		return { valid: false, error: 'CPU value is required' };
	}

	const trimmed = input.trim();

	// Match millicores format: "500m", "1000m"
	const milliMatch = trimmed.match(/^([0-9]+)m$/);
	if (milliMatch) {
		const value = parseInt(milliMatch[1], 10);
		if (value <= 0) {
			return { valid: false, error: `Invalid CPU value "${input}": must be greater than 0` };
		}
		return { valid: true, value };
	}

	// Match cores format: "1", "2", "0.5"
	const coreMatch = trimmed.match(/^([0-9]*\.?[0-9]+)$/);
	if (coreMatch) {
		const cores = parseFloat(coreMatch[1]);
		if (isNaN(cores) || cores <= 0) {
			return { valid: false, error: `Invalid CPU value "${input}": must be a positive number` };
		}
		const millicores = Math.round(cores * 1000);
		if (millicores <= 0) {
			return { valid: false, error: `Invalid CPU value "${input}": must be at least 1m (0.001 cores)` };
		}
		return { valid: true, value: millicores };
	}

	return {
		valid: false,
		error: `Invalid CPU format "${input}". Use millicores (e.g., "500m", "1000m") or cores (e.g., "1", "2", "0.5")`,
	};
}

const memoryMultipliers: Record<string, number> = {
	k: 1000,
	M: 1000 ** 2,
	G: 1000 ** 3,
	T: 1000 ** 4,
	P: 1000 ** 5,
	E: 1000 ** 6,
	Ki: 1024,
	Mi: 1024 ** 2,
	Gi: 1024 ** 3,
	Ti: 1024 ** 4,
	Pi: 1024 ** 5,
	Ei: 1024 ** 6,
};

const validMemoryUnits = Object.keys(memoryMultipliers).join(', ');

/**
 * Validates and parses a memory/disk spec string.
 * Valid formats:
 * - "500Mi", "1Gi", "2Ti" (binary units)
 * - "500M", "1G", "2T" (decimal units)
 * - "1073741824" (raw bytes)
 */
export function validateMemorySpec(
	input: string,
	fieldName: 'memory' | 'disk' = 'memory'
): ResourceValidationResult {
	if (!input || typeof input !== 'string') {
		return { valid: false, error: `${fieldName} value is required` };
	}

	const trimmed = input.trim();

	// Match unit format: "500Mi", "1Gi", "2G"
	const unitMatch = trimmed.match(/^([0-9]+)([A-Za-z]{1,2})$/);
	if (unitMatch) {
		const amount = parseInt(unitMatch[1], 10);
		const unit = unitMatch[2];

		if (amount <= 0) {
			return {
				valid: false,
				error: `Invalid ${fieldName} value "${input}": must be greater than 0`,
			};
		}

		const multiplier = memoryMultipliers[unit];
		if (multiplier === undefined) {
			return {
				valid: false,
				error: `Invalid ${fieldName} unit "${unit}" in "${input}". Valid units: ${validMemoryUnits}`,
			};
		}

		return { valid: true, value: amount * multiplier };
	}

	// Match raw bytes: "1073741824"
	const bytesMatch = trimmed.match(/^([0-9]+)$/);
	if (bytesMatch) {
		const value = parseInt(bytesMatch[1], 10);
		if (value <= 0) {
			return {
				valid: false,
				error: `Invalid ${fieldName} value "${input}": must be greater than 0`,
			};
		}
		return { valid: true, value };
	}

	return {
		valid: false,
		error: `Invalid ${fieldName} format "${input}". Use units (e.g., "500Mi", "1Gi", "2G") or bytes (e.g., "1073741824")`,
	};
}

export interface ResourcesConfig {
	cpu?: string;
	memory?: string;
	disk?: string;
}

export interface ValidatedResources {
	cpuUnits?: number;
	memoryUnits?: number;
	diskUnits?: number;
}

/**
 * Validates all resource specs and returns either validated values or an array of errors.
 */
export function validateResources(
	resources: ResourcesConfig
): { valid: true; values: ValidatedResources } | { valid: false; errors: string[] } {
	const errors: string[] = [];
	const values: ValidatedResources = {};

	if (resources.cpu) {
		const result = validateCPUSpec(resources.cpu);
		if (result.valid) {
			if (!Number.isFinite(result.value)) {
				errors.push(`Invalid CPU value "${resources.cpu}": parsed to non-finite number`);
			} else {
				values.cpuUnits = result.value;
			}
		} else {
			errors.push(result.error);
		}
	}

	if (resources.memory) {
		const result = validateMemorySpec(resources.memory, 'memory');
		if (result.valid) {
			if (!Number.isFinite(result.value)) {
				errors.push(`Invalid memory value "${resources.memory}": parsed to non-finite number`);
			} else {
				values.memoryUnits = result.value;
			}
		} else {
			errors.push(result.error);
		}
	}

	if (resources.disk) {
		const result = validateMemorySpec(resources.disk, 'disk');
		if (result.valid) {
			if (!Number.isFinite(result.value)) {
				errors.push(`Invalid disk value "${resources.disk}": parsed to non-finite number`);
			} else {
				values.diskUnits = result.value;
			}
		} else {
			errors.push(result.error);
		}
	}

	if (errors.length > 0) {
		return { valid: false, errors };
	}

	return { valid: true, values };
}
