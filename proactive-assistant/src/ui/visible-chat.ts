import type { FlueConversationMessage, FlueConversationPart } from '@flue/sdk';

export function textOf(message: FlueConversationMessage): string {
	return message.parts
		.filter((part): part is Extract<FlueConversationPart, { type: 'text' }> => part.type === 'text')
		.map((part) => part.text)
		.join('');
}

function hasVisibleAssistantText(message: FlueConversationMessage): boolean {
	return textOf(message).trim().length > 0;
}

/**
 * Chat rows the User should see: visible User and assistant text.
 * Diagnostic/hidden rows stay off the transcript. Empty assistant rows
 * (no-op Review, tool-only replies) do not appear as chat.
 */
export function visibleChatRows(
	messages: readonly FlueConversationMessage[],
): FlueConversationMessage[] {
	return messages.filter((message) => {
		if (message.display !== 'visible') {
			return false;
		}
		if (message.role === 'assistant' && !hasVisibleAssistantText(message)) {
			return false;
		}
		return true;
	});
}
