/** Hourly Review on this Assistant instance. Not a Worker cron. */
export const REVIEW_INTERVAL_SECONDS = 60 * 60;

/** Dispatched signal body. Exact product intent. */
export const REVIEW_SIGNAL_BODY =
	'Review recent notes. Prefer a new Note over updating an existing NoteId. Write a note if something is useful. Stay quiet otherwise.';

/**
 * Always-on. After a User joins a Review, stop that look and answer.
 * Do not unmount upsertNote.
 */
export const REVIEW_JOIN_INSTRUCTION =
	'If a User message joins this Review, do not continue that look. Write no more Notes from the Review. Answer the User.';

/** Extra look rules while the current delivery is the scheduled Review. */
export const REVIEW_LOOK_INSTRUCTION =
	'This delivery is a Review, not a User message. Prefer a new Note over updating an existing NoteId. Write a note with upsertNote if something is useful. Prefer creating a new Note; updating a known NoteId is allowed. If nothing is useful, write no Note and no assistant text. Do not say "Nothing to update."';

export type ReviewDelivery = {
	kind: string;
	type?: string;
};

export type ReviewAgentState = {
	lastScheduleAt?: number;
};

export type HeartbeatHost = {
	name: string;
	state: ReviewAgentState;
	setState: (state: ReviewAgentState) => void;
};

export type ReviewDispatchRequest = {
	id: string;
	message: {
		kind: 'signal';
		type: 'schedule';
		body: string;
	};
};

export function isScheduleReview(delivery: ReviewDelivery): boolean {
	return delivery.kind === 'signal' && delivery.type === 'schedule';
}

export function reviewInstructions(delivery: ReviewDelivery): string {
	const parts = [
		'You keep notes for this user. Prefer short replies.',
		REVIEW_JOIN_INSTRUCTION,
	];
	if (isScheduleReview(delivery)) {
		parts.push(REVIEW_LOOK_INSTRUCTION);
	}
	return parts.join(' ');
}

/**
 * Heartbeat dispatches this instance address (`user-${userId}`), never a raw User id.
 * Rejects a name that is not an address so a session User cannot slip through.
 */
export function instanceAddressForDispatch(instanceName: string): string {
	if (!instanceName.startsWith('user-') || instanceName === 'user-') {
		throw new Error('heartbeat must dispatch this instance address, never a raw User id');
	}
	return instanceName;
}

export function instanceNameOf(agent: object): string {
	if (!('name' in agent) || typeof agent.name !== 'string') {
		throw new Error('heartbeat must dispatch this instance address, never a raw User id');
	}
	return instanceAddressForDispatch(agent.name);
}

export function shouldDispatchReview(lastScheduleAt: unknown, now: number): boolean {
	if (typeof lastScheduleAt !== 'number' || !Number.isFinite(lastScheduleAt)) {
		return true;
	}
	return now - lastScheduleAt >= REVIEW_INTERVAL_SECONDS * 1000;
}

export function reviewDispatchRequest(instanceName: string): ReviewDispatchRequest {
	return {
		id: instanceAddressForDispatch(instanceName),
		message: {
			kind: 'signal',
			type: 'schedule',
			body: REVIEW_SIGNAL_BODY,
		},
	};
}

/**
 * Dispatch, then stamp `lastScheduleAt`. A throw before admission leaves
 * the stamp unset so an alarm retry can fire. A later same-hour retry skips.
 * The stamp is not a Note and must not publish a Card.
 */
export async function runHeartbeat(
	host: HeartbeatHost,
	dispatchReview: (request: ReviewDispatchRequest) => Promise<void>,
	now: number,
): Promise<'dispatched' | 'skipped'> {
	const request = reviewDispatchRequest(host.name);
	if (!shouldDispatchReview(host.state.lastScheduleAt, now)) {
		return 'skipped';
	}
	await dispatchReview(request);
	host.setState({ ...host.state, lastScheduleAt: now });
	return 'dispatched';
}
