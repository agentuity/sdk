/**
 * Test SessionEventProvider that captures session events for verification
 *
 * Used to verify that agentIds are correctly populated in session complete events.
 */

import type {
	SessionEventProvider,
	SessionStartEvent,
	SessionCompleteEvent,
} from '@agentuity/core';

export interface CapturedSessionEvent {
	type: 'start' | 'complete';
	event: SessionStartEvent | SessionCompleteEvent;
	timestamp: number;
}

/**
 * SessionEventProvider that captures events for testing verification
 */
export class TestSessionEventProvider implements SessionEventProvider {
	private events: Map<string, CapturedSessionEvent[]> = new Map();
	private completedSessions: Map<string, SessionCompleteEvent> = new Map();

	async start(event: SessionStartEvent): Promise<void> {
		const sessionId = event.id;
		if (!this.events.has(sessionId)) {
			this.events.set(sessionId, []);
		}
		this.events.get(sessionId)!.push({
			type: 'start',
			event,
			timestamp: Date.now(),
		});
	}

	async complete(event: SessionCompleteEvent): Promise<void> {
		const sessionId = event.id;
		if (!this.events.has(sessionId)) {
			this.events.set(sessionId, []);
		}
		this.events.get(sessionId)!.push({
			type: 'complete',
			event,
			timestamp: Date.now(),
		});

		// Store completed session for easy lookup
		this.completedSessions.set(sessionId, event);
	}

	/**
	 * Get all events for a session
	 */
	getSessionEvents(sessionId: string): CapturedSessionEvent[] {
		return this.events.get(sessionId) || [];
	}

	/**
	 * Get the completed session event (if any)
	 */
	getCompletedSession(sessionId: string): SessionCompleteEvent | undefined {
		return this.completedSessions.get(sessionId);
	}

	/**
	 * Get agentIds from a completed session
	 */
	getAgentIds(sessionId: string): string[] | undefined {
		const event = this.completedSessions.get(sessionId);
		return event?.agentIds;
	}

	/**
	 * Get all captured sessions
	 */
	getAllSessions(): string[] {
		return [...this.events.keys()];
	}

	/**
	 * Get the most recently completed session
	 */
	getLastCompletedSession(): SessionCompleteEvent | undefined {
		const sessions = [...this.completedSessions.values()];
		return sessions[sessions.length - 1];
	}

	/**
	 * Clear all captured events
	 */
	clear(): void {
		this.events.clear();
		this.completedSessions.clear();
	}

	/**
	 * Get event count
	 */
	getEventCount(): number {
		let count = 0;
		for (const events of this.events.values()) {
			count += events.length;
		}
		return count;
	}
}

// Singleton instance for use across tests
export const testSessionEventProvider = new TestSessionEventProvider();
