import type { NextConfig } from 'next';
import { join } from 'path';

const nextConfig: NextConfig = {
	// Set workspace root to suppress lockfile detection warning
	outputFileTracingRoot: join(__dirname, '../../../..'),

	async rewrites() {
		return [
			{
				source: '/api/:path*',
				destination: 'http://localhost:3501/api/:path*',
			},
		];
	},
};

export default nextConfig;
