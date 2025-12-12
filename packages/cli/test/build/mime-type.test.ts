import { describe, test, expect } from 'bun:test';
import { getCorrectMimeType } from '../../src/cmd/build/bundler';

describe('getCorrectMimeType', () => {
	test('should return correct MIME type for CSS files', () => {
		expect(getCorrectMimeType('styles.css', 'text/javascript;charset=utf-8')).toBe(
			'text/css;charset=utf-8'
		);
		expect(getCorrectMimeType('chunk/index-abc123.css', 'text/javascript;charset=utf-8')).toBe(
			'text/css;charset=utf-8'
		);
	});

	test('should return correct MIME type for JavaScript files', () => {
		expect(getCorrectMimeType('main.js', 'text/javascript;charset=utf-8')).toBe(
			'text/javascript;charset=utf-8'
		);
		expect(getCorrectMimeType('module.mjs', 'text/javascript;charset=utf-8')).toBe(
			'text/javascript;charset=utf-8'
		);
	});

	test('should return correct MIME type for JSON files', () => {
		expect(getCorrectMimeType('data.json', 'text/javascript;charset=utf-8')).toBe(
			'application/json;charset=utf-8'
		);
		expect(getCorrectMimeType('index.js.map', 'text/javascript;charset=utf-8')).toBe(
			'application/json;charset=utf-8'
		);
	});

	test('should return correct MIME type for image files', () => {
		expect(getCorrectMimeType('logo.svg', 'text/javascript;charset=utf-8')).toBe('image/svg+xml');
		expect(getCorrectMimeType('photo.png', 'text/javascript;charset=utf-8')).toBe('image/png');
		expect(getCorrectMimeType('banner.jpg', 'text/javascript;charset=utf-8')).toBe('image/jpeg');
		expect(getCorrectMimeType('image.jpeg', 'text/javascript;charset=utf-8')).toBe('image/jpeg');
		expect(getCorrectMimeType('animation.gif', 'text/javascript;charset=utf-8')).toBe('image/gif');
		expect(getCorrectMimeType('modern.webp', 'text/javascript;charset=utf-8')).toBe('image/webp');
	});

	test('should return correct MIME type for font files', () => {
		expect(getCorrectMimeType('font.woff', 'text/javascript;charset=utf-8')).toBe('font/woff');
		expect(getCorrectMimeType('font.woff2', 'text/javascript;charset=utf-8')).toBe('font/woff2');
		expect(getCorrectMimeType('font.ttf', 'text/javascript;charset=utf-8')).toBe('font/ttf');
		expect(getCorrectMimeType('font.otf', 'text/javascript;charset=utf-8')).toBe('font/otf');
	});

	test('should handle case-insensitive extensions', () => {
		expect(getCorrectMimeType('STYLES.CSS', 'text/javascript;charset=utf-8')).toBe(
			'text/css;charset=utf-8'
		);
		expect(getCorrectMimeType('Image.PNG', 'text/javascript;charset=utf-8')).toBe('image/png');
	});

	test('should fall back to Bun type for unknown extensions', () => {
		expect(getCorrectMimeType('file.xyz', 'application/octet-stream')).toBe(
			'application/octet-stream'
		);
		expect(getCorrectMimeType('noextension', 'text/plain')).toBe('text/plain');
	});

	test('should handle files with multiple dots in path', () => {
		expect(getCorrectMimeType('path/to/file.min.css', 'text/javascript;charset=utf-8')).toBe(
			'text/css;charset=utf-8'
		);
		expect(getCorrectMimeType('bundle.es2020.js', 'text/javascript;charset=utf-8')).toBe(
			'text/javascript;charset=utf-8'
		);
	});

	test('should use extension-based mapping when Bun type is incorrect', () => {
		// This is the actual bug case - CSS file returns as text/javascript
		expect(getCorrectMimeType('index-pvgqwfs9.css', 'text/javascript;charset=utf-8')).toBe(
			'text/css;charset=utf-8'
		);
	});

	test('should preserve Bun type when extension mapping is correct', () => {
		// When Bun correctly identifies the type, we override it anyway with our mapping
		expect(getCorrectMimeType('styles.css', 'text/css;charset=utf-8')).toBe(
			'text/css;charset=utf-8'
		);
	});
});
