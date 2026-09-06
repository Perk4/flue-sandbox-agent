import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
	assistantIngress,
	credentialFromSignedValue,
	decideAdmission,
	stampOrigin,
} from './admission.ts';
import { instanceIdFor, ownsAddress, parseUserId } from './identity.ts';

test('instanceIdFor derives the address from the User', () => {
	assert.equal(instanceIdFor('alice'), 'user-alice');
	assert.equal(ownsAddress('alice', 'user-alice'), true);
	assert.equal(ownsAddress('alice', 'user-bob'), false);
	assert.equal(ownsAddress('alice', 'alice'), false);
});

test('parseUserId rejects empty and path-like ids', () => {
	assert.throws(() => parseUserId(''));
	assert.throws(() => parseUserId('alice/bob'));
	assert.throws(() => parseUserId(' alice'));
	assert.equal(parseUserId('alice'), 'alice');
});

test('missing or forged cookie is unauthenticated', () => {
	assert.deepEqual(credentialFromSignedValue(undefined), {
		tag: 'unauthenticated',
		reason: 'missing',
	});
	assert.deepEqual(credentialFromSignedValue(false), {
		tag: 'unauthenticated',
		reason: 'forged',
	});
	assert.deepEqual(credentialFromSignedValue('not a user'), {
		tag: 'unauthenticated',
		reason: 'forged',
	});
	assert.deepEqual(credentialFromSignedValue('alice'), {
		tag: 'authenticated',
		userId: 'alice',
	});
});

test('decideAdmission orders 401 then 403 then 400', () => {
	const alice = { tag: 'authenticated' as const, userId: 'alice' };
	const sendAlice = { address: 'user-alice', isChatPost: true, postKind: 'user' };
	const sendSignal = { address: 'user-alice', isChatPost: true, postKind: 'signal' };
	const sendBob = { address: 'user-bob', isChatPost: true, postKind: 'signal' };
	const history = { address: 'user-alice', isChatPost: false };

	assert.deepEqual(
		decideAdmission(sendAlice, { tag: 'unauthenticated', reason: 'missing' }),
		{ tag: 'deny', status: 401 },
	);
	assert.deepEqual(
		decideAdmission(sendSignal, { tag: 'unauthenticated', reason: 'forged' }),
		{ tag: 'deny', status: 401 },
	);
	assert.deepEqual(decideAdmission(sendBob, alice), { tag: 'deny', status: 403 });
	assert.deepEqual(decideAdmission(sendSignal, alice), { tag: 'deny', status: 400 });
	assert.deepEqual(decideAdmission(sendAlice, alice), {
		tag: 'allow',
		stampOrigin: true,
	});
	assert.deepEqual(decideAdmission(history, alice), {
		tag: 'allow',
		stampOrigin: false,
	});
});

test('assistantIngress treats only POST /:id as a chat post', () => {
	assert.deepEqual(assistantIngress('/agents/assistant/user-alice', 'POST', 'user'), {
		address: 'user-alice',
		isChatPost: true,
		postKind: 'user',
	});
	assert.deepEqual(assistantIngress('/agents/assistant/user-alice/abort', 'POST'), {
		address: 'user-alice',
		isChatPost: false,
		postKind: undefined,
	});
	assert.deepEqual(
		assistantIngress('/agents/assistant/user-alice/attachments/att_1', 'GET'),
		{
			address: 'user-alice',
			isChatPost: false,
			postKind: undefined,
		},
	);
	assert.equal(assistantIngress('/agents/assistant/', 'GET'), null);
});

test('stampOrigin overwrites a spoofed sibling and keeps other fields', () => {
	const stamped = stampOrigin(
		{
			kind: 'user',
			body: 'Hello',
			initialData: { userId: 'attacker', extra: 1 },
		},
		'alice',
	);
	assert.deepEqual(stamped.initialData, { userId: 'alice', extra: 1 });
	assert.deepEqual(stampOrigin({ kind: 'user', body: 'Hello' }, 'alice').initialData, {
		userId: 'alice',
	});
});
