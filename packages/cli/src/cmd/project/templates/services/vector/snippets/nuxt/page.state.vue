interface SimilarHit {
	key: string;
	similarity: number;
	metadata?: { language?: string; translation?: string };
}
const similar = ref<SimilarHit[]>([]);
