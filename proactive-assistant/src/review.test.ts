import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyUpsert, EMPTY_NOTEBOOK, type NoteId } from './notebook.ts';
import {
	REVIEW_INTERVAL_SECONDS,
	REVIEW_JOIN_INSTRUCTION,
	REVIEW_LOOK_INSTRUCTION,
	REVIEW_SIGNAL_BODY,
	instanceAddressForDispatch,
	instanceNameOf,
	isScheduleReview,
	reviewDispatchRequest,
	reviewInstructions,
	runHeartbeat,
	shouldDispatchReview,
	type HeartbeatHost,
	type ReviewDispatchRequest,
} from './review.ts';

const ID_A = '11111111-1111-4111-8111-111111111111' as NoteId;

function host(name: string, lastScheduleAt?: number): HeartbeatHost & { stamps: number[] } {
	const agent: HeartbeatHost & { stamps: number[] } = {
		name,
		state: lastScheduleAt === undefined ? {} : { lastScheduleAt },
		stamps: [],
		setState(state) {
			agent.state = state;
			if (typeof state.lastScheduleAt === 'number') {
				agent.stamps.push(state.lastScheduleAt);
			}
		},
	};
	return agent;
}

test('Review signal body and join Instruction are the product strings', () => {
	assert.equal(
		REVIEW_SIGNAL_BODY,
		'Review recent notes. Prefer a new Note over updating an existing NoteId. Write a note if something is useful. Stay quiet otherwise.',
	);
	assert.equal(
		REVIEW_JOIN_INSTRUCTION,
		'If a User message joins this Review, do not continue that look. Write no more Notes from the Review. Answer the User.',
	);
	assert.equal(REVIEW_INTERVAL_SECONDS, 60 * 60);
	assert.match(REVIEW_LOOK_INSTRUCTION, /Prefer a new Note over updating an existing NoteId/);
	assert.match(REVIEW_LOOK_INSTRUCTION, /Do not say "Nothing to update\."/);
});

test('prefer a new Note is instruction, not a store rule', () => {
	const created = applyUpsert(
		EMPTY_NOTEBOOK,
		{ title: 'Todo', body: 'old' },
		{ now: 1, mintId: () => ID_A },
	);
	const updated = applyUpsert(
		created.notebook,
		{ id: ID_A, title: 'Todo', body: 'new' },
		{ now: 2, mintId: () => ID_A },
	);
	assert.equal(updated.notebook[ID_A]?.body, 'new');
	assert.match(REVIEW_LOOK_INSTRUCTION, /updating a known NoteId is allowed/);
	assert.match(reviewInstructions({ kind: 'signal', type: 'schedule' }), /Prefer a new Note/);
});

test('heartbeat dispatches this instance address, never a raw User id', async () => {
	const calls: ReviewDispatchRequest[] = [];
	const agent = host('user-alice');
	const result = await runHeartbeat(agent, async (request) => {
		calls.push(request);
	}, 1_000);

	assert.equal(result, 'dispatched');
	assert.equal(calls.length, 1);
	assert.equal(calls[0]?.id, 'user-alice');
	assert.notEqual(calls[0]?.id, 'alice');
	assert.deepEqual(calls[0]?.message, {
		kind: 'signal',
		type: 'schedule',
		body: REVIEW_SIGNAL_BODY,
	});
	assert.equal('scheduledAt' in (calls[0]?.message ?? {}), false);
	assert.equal(instanceNameOf({ name: 'user-alice' }), 'user-alice');
	assert.throws(() => instanceAddressForDispatch('alice'), /instance address/);
	assert.throws(() => instanceNameOf({ name: 'alice' }), /raw User id/);
	assert.throws(() => reviewDispatchRequest('alice'), /instance address/);
});

test('lastScheduleAt is a silent fire stamp and does not publish a Card', async () => {
	const cards: unknown[] = [];
	const agent = host('user-bob');
	const now = 50_000;
	const result = await runHeartbeat(agent, async () => {}, now);

	assert.equal(result, 'dispatched');
	assert.equal(agent.state.lastScheduleAt, now);
	assert.deepEqual(agent.stamps, [now]);
	assert.equal(cards.length, 0);
	assert.equal('notebook' in agent.state, false);
});

test('a dispatch that throws does not stamp lastScheduleAt', async () => {
	const agent = host('user-alice');
	await assert.rejects(
		() =>
			runHeartbeat(agent, async () => {
				throw new Error('admission failed');
			}, 1_000),
		/admission failed/,
	);
	assert.equal(agent.state.lastScheduleAt, undefined);
	assert.deepEqual(agent.stamps, []);
	const retry = await runHeartbeat(agent, async () => {}, 1_001);
	assert.equal(retry, 'dispatched');
	assert.equal(agent.state.lastScheduleAt, 1_001);
});

test('a second heartbeat in the same hour is skipped', async () => {
	const calls: ReviewDispatchRequest[] = [];
	const now = REVIEW_INTERVAL_SECONDS * 1000;
	const agent = host('user-alice', now);
	const result = await runHeartbeat(agent, async (request) => {
		calls.push(request);
	}, now + 1);

	assert.equal(result, 'skipped');
	assert.equal(calls.length, 0);
	assert.equal(agent.state.lastScheduleAt, now);
	assert.equal(shouldDispatchReview(now, now + REVIEW_INTERVAL_SECONDS * 1000 - 1), false);
	assert.equal(shouldDispatchReview(now, now + REVIEW_INTERVAL_SECONDS * 1000), true);
});

test('a later hour dispatches again', async () => {
	const calls: ReviewDispatchRequest[] = [];
	const first = 10;
	const later = first + REVIEW_INTERVAL_SECONDS * 1000;
	const agent = host('user-alice', first);
	const result = await runHeartbeat(agent, async (request) => {
		calls.push(request);
	}, later);

	assert.equal(result, 'dispatched');
	assert.equal(calls.length, 1);
	assert.equal(agent.state.lastScheduleAt, later);
});

test('a User delivery is not a Review; a schedule signal is', () => {
	assert.equal(isScheduleReview({ kind: 'user' }), false);
	assert.equal(isScheduleReview({ kind: 'signal', type: 'schedule' }), true);
	assert.equal(isScheduleReview({ kind: 'signal', type: 'other' }), false);

	const userText = reviewInstructions({ kind: 'user' });
	assert.match(userText, /Answer the User/);
	assert.doesNotMatch(userText, /This delivery is a Review/);
	assert.match(reviewInstructions({ kind: 'signal', type: 'schedule' }), /This delivery is a Review/);
});

test('upsertNote stays in the Review instruction set when a User joins', () => {
	const duringReview = reviewInstructions({ kind: 'signal', type: 'schedule' });
	const afterJoin = reviewInstructions({ kind: 'user' });
	assert.match(duringReview, /upsertNote/);
	assert.match(afterJoin, /Answer the User/);
	assert.doesNotMatch(afterJoin, /unmount/);
});
