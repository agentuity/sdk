import { resolve } from 'node:path';

/**
 * Normalize a project path to an absolute path for consistent DB keys
 */
export function normalizeProjectPath(cwd: string = process.cwd()): string {
	return resolve(cwd);
}

/**
 * Simple character-based embedding for local vector search
 * Not production-quality, but good enough for local dev/testing
 */
export function simpleEmbedding(text: string, dimensions = 128): number[] {
	const vec = new Array(dimensions).fill(0);
	const normalized = text.toLowerCase();

	for (let i = 0; i < normalized.length; i++) {
		const charCode = normalized.charCodeAt(i);
		vec[i % dimensions] += Math.sin(charCode * (i + 1));
		vec[(i * 2) % dimensions] += Math.cos(charCode);
	}

	// Normalize vector
	const magnitude = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0));
	return magnitude > 0 ? vec.map((v) => v / magnitude) : vec;
}

/**
 * Calculate cosine similarity between two vectors
 */
export function cosineSimilarity(a: number[], b: number[]): number {
	if (a.length !== b.length) {
		throw new Error('Vectors must have the same dimension');
	}

	const dot = a.reduce((sum, ai, i) => sum + ai * (b[i] ?? 0), 0);
	const normA = Math.sqrt(a.reduce((sum, ai) => sum + ai * ai, 0));
	const normB = Math.sqrt(b.reduce((sum, bi) => sum + bi * bi, 0));

	return normA > 0 && normB > 0 ? dot / (normA * normB) : 0;
}

/**
 * Get current timestamp in milliseconds
 */
export function now(): number {
	return Date.now();
}
