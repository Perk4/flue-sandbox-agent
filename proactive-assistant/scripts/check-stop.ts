import { createFlueClient, FlueExecutionError } from '@flue/sdk';
import { instanceIdFor } from '../src/identity.ts';
import { latestCatalogNotebook, notesInCatalog } from '../src/ui/latest-catalog.ts';

const baseUrl = process.env.ADMISSION_BASE_URL ?? 'http://localhost:5173';
const user = process.env.STOP_CHECK_USER ?? `stop${String(Date.now())}`;
const SLOW_TURN =
	'Count slowly from one to two hundred in words. Do not skip. Do not use tools. Do not write notes.';

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireNonEmptyString(value: unknown, field: string): string {
	if (typeof value !== 'string' || value.length === 0) {
		throw new Error(`${field} must be a non-empty string`);
	}
	return value;
}

async function signIn(userId: string): Promise<string> {
	const response = await fetch(`${baseUrl}/session`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ userId }),
	});
	if (response.status !== 200) {
		throw new Error(`sign-in ${userId} expected 200, got ${response.status}`);
	}
	const setCookie = response.headers.getSetCookie()[0];
	if (!setCookie) {
		throw new Error('sign-in must Set-Cookie');
	}
	const cookie = setCookie.split(';', 1)[0];
	if (!cookie) {
		throw new Error('Set-Cookie had no name=value');
	}
	return cookie;
}

function noteTitles(
	messages: Awaited<ReturnType<ReturnType<typeof createFlueClient>['history']>>['messages'],
): string[] {
	return notesInCatalog(latestCatalogNotebook(messages)).map((entry) => entry.title);
}

async function expectAborted(
	client: ReturnType<typeof createFlueClient>,
	target: { submissionId: string },
	label: string,
): Promise<void> {
	try {
		await client.read(target.submissionId, { signal: AbortSignal.timeout(120_000) });
		throw new Error(`${label} must not settle completed`);
	} catch (cause) {
		if (cause instanceof Error && cause.message === `${label} must not settle completed`) {
			throw cause;
		}
		if (!(cause instanceof FlueExecutionError) || cause.failure !== 'aborted') {
			throw new Error(`${label} expected aborted settlement, got ${String(cause)}`);
		}
	}
}

async function dispatchReview(cookie: string): Promise<{ submissionId: string }> {
	const response = await fetch(`${baseUrl}/check/review`, {
		method: 'POST',
		headers: { cookie },
	});
	if (response.status === 404) {
		throw new Error(
			'AC3/AC4 need LIVE_STOP_CHECK=1 in .dev.vars so /check/review can dispatch a Review',
		);
	}
	if (response.status === 401) {
		throw new Error('/check/review expected owner cookie, got 401');
	}
	if (response.status !== 202) {
		throw new Error(`/check/review expected 202, got ${response.status}: ${await response.text()}`);
	}
	const body: unknown = await response.json();
	if (!isRecord(body)) {
		throw new Error('/check/review body must be a JSON object');
	}
	return { submissionId: requireNonEmptyString(body.submissionId, 'review submissionId') };
}

function settlementOf(
	settlements: Awaited<ReturnType<ReturnType<typeof createFlueClient>['history']>>['settlements'],
	submissionId: string,
): string | undefined {
	return settlements.find((entry) => entry.submissionId === submissionId)?.outcome;
}

const cookie = await signIn(user);
const url = `${baseUrl}/agents/assistant/${instanceIdFor(user)}`;
const client = createFlueClient({ url, headers: { cookie } });

const unsignedReview = await fetch(`${baseUrl}/check/review`, { method: 'POST' });
if (unsignedReview.status === 404) {
	throw new Error(
		'AC3/AC4 need LIVE_STOP_CHECK=1 in .dev.vars so /check/review can dispatch a Review',
	);
}
if (unsignedReview.status !== 401) {
	throw new Error(`/check/review without cookie expected 401, got ${unsignedReview.status}`);
}

const signalPost = await fetch(url, {
	method: 'POST',
	headers: { 'content-type': 'application/json', cookie },
	body: JSON.stringify({ kind: 'signal', type: 'schedule', body: 'Review' }),
});
if (signalPost.status !== 400) {
	throw new Error(`chat signal POST must stay 400, got ${signalPost.status}`);
}

const creating = await client.send({
	message: { kind: 'user', body: 'Say only: hello' },
});
await client.wait(creating, { signal: AbortSignal.timeout(120_000) });

