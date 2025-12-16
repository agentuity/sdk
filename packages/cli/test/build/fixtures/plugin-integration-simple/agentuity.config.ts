import tailwindcss from 'bun-plugin-tailwind';

export default function config(phase, context) {
	context.logger.info('Config executed for phase: ' + phase);

	if (phase === 'web') {
		context.logger.info('Adding Tailwind plugin for web phase');
		return {
			plugins: [tailwindcss],
		};
	}

	return {};
}
