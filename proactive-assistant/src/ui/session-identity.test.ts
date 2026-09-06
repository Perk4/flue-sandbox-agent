import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isAuthFailure } from './session-identity.ts';

test('401 and 403 are authentication failures', () => {
	assert.equal(isAuthFailure({ status: 401 }), true);
	assert.equal(isAuthFailure({ status: 403 }), true);
	assert.equal(isAuthFailure(new Error('Flue API error 401: request failed')), true);
	assert.equal(isAuthFailure(new Error('Flue API error 403: request failed')), true);
});

test('other errors are not authentication failures', () => {
	assert.equal(isAuthFailure(undefined), false);
	assert.equal(isAuthFailure({ status: 500 }), false);
	assert.equal(isAuthFailure(new Error('stream dropped')), false);
	assert.equal(isAuthFailure(new Error('400 bad request')), false);
});
