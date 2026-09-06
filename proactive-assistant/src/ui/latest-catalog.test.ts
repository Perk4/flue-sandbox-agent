import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { FlueConversationMessage } from '@flue/sdk';
import type { Note, NoteId, Notebook } from '../notebook.ts';
import { latestCatalogNotebook, notesInCatalog } from './latest-catalog.ts';

const ID_A = '11111111-1111-4111-8111-111111111111' as NoteId;
const ID_B = '22222222-2222-4222-8222-222222222222' as NoteId;

function note(id: NoteId, title: string, body: string, updatedAt: number): Note {
	return { id, title, body, updatedAt };
}

function message(
	id: string,
	parts: FlueConversationMessage['parts'],
	display: FlueConversationMessage['display'] = 'visible',
): FlueConversationMessage {
	return {
		id,
		role: 'assistant',
		purpose: 'assistant',
		display,
		parts,
	};
}

const firstCatalog: Notebook = {
	[ID_A]: note(ID_A, 'Todo', 'buy milk', 10),
};

const laterCatalog: Notebook = {
	[ID_A]: note(ID_A, 'Todo', 'buy milk', 10),
	[ID_B]: note(ID_B, 'Ship', 'flue', 20),
};

test('notes panel shows the latest catalog-shaped data-note across all messages', () => {
	const notebook = latestCatalogNotebook([
		message('old', [{ type: 'data-note', data: firstCatalog }]),
		message('user', [{ type: 'text', text: 'and another', state: 'done' }], 'visible'),
		message('newer', [{ type: 'data-note', data: laterCatalog }], 'diagnostic'),
	]);
	assert.deepEqual(notebook, laterCatalog);
	assert.deepEqual(
		notesInCatalog(notebook).map((entry) => entry.id),
		[ID_B, ID_A],
	);
});

test('a no-op later message does not blank the notes panel', () => {
	const notebook = latestCatalogNotebook([
		message('card', [{ type: 'data-note', data: firstCatalog }]),
		message('noop-review', [{ type: 'text', text: '', state: 'done' }], 'diagnostic'),
		message('noop-reply', [{ type: 'text', text: 'ok', state: 'done' }]),
	]);
	assert.deepEqual(notebook, firstCatalog);
	assert.equal(notesInCatalog(notebook)[0]?.title, 'Todo');
});

test('a non-catalog data-note is ignored', () => {
	const notebook = latestCatalogNotebook([
		message('card', [{ type: 'data-note', data: firstCatalog }]),
		message('single', [
			{
				type: 'data-note',
				data: { id: ID_B, title: 'Ghost', updatedAt: 99, body: 'not a catalog' },
			},
		]),
	]);
	assert.deepEqual(notebook, firstCatalog);
});
