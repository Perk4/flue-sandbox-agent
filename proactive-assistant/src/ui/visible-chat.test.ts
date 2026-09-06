import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { FlueConversationMessage } from '@flue/sdk';
import { textOf, visibleChatRows } from './visible-chat.ts';

function message(
	partial: Pick<FlueConversationMessage, 'id' | 'role' | 'display'> & {
		parts?: FlueConversationMessage['parts'];
		purpose?: FlueConversationMessage['purpose'];
	},
): FlueConversationMessage {
	const purpose =
		partial.purpose ??
		(partial.role === 'system' ? 'advisory' : partial.role);
	return {
		id: partial.id,
		role: partial.role,
		purpose,
		display: partial.display,
		parts: partial.parts ?? [],
	};
}

test('visible User and assistant text render', () => {
	const rows = visibleChatRows([
		message({
			id: 'u1',
			role: 'user',
			display: 'visible',
			parts: [{ type: 'text', text: 'Hello', state: 'done' }],
		}),
		message({
			id: 'a1',
			role: 'assistant',
			display: 'visible',
			parts: [{ type: 'text', text: 'Hi there', state: 'done' }],
		}),
	]);
	assert.deepEqual(
		rows.map((row) => [row.role, textOf(row)]),
		[
			['user', 'Hello'],
			['assistant', 'Hi there'],
		],
	);
});

test('display !== visible rows do not render', () => {
	const rows = visibleChatRows([
		message({
			id: 'u1',
			role: 'user',
			display: 'visible',
			parts: [{ type: 'text', text: 'Keep me', state: 'done' }],
		}),
		message({
			id: 'diag',
			role: 'assistant',
			display: 'diagnostic',
			parts: [{ type: 'text', text: 'tool noise', state: 'done' }],
		}),
		message({
			id: 'hidden',
			role: 'system',
			display: 'hidden',
			purpose: 'advisory',
			parts: [{ type: 'text', text: 'plumbing', state: 'done' }],
		}),
	]);
	assert.equal(rows.length, 1);
	assert.equal(rows[0]?.id, 'u1');
});

test('empty assistant rows do not appear as chat', () => {
	const rows = visibleChatRows([
		message({
			id: 'u1',
			role: 'user',
			display: 'visible',
			parts: [{ type: 'text', text: 'Ping', state: 'done' }],
		}),
		message({
			id: 'empty',
			role: 'assistant',
			display: 'visible',
			parts: [{ type: 'text', text: '   ', state: 'done' }],
		}),
		message({
			id: 'no-text',
			role: 'assistant',
			display: 'visible',
			parts: [{ type: 'data-note', data: {} }],
		}),
		message({
			id: 'ok',
			role: 'assistant',
			display: 'visible',
			parts: [{ type: 'text', text: 'Pong', state: 'done' }],
		}),
	]);
	assert.deepEqual(
		rows.map((row) => row.id),
		['u1', 'ok'],
	);
});

test('a diagnostic row in history is not visible chat', () => {
	const rows = visibleChatRows([
		message({
			id: 'diag',
			role: 'assistant',
			display: 'diagnostic',
			parts: [{ type: 'text', text: 'Nothing to update.', state: 'done' }],
		}),
	]);
	assert.equal(rows.length, 0);
});

test('visible Nothing to update. is a fail for a no-op Review', () => {
	const rows = visibleChatRows([
		message({
			id: 'noop',
			role: 'assistant',
			display: 'visible',
			parts: [{ type: 'text', text: 'Nothing to update.', state: 'done' }],
		}),
	]);
	assert.equal(rows.length, 1);
	assert.equal(textOf(rows[0]!), 'Nothing to update.');
});
