export type EntityType = 'user' | 'org' | 'project' | 'repo' | 'agent' | 'model';

export interface EntityRepresentation {
	entityId: string;
	entityType: EntityType;
	metadata: Record<string, unknown>;
	conclusions: {
		explicit?: Conclusion[];
		deductive?: Conclusion[];
		inductive?: Conclusion[];
		abductive?: Conclusion[];
	};
	corrections: Correction[];
	patterns: Pattern[];
	relationships: Relationship[];
	recentSessions: string[];
	createdAt: string;
	updatedAt: string;
	lastReasonedAt?: string;
}

export interface Conclusion {
	id: string;
	type: 'explicit' | 'deductive' | 'inductive' | 'abductive';
	content: string;
	premises?: string[];
	observations?: string[];
	occurrences?: number;
	confidence: 'high' | 'medium' | 'low' | 'uncertain';
	sourceSession?: string;
	sourceTimestamp?: string;
	createdAt: string;
	updatedAt?: string;
	supersededBy?: string;
}

export interface Correction {
	id: string;
	content: string;
	why: string;
	confidence: 'high' | 'medium' | 'low';
	sourceSession?: string;
	createdAt: string;
}

export interface Pattern {
	id: string;
	name: string;
	description: string;
	occurrences: number;
	examples?: string[];
	tags?: string[];
	createdAt: string;
	updatedAt?: string;
}

export interface Relationship {
	id: string;
	fromEntity: string;
	toEntity: string;
	relationshipType: string;
	metadata?: Record<string, unknown>;
	createdAt: string;
}

export interface AgentPerspective {
	perspectiveId: string;
	observer: string;
	observed: string;
	observerModel?: string;
	observedModel?: string;
	conclusions: Conclusion[];
	recommendations?: string[];
	createdAt: string;
	updatedAt: string;
}
