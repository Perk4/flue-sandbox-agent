import { createAgentRouter } from '@flue/runtime/routing';
import { Hono } from 'hono';
import type { Context, Next } from 'hono';
import { getSignedCookie, setSignedCookie } from 'hono/cookie';
import {
	assistantIngress,
	credentialFromSignedValue,
	decideAdmission,
	stampOrigin,
} from './admission.ts';
import { Assistant } from './agents/assistant.ts';
import { instanceIdFor, parseUserId } from './identity.ts';
import { SESSION_COOKIE, sessionCookieOptions } from './session.ts';

type Env = { Bindings: { SESSION_SECRET: string } };

const assistantRouter = new Hono().route('/agents/assistant', createAgentRouter(Assistant));

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function secretFrom(c: Context<Env>): string | undefined {
	const secret = c.env.SESSION_SECRET;
	return typeof secret === 'string' && secret.length > 0 ? secret : undefined;
}

function denyMessage(
	status: 401 | 403 | 400,
	credential: ReturnType<typeof credentialFromSignedValue>,
): string {
	if (status === 401 && credential.tag === 'unauthenticated') {
		return credential.reason;
	}
	if (status === 403) {
		return 'forbidden';
	}
	return 'rejected';
}

async function gate(c: Context<Env>, next: Next) {
	const secret = secretFrom(c);
	if (secret === undefined) {
		return c.json({ error: 'missing SESSION_SECRET' }, 500);
	}

	const credential = credentialFromSignedValue(
		await getSignedCookie(c, secret, SESSION_COOKIE),
	);
	const baseIngress = assistantIngress(c.req.path, c.req.method);
	if (baseIngress === null) {
		return next();
	}

	const authVerdict = decideAdmission(baseIngress, credential);
	if (authVerdict.tag === 'deny') {
		return c.json({ error: denyMessage(authVerdict.status, credential) }, authVerdict.status);
	}

	let postKind: string | undefined;
	let body: Record<string, unknown> | undefined;
	if (baseIngress.isChatPost) {
		try {
			const parsed: unknown = await c.req.json();
			if (!isRecord(parsed)) {
				return c.json({ error: 'invalid json' }, 400);
			}
			body = parsed;
			if (typeof parsed.kind === 'string') {
				postKind = parsed.kind;
			}
		} catch {
			return c.json({ error: 'invalid json' }, 400);
		}
	}

	const ingress = assistantIngress(c.req.path, c.req.method, postKind) ?? baseIngress;
	const verdict = decideAdmission(ingress, credential);
	if (verdict.tag === 'deny') {
		return c.json({ error: denyMessage(verdict.status, credential) }, verdict.status);
	}

	if (verdict.stampOrigin) {
		if (credential.tag !== 'authenticated' || body === undefined) {
			return c.json({ error: 'invalid json' }, 400);
		}
		const rewritten = new Request(c.req.url, {
			method: 'POST',
			headers: c.req.raw.headers,
			body: JSON.stringify(stampOrigin(body, credential.userId)),
		});
		return assistantRouter.fetch(rewritten, c.env, c.executionCtx);
	}

	return next();
}

const app = new Hono<Env>();

app.post('/session', async (c) => {
	const secret = secretFrom(c);
	if (secret === undefined) {
		return c.json({ error: 'missing SESSION_SECRET' }, 500);
	}

	let raw: unknown;
	try {
		raw = await c.req.json();
	} catch {
		return c.json({ error: 'invalid json' }, 400);
	}

	const userIdRaw = isRecord(raw) ? raw.userId : undefined;
	if (typeof userIdRaw !== 'string') {
		return c.json({ error: 'invalid user id' }, 400);
	}

	let userId: ReturnType<typeof parseUserId>;
	try {
		userId = parseUserId(userIdRaw);
	} catch {
		return c.json({ error: 'invalid user id' }, 400);
	}

	await setSignedCookie(
		c,
		SESSION_COOKIE,
		userId,
		secret,
		sessionCookieOptions(c.req.url.startsWith('https:')),
	);
	return c.json({ address: instanceIdFor(userId) }, 200);
});

app.use('/agents/assistant/*', gate);
app.route('/', assistantRouter);

export default app;
