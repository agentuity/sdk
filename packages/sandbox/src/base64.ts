export function base64Encode(bytes: Uint8Array): string {
	const bufferCtor = globalThis.Buffer;
	if (bufferCtor) {
		return bufferCtor.from(bytes).toString('base64');
	}

	let binary = '';
	const chunkSize = 0x8000;
	for (let i = 0; i < bytes.length; i += chunkSize) {
		const chunk = bytes.subarray(i, i + chunkSize);
		binary += String.fromCharCode(...chunk);
	}
	return btoa(binary);
}
