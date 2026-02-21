/**
 * Canonical MIME type map and content-type lookup.
 *
 * This is the single source of truth for extension → MIME type mappings
 * used across the CLI (build metadata, generated entry code) and runtime
 * (serveStatic).
 */

export const mimeTypes: Record<string, string> = {
	// Text and code
	css: 'text/css',
	csv: 'text/csv',
	htm: 'text/html',
	html: 'text/html',
	ics: 'text/calendar',
	js: 'application/javascript',
	mjs: 'application/javascript',
	cjs: 'application/javascript',
	json: 'application/json',
	jsonld: 'application/ld+json',
	map: 'application/json',
	md: 'text/markdown',
	markdown: 'text/markdown',
	txt: 'text/plain',
	text: 'text/plain',
	vcf: 'text/vcard',
	xml: 'application/xml',
	yaml: 'text/yaml',
	yml: 'text/yaml',

	// Images
	apng: 'image/apng',
	avif: 'image/avif',
	bmp: 'image/bmp',
	gif: 'image/gif',
	ico: 'image/x-icon',
	jpeg: 'image/jpeg',
	jpg: 'image/jpeg',
	jxl: 'image/jxl',
	png: 'image/png',
	svg: 'image/svg+xml',
	tif: 'image/tiff',
	tiff: 'image/tiff',
	webp: 'image/webp',

	// Fonts
	eot: 'application/vnd.ms-fontobject',
	otf: 'font/otf',
	ttf: 'font/ttf',
	woff: 'font/woff',
	woff2: 'font/woff2',

	// Audio
	aac: 'audio/aac',
	flac: 'audio/flac',
	m4a: 'audio/mp4',
	mid: 'audio/midi',
	midi: 'audio/midi',
	mp3: 'audio/mpeg',
	ogg: 'audio/ogg',
	oga: 'audio/ogg',
	opus: 'audio/opus',
	wav: 'audio/wav',
	weba: 'audio/webm',

	// Video
	avi: 'video/x-msvideo',
	m4v: 'video/mp4',
	mkv: 'video/x-matroska',
	mov: 'video/quicktime',
	mp4: 'video/mp4',
	ogv: 'video/ogg',
	webm: 'video/webm',

	// Documents and archives
	doc: 'application/msword',
	docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
	gz: 'application/gzip',
	odp: 'application/vnd.oasis.opendocument.presentation',
	ods: 'application/vnd.oasis.opendocument.spreadsheet',
	odt: 'application/vnd.oasis.opendocument.text',
	pdf: 'application/pdf',
	ppt: 'application/vnd.ms-powerpoint',
	pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
	rtf: 'application/rtf',
	tar: 'application/x-tar',
	xls: 'application/vnd.ms-excel',
	xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
	zip: 'application/zip',
	'7z': 'application/x-7z-compressed',

	// Web and application
	atom: 'application/atom+xml',
	glb: 'model/gltf-binary',
	gltf: 'model/gltf+json',
	rss: 'application/rss+xml',
	wasm: 'application/wasm',
	webmanifest: 'application/manifest+json',
	xsl: 'application/xslt+xml',
	xslt: 'application/xslt+xml',
};

export function getContentType(filename: string): string {
	const ext = filename.split('.').pop()?.toLowerCase();
	if (ext && ext in mimeTypes) {
		return mimeTypes[ext]!;
	}
	return 'application/octet-stream';
}