const idleStop = await client.abort();
if (idleStop.aborted !== false) {
	throw new Error(`idle Stop expected { aborted: false }, got ${JSON.stringify(idleStop)}`);
}

const keep = await client.send({
	message: {
		kind: 'user',
		body: 'Create exactly one Note titled KeepStop with body saved-keep using upsertNote. Then say only: kept.',
	},
});
await client.wait(keep, { signal: AbortSignal.timeout(180_000) });
const afterKeep = await client.history();
if (!noteTitles(afterKeep.messages).includes('KeepStop')) {
	throw new Error(
		`AC5 committed Note missing KeepStop after upsert turn; titles=${JSON.stringify(noteTitles(afterKeep.messages))}`,
	);
}

const userTurn = await client.send({
	message: { kind: 'user', body: SLOW_TURN },
});
const ac2 = await client.abort();
if (ac2.aborted !== true) {
	throw new Error(`AC2 expected { aborted: true }, got ${JSON.stringify(ac2)}`);
}
await expectAborted(client, userTurn, 'AC2 User turn');
console.log(`ac2=aborted submissionId=${userTurn.submissionId}`);

const ghost = await client.send({
	message: {
		kind: 'user',
		body: 'Create a Note titled GhostStop with body should-not-land using upsertNote. First count slowly from one to two hundred in words.',
	},
});
const ac5 = await client.abort();
if (ac5.aborted !== true) {
	throw new Error(`AC5 in-flight expected { aborted: true }, got ${JSON.stringify(ac5)}`);
}
await expectAborted(client, ghost, 'AC5 in-flight upsert turn');
const afterGhost = await client.history();
const titlesAfterGhost = noteTitles(afterGhost.messages);
if (!titlesAfterGhost.includes('KeepStop')) {
	throw new Error(`AC5 committed KeepStop missing after Stop; titles=${JSON.stringify(titlesAfterGhost)}`);
}
if (titlesAfterGhost.includes('GhostStop')) {
	throw new Error('AC5 in-flight GhostStop landed after Stop');
}
console.log(`ac5=keep-stayed ghost-absent titles=${titlesAfterGhost.join(',')}`);

const review = await dispatchReview(cookie);
const joined = await client.send({
	message: { kind: 'user', body: 'Say only: joined. Do not write notes.' },
});
const ac3 = await client.abort();
if (ac3.aborted !== true) {
	throw new Error(`AC3 expected { aborted: true } for Review+joined send, got ${JSON.stringify(ac3)}`);
}
await expectAborted(client, review, 'AC3 Review');
await expectAborted(client, joined, 'AC3 joined send');
const afterJoin = await client.history();
if (settlementOf(afterJoin.settlements, review.submissionId) !== 'aborted') {
	throw new Error('AC3 Review settlement must be aborted');
}
if (settlementOf(afterJoin.settlements, joined.submissionId) !== 'aborted') {
	throw new Error('AC3 joined send settlement must be aborted');
}
console.log(
	`ac3=review-aborted joined-aborted review=${review.submissionId} joined=${joined.submissionId}`,
);

const occupying = await client.send({
	message: { kind: 'user', body: SLOW_TURN },
});
const queuedReview = await dispatchReview(cookie);
const ac4 = await client.abort();
if (ac4.aborted !== true) {
	throw new Error(`AC4 expected { aborted: true } with queued Review, got ${JSON.stringify(ac4)}`);
}
await expectAborted(client, occupying, 'AC4 occupying User turn');
await expectAborted(client, queuedReview, 'AC4 queued Review');
const afterQueued = await client.history();
if (settlementOf(afterQueued.settlements, queuedReview.submissionId) !== 'aborted') {
	throw new Error('AC4 queued Review settlement must be aborted');
}
const titlesAfterQueue = noteTitles(afterQueued.messages);
if (titlesAfterQueue.includes('GhostStop')) {
	throw new Error('AC4 queued Review must not land GhostStop');
}
if (!titlesAfterQueue.includes('KeepStop')) {
	throw new Error('AC4 must not roll back KeepStop');
}
console.log(`ac4=queued-review-aborted review=${queuedReview.submissionId}`);

const idleAfter = await client.abort();
if (idleAfter.aborted !== false) {
	throw new Error(`idle Stop after AC2–5 expected { aborted: false }, got ${JSON.stringify(idleAfter)}`);
}

console.log(`user=${user}`);
console.log(`address=${instanceIdFor(user)}`);
console.log('ac2-5=pass');
