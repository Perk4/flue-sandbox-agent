import { createFlueClient, FlueExecutionError } from '@flue/sdk';
import { instanceIdFor } from '../src/identity.ts';

const baseUrl = process.env.ADMISSION_BASE_URL ?? 'http://localhost:5173';
const alice = process.env.ADMISSION_USER ?? 'alice';
const bob = process.env.ADMISSION_OTHER_USER ?? 'bob';

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireNonEmptyString(value: unknown, field: string): string {
	if (typeof value !== 'string' || value.length === 0) {
		throw new Error(`${field} must be a non-empty string`);
	}
	return value;
}

async function signIn(userId: string): Promise<{ cookie: string; setCookie: string }> {
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
	if (!/HttpOnly/i.test(setCookie)) {
		throw new Error('cookie must be HttpOnly');
	}
	if (!/SameSite=Strict/i.test(setCookie)) {
		throw new Error('cookie must be SameSite=Strict');
	}
	if (!/Path=\//i.test(setCookie)) {
		throw new Error('cookie must be Path=/');
	}
	if (/Authorization/i.test(setCookie)) {
		throw new Error('cookie must not be a Bearer token');
	}
	const cookie = setCookie.split(';', 1)[0];
	if (!cookie) {
		throw new Error('Set-Cookie had no name=value');
	}
	const body = await response.json();
	if (!isRecord(body) || body.address !== instanceIdFor(userId)) {
		throw new Error('sign-in must return instanceIdFor(userId)');
	}
	return { cookie, setCookie };
}

async function expectStatus(
	url: string,
	init: RequestInit,
	status: number,
	label: string,
): Promise<Response> {
	const response = await fetch(url, init);
	if (response.status !== status) {
		const text = await response.text();
		throw new Error(`${label} expected ${status}, got ${response.status}: ${text}`);
	}
	return response;
}

const home = await fetch(baseUrl);
const homeType = home.headers.get('content-type') ?? '';
if (home.status !== 200 || !homeType.includes('text/html')) {
	throw new Error(`GET / expected the Assistant page HTML, got ${String(home.status)} ${homeType}`);
}
const homeHtml = await home.text();
if (!/Assistant|root/.test(homeHtml)) {
	throw new Error('GET / must serve the same-origin Assistant page');
}

const aliceSession = await signIn(alice);
const bobSession = await signIn(bob);
const aliceUrl = `${baseUrl}/agents/assistant/${instanceIdFor(alice)}`;
const attachmentUrl = `${aliceUrl}/attachments/missing`;
const abortUrl = `${aliceUrl}/abort`;
const historyUrl = aliceUrl;
const streamUrl = `${aliceUrl}?view=updates&offset=-1`;

const swallowed = await expectStatus(aliceUrl, {
	method: 'POST',
	headers: {
		'content-type': 'application/json',
		accept: 'text/html',
		'sec-fetch-mode': 'navigate',
	},
	body: JSON.stringify({ kind: 'user', body: 'Hello' }),
}, 401, 'send without cookie');
const swallowedType = swallowed.headers.get('content-type') ?? '';
if (!swallowedType.includes('application/json')) {
	throw new Error(`SPA fallback must not swallow admission: got ${swallowedType}`);
}
const navigateGet = await expectStatus(
	aliceUrl,
	{ headers: { accept: 'text/html', 'sec-fetch-mode': 'navigate' } },
	401,
	'history without cookie as navigate',
);
const navigateType = navigateGet.headers.get('content-type') ?? '';
if (!navigateType.includes('application/json')) {
	throw new Error(`GET /agents/* as navigate must reach the Worker, not SPA HTML: ${navigateType}`);
}

await expectStatus(historyUrl, { method: 'GET' }, 401, 'history without cookie');
await expectStatus(streamUrl, { method: 'GET' }, 401, 'stream without cookie');
await expectStatus(abortUrl, { method: 'POST' }, 401, 'Stop without cookie');
await expectStatus(attachmentUrl, { method: 'GET' }, 401, 'attachment without cookie');

await expectStatus(aliceUrl, {
	method: 'POST',
	headers: { 'content-type': 'application/json', cookie: 'session=alice' },
	body: JSON.stringify({ kind: 'user', body: 'Hello' }),
}, 401, 'send with forged cookie');

