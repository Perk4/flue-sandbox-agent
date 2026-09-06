import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as v from 'valibot';
import {
	CATALOG_MAX_CHARS,
	EMPTY_NOTEBOOK,
	SEARCH_RECENT_DEFAULT_LIMIT,
	SEARCH_RECENT_MAX_LIMIT,
	applyUpsert,
	notebookCatalogLines,
	searchRecent,
	searchRecentInput,
	searchRecentOutput,
	type Note,
	type NoteId,
	type Notebook,
} from './notebook.ts';

const ID_A = '11111111-1111-4111-8111-111111111111' as NoteId;
const ID_B = '22222222-2222-4222-8222-222222222222' as NoteId;
const ID_C = '33333333-3333-4333-8333-333333333333' as NoteId;

function note(id: NoteId, title: string, body: string, updatedAt: number): Note {
	return { id, title, body, updatedAt };
}

function crowdedAfter(turn1: Notebook): Notebook {
	const crowded: Notebook = { ...turn1 };
	for (let index = 0; index < 80; index += 1) {
		const hex = index.toString(16).padStart(12, '0');
		const id = `22222222-2222-4222-8222-${hex}` as NoteId;
		crowded[id] = note(id, `Later ${String(index)}`, 'filler', 1_000 + index);
	}
	return crowded;
}

test('searchRecent returns id, title, and updatedAt sorted by recency', () => {
	const notebook: Notebook = {
		[ID_A]: note(ID_A, 'Older', 'a', 10),
		[ID_B]: note(ID_B, 'Newer', 'b', 20),
		[ID_C]: note(ID_C, 'Mid', 'c', 15),
	};
	const hits = searchRecent(notebook);
	assert.deepEqual(hits, [
		{ id: ID_B, title: 'Newer', updatedAt: 20 },
		{ id: ID_C, title: 'Mid', updatedAt: 15 },
		{ id: ID_A, title: 'Older', updatedAt: 10 },
	]);
	assert.equal('body' in hits[0]!, false);
	assert.equal(v.safeParse(searchRecentOutput, hits).success, true);
});

test('searchRecent filters title and body and never returns body', () => {
	const notebook: Notebook = {
		[ID_A]: note(ID_A, 'Milk run', 'buy milk', 1),
		[ID_B]: note(ID_B, 'Ship', 'flue agent', 2),
	};
	const hits = searchRecent(notebook, { query: 'milk' });
	assert.deepEqual(hits, [{ id: ID_A, title: 'Milk run', updatedAt: 1 }]);
	assert.equal(JSON.stringify(hits[0]).includes('buy milk'), false);
});

test('searchRecent does not walk chat turns', () => {
	const notebook: Notebook = {
		[ID_A]: note(ID_A, 'Milk run', 'buy milk', 1),
	};
	const recentTurns = [
		{ role: 'user', text: 'remember the secret note XYZ-from-chat' },
		{ role: 'assistant', text: 'I wrote XYZ-from-chat down.' },
	];
	const hits = searchRecent(notebook, { query: 'XYZ-from-chat' });
	assert.equal(hits.length, 0);
	assert.equal(recentTurns.some((turn) => turn.text.includes('XYZ-from-chat')), true);
	assert.equal(v.safeParse(searchRecentInput, { query: 'XYZ-from-chat' }).success, true);
});

test('same-batch search after the creating upsert is not the cite pass', () => {
	const renderSnapshot = EMPTY_NOTEBOOK;
	const created = applyUpsert(
		renderSnapshot,
		{ title: 'Milk run', body: 'buy milk' },
		{ now: 1, mintId: () => ID_A },
	);
	const sameBatch = searchRecent(renderSnapshot, { query: 'milk' });
	assert.equal(sameBatch.length, 0);
	assert.equal(created.notebook[ID_A]?.title, 'Milk run');
	const laterRender = searchRecent(created.notebook, { query: 'milk' });
	assert.deepEqual(laterRender, [{ id: ID_A, title: 'Milk run', updatedAt: 1 }]);
});

test('restart that still lists the Note in the prompt is not the cite pass', () => {
	const written = applyUpsert(
		EMPTY_NOTEBOOK,
		{ title: 'Milk run', body: 'buy milk' },
		{ now: 1, mintId: () => ID_A },
	);
	const restartedPrompt = `Notebook:\n${notebookCatalogLines(written.notebook)}`;
	assert.match(restartedPrompt, new RegExp(ID_A));
	assert.match(restartedPrompt, /Milk run/);
});

test('after a Note leaves the prompt, searchRecent supplies the cite', () => {
	const turn1 = applyUpsert(
		EMPTY_NOTEBOOK,
		{ title: 'Milk run', body: 'buy milk' },
		{ now: 1, mintId: () => ID_A },
	);
	const notebook = crowdedAfter(turn1.notebook);
	const compactedPrompt = [
		'Notebook:',
		notebookCatalogLines(notebook),
		'User: what was that grocery note?',
		'Assistant: I will look it up.',
	].join('\n');

	assert.ok(compactedPrompt.length > CATALOG_MAX_CHARS);
	assert.equal(compactedPrompt.includes(ID_A), false);
	assert.equal(compactedPrompt.includes('Milk run'), false);
	assert.equal(compactedPrompt.includes('buy milk'), false);
	assert.match(compactedPrompt, /\.\.\.and \d+ more\./);

	const hits = searchRecent(notebook, { query: 'milk' });
	assert.deepEqual(hits, [{ id: ID_A, title: 'Milk run', updatedAt: 1 }]);
	assert.equal('body' in hits[0]!, false);
	assert.match(JSON.stringify(hits[0]), new RegExp(ID_A));
	assert.match(JSON.stringify(hits[0]), /Milk run/);
	assert.match(JSON.stringify(hits[0]), /"updatedAt":1/);
});

test('searchRecent caps how many hits go back to the model', () => {
	const notebook: Notebook = {};
	for (let index = 0; index < SEARCH_RECENT_MAX_LIMIT + 5; index += 1) {
		const hex = index.toString(16).padStart(12, '0');
		const id = `11111111-1111-4111-8111-${hex}` as NoteId;
		notebook[id] = note(id, `N${String(index)}`, 'x', index);
	}
	assert.equal(searchRecent(notebook).length, SEARCH_RECENT_DEFAULT_LIMIT);
	assert.equal(searchRecent(notebook, { limit: SEARCH_RECENT_MAX_LIMIT }).length, SEARCH_RECENT_MAX_LIMIT);
	assert.equal(v.safeParse(searchRecentInput, { limit: SEARCH_RECENT_MAX_LIMIT + 1 }).success, false);
});
