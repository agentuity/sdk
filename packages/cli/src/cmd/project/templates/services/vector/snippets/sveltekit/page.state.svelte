interface SimilarHit {
	key: string;
	similarity: number;
	metadata?: { language?: string; translation?: string };
}
let similar = $state<SimilarHit[]>([]);