const bobHeaders = { cookie: bobSession.cookie };
await expectStatus(aliceUrl, {
	method: 'POST',
	headers: { 'content-type': 'application/json', ...bobHeaders },
	body: JSON.stringify({ kind: 'user', body: 'Hello' }),
}, 403, 'send with second identity');
await expectStatus(historyUrl, { headers: bobHeaders }, 403, 'history with second identity');
await expectStatus(streamUrl, { headers: bobHeaders }, 403, 'stream with second identity');
await expectStatus(abortUrl, { method: 'POST', headers: bobHeaders }, 403, 'Stop with second identity');
await expectStatus(attachmentUrl, { headers: bobHeaders }, 403, 'attachment with second identity');

await expectStatus(aliceUrl, {
	method: 'POST',
	headers: { 'content-type': 'application/json', cookie: aliceSession.cookie },
	body: JSON.stringify({ kind: 'signal', type: 'schedule', body: 'Review' }),
}, 400, 'signal POST with owner cookie');

await expectStatus(aliceUrl, {
	method: 'POST',
	headers: { 'content-type': 'application/json' },
	body: JSON.stringify({ kind: 'signal', type: 'schedule', body: 'Review' }),
}, 401, 'signal POST without cookie');

const admissionResponse = await expectStatus(aliceUrl, {
	method: 'POST',
	headers: { 'content-type': 'application/json', cookie: aliceSession.cookie },
	body: JSON.stringify({
		kind: 'user',
		body: 'Reply with one short word.',
		initialData: { userId: 'attacker' },
	}),
}, 202, 'creating send with spoofed Origin');

const admissionBody = await admissionResponse.json();
if (!isRecord(admissionBody)) {
	throw new Error('admission body must be a JSON object');
}
requireNonEmptyString(admissionBody.streamUrl, 'streamUrl');
requireNonEmptyString(admissionBody.offset, 'offset');
requireNonEmptyString(admissionBody.submissionId, 'submissionId');

const client = createFlueClient({
	url: aliceUrl,
	headers: { cookie: aliceSession.cookie },
});
const admission = await client.send({
	message: { kind: 'user', body: 'Say only: ok' },
});
const reconnect = createFlueClient({
	url: aliceUrl,
	headers: { cookie: aliceSession.cookie },
});
await reconnect.wait(admission);
const { messages } = await reconnect.history();
const assistantText = messages
	.filter((message) => message.role === 'assistant')
	.flatMap((message) => message.parts)
	.filter((part) => part.type === 'text')
	.map((part) => part.text)
	.join('');
if (assistantText.length === 0) {
	throw new Error('reconnect history has no assistant text');
}

const idleStop = await client.abort();
if (idleStop.aborted !== false) {
	throw new Error(`idle Stop expected { aborted: false }, got ${JSON.stringify(idleStop)}`);
}

const inFlight = await client.send({
	message: { kind: 'user', body: 'Count slowly from one to two hundred in words.' },
});
const duringTurn = await client.abort();
if (typeof duringTurn.aborted !== 'boolean') {
	throw new Error('Stop during a User turn must return { aborted: boolean }');
}
	if (duringTurn.aborted) {
	try {
		await client.wait(inFlight);
		throw new Error('aborted User turn must not settle completed');
	} catch (cause) {
		if (cause instanceof Error && cause.message === 'aborted User turn must not settle completed') {
			throw cause;
		}
		if (!(cause instanceof FlueExecutionError) || cause.failure !== 'aborted') {
			throw new Error(
				`Stop during a User turn expected aborted settlement, got ${String(cause)}`,
			);
		}
	}
}

const afterStop = await reconnect.history();
const keptText = afterStop.messages
	.filter((message) => message.role === 'assistant')
	.flatMap((message) => message.parts)
	.filter((part) => part.type === 'text')
	.map((part) => part.text)
	.join('');
if (keptText.length === 0) {
	throw new Error('Stop must leave the earlier completed reply in history');
}

console.log(`cookie=${aliceSession.cookie.split('=', 1)[0]}`);
console.log(`address=${instanceIdFor(alice)}`);
console.log(`streamUrl=${admissionBody.streamUrl}`);
console.log(`submissionId=${admission.submissionId}`);
console.log(`idleAborted=${String(idleStop.aborted)}`);
console.log(`duringTurnAborted=${String(duringTurn.aborted)}`);
