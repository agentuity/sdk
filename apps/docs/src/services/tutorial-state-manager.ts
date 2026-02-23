import { config } from '../config';

// Tutorial state management types
export interface TutorialProgress {
	tutorialId: string;
	currentStep: number;
	totalSteps: number;
	startedAt: string;
	completedAt?: string;
	lastAccessedAt: string;
}

export interface UserTutorialState {
	userId: string;
	tutorials: {
		[tutorialId: string]: TutorialProgress;
	};
}

// Simple state for agent communication
export interface TutorialState {
	tutorialId: string;
	currentStep: number;
}

// KV service interface matching Agentuity's KV service
interface KVService {
	get<T>(storeName: string, key: string): Promise<{ exists: boolean; data?: T }>;
	set(storeName: string, key: string, value: unknown): Promise<void>;
}

function getTutorialKey(userId: string): string {
	return `tutorial_state_${userId}`;
}

/**
 * Get the complete tutorial state for a user
 */
export async function getUserTutorialState(userId: string, kv: KVService): Promise<UserTutorialState> {
	const key = getTutorialKey(userId);
	const response = await kv.get<UserTutorialState>(config.kvStoreName, key);

	return response.exists && response.data ? response.data : {
		userId,
		tutorials: {}
	};
}

/**
 * Update tutorial progress for a user
 */
export async function updateTutorialProgress(
	userId: string,
	tutorialId: string,
	currentStep: number,
	totalSteps: number,
	kv: KVService
): Promise<void> {
	const state = await getUserTutorialState(userId, kv);

	const existing = state.tutorials[tutorialId];
	const now = new Date().toISOString();

	state.tutorials[tutorialId] = {
		tutorialId,
		currentStep,
		totalSteps,
		startedAt: existing?.startedAt || now,
		lastAccessedAt: now,
		...(currentStep >= totalSteps ? { completedAt: now } : {})
	};

	const key = getTutorialKey(userId);
	await kv.set(config.kvStoreName, key, state);
}

/**
 * Get the current active tutorial state for agent communication
 * Returns the most recently accessed tutorial that's not completed
 */
export async function getCurrentTutorialState(userId: string, kv: KVService): Promise<TutorialState | null> {
	const state = await getUserTutorialState(userId, kv);

	const tutorials = Object.values(state.tutorials);
	if (tutorials.length === 0) return null;

	// Find the most recently accessed tutorial that's not completed
	const activeTutorials = tutorials.filter(t => !t.completedAt);
	if (activeTutorials.length === 0) return null;

	const mostRecent = activeTutorials.reduce((latest, current) =>
		new Date(current.lastAccessedAt) > new Date(latest.lastAccessedAt) ? current : latest
	);

	return {
		tutorialId: mostRecent.tutorialId,
		currentStep: mostRecent.currentStep
	};
}

/**
 * Get tutorial progress for a specific tutorial
 */
export async function getTutorialProgress(userId: string, tutorialId: string, kv: KVService): Promise<TutorialProgress | null> {
	const state = await getUserTutorialState(userId, kv);
	return state.tutorials[tutorialId] || null;
}

/**
 * Mark a tutorial as completed
 */
export async function completeTutorial(userId: string, tutorialId: string, kv: KVService): Promise<void> {
	const state = await getUserTutorialState(userId, kv);

	if (state.tutorials[tutorialId]) {
		state.tutorials[tutorialId].completedAt = new Date().toISOString();
		state.tutorials[tutorialId].lastAccessedAt = new Date().toISOString();

		const key = getTutorialKey(userId);
		await kv.set(config.kvStoreName, key, state);
	}
}

/**
 * Get all completed tutorials for a user
 */
export async function getCompletedTutorials(userId: string, kv: KVService): Promise<TutorialProgress[]> {
	const state = await getUserTutorialState(userId, kv);
	return Object.values(state.tutorials).filter(t => t.completedAt);
}

/**
 * Get all active (in-progress) tutorials for a user
 */
export async function getActiveTutorials(userId: string, kv: KVService): Promise<TutorialProgress[]> {
	const state = await getUserTutorialState(userId, kv);
	return Object.values(state.tutorials).filter(t => !t.completedAt);
}

// Export as namespace for convenience
export const TutorialStateManager = {
	getUserTutorialState,
	updateTutorialProgress,
	getCurrentTutorialState,
	getTutorialProgress,
	completeTutorial,
	getCompletedTutorials,
	getActiveTutorials,
};
