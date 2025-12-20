import { afterEach, expect } from 'bun:test';
import { cleanup, screen } from '@testing-library/react';
import * as matchers from '@testing-library/jest-dom/matchers';

expect.extend(matchers);

// Optional: cleans up `render` after each test
afterEach(() => {
	cleanup();
});

export { render } from '@testing-library/react';
export { screen };
