import type { ConversationStreamChunk, FlueConversationMessage } from '@flue/sdk';

export type ExecutionBarrier =
	| 'message-started'
	| 'message-delta'
	| `tool-input:${string}`;

/**
 * Live Stop checks must see the runner claim a submission before abort().
 * Admission (`202`) is not enough.
 */
export function executionBarrierOf(
	message: FlueConversationMessage,
	submissionId: string,
	requireTool?: string,
): ExecutionBarrier | undefined {
	if (message.submissionId !== submissionId || message.role !== 'assistant') {
		return undefined;
	}
	for (const part of message.parts) {
		if (part.type === 'dynamic-tool') {
			if (requireTool === undefined || part.toolName === requireTool) {
				return `tool-input:${part.toolName}`;
			}
		}
		if (requireTool === undefined && part.type === 'text' && part.text.length > 0) {
			return 'message-delta';
		}
	}
	if (requireTool !== undefined) {
		return undefined;
	}
	return 'message-started';
}

/**
 * Work a submission actually produced: tool, catalog Card, or text.
 * An empty aborted assistant shell is not work — a queued Review can
 * exist without having run that look.
 */
export function assistantWorkOf(
	messages: readonly FlueConversationMessage[],
	submissionId: string,
): string | undefined {
	for (const message of messages) {
		if (message.submissionId !== submissionId || message.role !== 'assistant') {
			continue;
		}
		for (const part of message.parts) {
			if (part.type === 'dynamic-tool') {
				return `tool:${part.toolName}`;
			}
			if (part.type === 'data-note') {
				return 'data-note';
			}
			if (part.type === 'text' && part.text.length > 0) {
				return 'text';
			}
		}
	}
	return undefined;
}

export function isExecutionChunk(
	chunk: ConversationStreamChunk,
	submissionId: string,
	requireTool?: string,
): ExecutionBarrier | undefined {
	if (chunk.type === 'stream-checkpoint' || chunk.type === 'conversation-reset') {
		return undefined;
	}
	if (
		'submissionId' in chunk &&
		chunk.submissionId !== undefined &&
		chunk.submissionId !== submissionId
	) {
		return undefined;
	}
	if (chunk.type === 'tool-input') {
		if (requireTool === undefined || chunk.toolName === requireTool) {
			return `tool-input:${chunk.toolName}`;
		}
		return undefined;
	}
	if (requireTool !== undefined) {
		return undefined;
	}
	if (chunk.type === 'message-started') {
		return 'message-started';
	}
	if (chunk.type === 'message-delta' && chunk.delta.length > 0) {
		return 'message-delta';
	}
	return undefined;
}
