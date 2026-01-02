/**
 * Agentuity Configuration - BetterAuth Template
 *
 * This configuration adds the Tailwind CSS Vite plugin for your web application.
 */

import tailwindcss from '@tailwindcss/vite';
import type { AgentuityConfig } from '@agentuity/cli';

export default {
	plugins: [tailwindcss()],
} satisfies AgentuityConfig;
