import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { FlueConversationMessage } from '@flue/sdk';
import { executionBarrierOf, isExecutionChunk } from './execution-barrier.ts';

function assistant(
	submissionId: string,
	parts: FlueConversationMessage['parts'],
): FlueConversationMessage {
	return {
		id: 'm1',
		role: 'assistant',
		purpose: 'assistant',
		display: 'visible',
		submissionId,
		parts,
	};
}

test('admission is not an execution barrier; an assistant message is', () => {
	assert.equal(
		executionBarrierOf(
			{
				id: 'u',
				role: 'user',
				purpose: 'user',
				display: 'visible',
				submissionId: 'sub_1',
				parts: [{ type: 'text', text: 'hi', state: 'done' }],
			},
			'sub_1',
		),
		undefined,
	);
	assert.equal(executionBarrierOf(assistant('sub_1', []), 'sub_1'), 'message-started');
	assert.equal(
		executionBarrierOf(
			assistant('sub_1', [{ type: 'text', text: 'One', state: 'streaming' }]),
			'sub_1',
		),
		'message-delta',
	);
});

test('in-flight upsert is a tool-input barrier', () => {
	assert.equal(
		executionBarrierOf(
			assistant('sub_2', [
				{ type: 'dynamic-tool', toolName: 'upsertNote', toolCallId: 't1', state: 'input-available', input: {} },
			]),
			'sub_2',
			'upsertNote',
		),
		'tool-input:upsertNote',
	);
	assert.equal(
		executionBarrierOf(assistant('sub_2', [{ type: 'text', text: 'soon', state: 'streaming' }]), 'sub_2', 'upsertNote'),
		undefined,
	);
});

test('stream chunks for another submission are not this turn starting', () => {
	assert.equal(
		isExecutionChunk({ type: 'message-started', conversationId: 'c', messageId: 'm', submissionId: 'other', position: { batch: 1, index: 0 } }, 'sub_1'),
		undefined,
	);
	assert.equal(
		isExecutionChunk({ type: 'message-started', conversationId: 'c', messageId: 'm', submissionId: 'sub_1', position: { batch: 1, index: 0 } }, 'sub_1'),
		'message-started',
	);
	assert.equal(
		isExecutionChunk(
			{
				type: 'tool-input',
				conversationId: 'c',
				messageId: 'm',
				toolCallId: 't',
				toolName: 'upsertNote',
				input: {},
				position: { batch: 1, index: 1 },
			},
			'sub_1',
			'upsertNote',
		),
		'tool-input:upsertNote',
	);
});
