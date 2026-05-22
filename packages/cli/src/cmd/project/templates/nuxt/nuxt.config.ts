import tailwindcss from '@tailwindcss/vite';

export default defineNuxtConfig({
	css: ['~/assets/css/main.css'],
	vite: {
		plugins: [tailwindcss()],
		ssr: {
			noExternal: ['pg'],
		},
	},
});
