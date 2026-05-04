import { onMount } from 'svelte';

interface Translation {
	id: number;
	sourceText: string;
	language: string;
	translation: string;
	model: string | null;
	tokens: number | null;
	createdAt: string | null;
}
