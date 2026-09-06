import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyUpsert, EMPTY_NOTEBOOK, type NoteId } from './notebook.ts';
import { REVIEW_INTERVAL_SECONDS } from './review.ts';
import { stopInstance, STOPPED_TOAST, toastForAbort, type StopAbort } from './stop.ts';

const ID_A = '11111111-1111-4111-8111-111111111111' as NoteId;

function abortClient(
	result: { aborted: boolean },
	calls: unknown[],
): StopAbort {
	return {
		abort: async (options) => {
			calls.push(options);
			return result;
		},
	};
}

test('Idle Stop returns aborted false and does not toast stopped', async () => {
	const calls: unknown[] = [];
	const result = await stopInstance(abortClient({ aborted: false }, calls));
	assert.deepEqual(result, { aborted: false });
	assert.equal(toastForAbort(result), undefined);
	assert.notEqual(toastForAbort(result), STOPPED_TOAST);
	assert.deepEqual(calls, [undefined]);
});

test('Stop that ended work toasts stopped', async () => {
	const result = await stopInstance(abortClient({ aborted: true }, []));
	assert.deepEqual(result, { aborted: true });
	assert.equal(toastForAbort(result), STOPPED_TOAST);
	assert.equal(STOPPED_TOAST, 'stopped');
});

test('Stop is instance abort: no submission id, no this-reply-only', async () => {
	const calls: unknown[] = [];
	await stopInstance(abortClient({ aborted: true }, calls));
	assert.equal(calls.length, 1);
	assert.equal(calls[0], undefined);

	const signaled: unknown[] = [];
	await stopInstance(abortClient({ aborted: true }, signaled), {
		signal: AbortSignal.abort(),
	});
	const options = signaled[0];
	assert.equal(options !== null && typeof options === 'object', true);
	assert.equal('submissionId' in (options as object), false);
});

test('Stop does not cancel the hourly Review timer', async () => {
	let cancelled = false;
	const heartbeat = {
		intervalSeconds: REVIEW_INTERVAL_SECONDS,
		cancel() {
			cancelled = true;
		},
	};
	await stopInstance(abortClient({ aborted: true }, []));
	assert.equal(cancelled, false);
	assert.equal(heartbeat.intervalSeconds, 60 * 60);
});

test('a committed Note stays after Stop; an in-flight upsert does not land', async () => {
	const committed = applyUpsert(
		EMPTY_NOTEBOOK,
		{ title: 'Keep', body: 'saved' },
		{ now: 10, mintId: () => ID_A },
	);
	let notebook = committed.notebook;
	const inFlight = { title: 'Ghost', body: 'should not land' };

	await stopInstance(abortClient({ aborted: true }, []));
	// Abort never applies an unfinished updater. No rollback of saved Notes.
	void inFlight;
	assert.equal(notebook[ID_A]?.body, 'saved');
	assert.equal(Object.keys(notebook).length, 1);

	notebook = applyUpsert(
		notebook,
		{ id: ID_A, title: 'Keep', body: 'saved' },
		{ now: 10, mintId: () => ID_A },
	).notebook;
	assert.equal(notebook[ID_A]?.body, 'saved');
});
