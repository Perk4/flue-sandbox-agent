import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as v from 'valibot';
import {
	CATALOG_MAX_CHARS,
	CATALOG_TITLE_MAX_CHARS,
	EMPTY_NOTEBOOK,
	NOTEBOOK_STATE_NAME,
	SQL_VALUE_HEADROOM_BYTES,
	SQL_VALUE_LIMIT_BYTES,
	applyUpsert,
	commitUpsert,
	notebookCatalogLines,
	notebookWriteFits,
	sqlValueBytes,
	upsertNoteInput,
	type Note,
	type NoteId,
	type Notebook,
	type UpsertNoteOutput,
} from './notebook.ts';

const ID_A = '11111111-1111-4111-8111-111111111111' as NoteId;
const ID_B = '22222222-2222-4222-8222-222222222222' as NoteId;
const UNKNOWN = '33333333-3333-4333-8333-333333333333';

function note(id: NoteId, title: string, body: string, updatedAt: number): Note {
	return { id, title, body, updatedAt };
}

function mintSeq(ids: string[]): () => string {
	let index = 0;
	return () => {
		const id = ids[index];
		if (id === undefined) {
			throw new Error('mintId sequence exhausted');
		}
		index += 1;
		return id;
	};
}

test('omit id creates a Note with a minted uuid', () => {
	const { notebook, output } = applyUpsert(
		EMPTY_NOTEBOOK,
		{ title: 'Todo', body: 'buy milk' },
		{ now: 10, mintId: () => ID_A },
	);
	assert.equal(output.id, ID_A);
	assert.equal(output.title, 'Todo');
	assert.equal(output.updatedAt, 10);
	assert.equal('body' in output, false);
	assert.deepEqual(notebook[ID_A], note(ID_A, 'Todo', 'buy milk', 10));
	assert.equal(Object.keys(notebook).length, 1);
});

test('upsertNote input does not accept slugs like todo', () => {
	const slug = v.safeParse(upsertNoteInput, { id: 'todo', title: 'Todo', body: 'x' });
	assert.equal(slug.success, false);
	assert.throws(
		() =>
			applyUpsert(
				EMPTY_NOTEBOOK,
				{ id: 'todo', title: 'Todo', body: 'x' },
				{ now: 1, mintId: () => ID_A },
			),
		/uuid/,
	);
	assert.equal(v.safeParse(upsertNoteInput, { title: 'Todo', body: 'x' }).success, true);
	assert.equal(
		v.safeParse(upsertNoteInput, { id: ID_A, title: 'Todo', body: 'x' }).success,
		true,
	);
});

test('a known id updates that Note', () => {
	const prior: Notebook = { [ID_A]: note(ID_A, 'Todo', 'old', 1) };
	const { notebook, output } = applyUpsert(
		prior,
		{ id: ID_A, title: 'Todo', body: 'new' },
		{ now: 20, mintId: () => ID_B },
	);
	assert.deepEqual(output, { id: ID_A, title: 'Todo', updatedAt: 20 });
	assert.deepEqual(notebook[ID_A], note(ID_A, 'Todo', 'new', 20));
	assert.equal(Object.keys(notebook).length, 1);
});

test('an unknown id fails and does not insert', () => {
	const prior: Notebook = { [ID_A]: note(ID_A, 'Keep', 'me', 1) };
	assert.throws(
		() =>
			applyUpsert(
				prior,
				{ id: UNKNOWN, title: 'Ghost', body: 'nope' },
				{ now: 2, mintId: () => ID_B },
			),
		/unknown note id/,
	);
	assert.equal(prior[ID_A]?.body, 'me');
	assert.equal(Object.hasOwn(prior, UNKNOWN), false);
});

test('two omitted-id creates stay two Notes', () => {
	let store: Notebook = EMPTY_NOTEBOOK;
	const cards: Notebook[] = [];
	const mintId = mintSeq([ID_A, ID_B]);
	const writer = {
		setNotebook: (updater: (previous: Notebook) => Notebook) => {
			store = updater(store);
		},
		writeNote: (notebook: Notebook) => {
			cards.push(notebook);
		},
		now: () => 5,
		mintId,
	};

	const first: UpsertNoteOutput = commitUpsert({ title: 'One', body: 'a' }, writer);
	const second: UpsertNoteOutput = commitUpsert({ title: 'Two', body: 'b' }, writer);

	assert.equal(first.id, ID_A);
	assert.equal(second.id, ID_B);
	assert.equal(Object.keys(store).length, 2);
	assert.equal(store[ID_A]?.title, 'One');
	assert.equal(store[ID_B]?.title, 'Two');
	assert.deepEqual(cards[0], { [ID_A]: note(ID_A, 'One', 'a', 5) });
	assert.deepEqual(cards[1], store);
});

test('a create or update writes the full Notebook as the Card payload', () => {
	let store: Notebook = { [ID_A]: note(ID_A, 'Keep', 'old', 1) };
	let card: Notebook | undefined;
	commitUpsert(
		{ id: ID_A, title: 'Keep', body: 'new' },
		{
			setNotebook: (updater) => {
				store = updater(store);
			},
			writeNote: (notebook) => {
				card = notebook;
			},
			now: () => 9,
		},
	);
	assert.deepEqual(card, store);
	assert.equal(card?.[ID_A]?.body, 'new');
});

test('unknown id does not write a Card', () => {
	let store: Notebook = { [ID_A]: note(ID_A, 'Keep', 'me', 1) };
	let wrote = false;
	assert.throws(() =>
		commitUpsert(
			{ id: UNKNOWN, title: 'Ghost', body: 'nope' },
			{
				setNotebook: (updater) => {
					store = updater(store);
				},
				writeNote: () => {
					wrote = true;
				},
			},
		),
	);
	assert.equal(wrote, false);
	assert.equal(Object.keys(store).length, 1);
	assert.equal(store[ID_A]?.body, 'me');
});

test('a write that would strain the 2 MB SQL value, including the Card copy, is rejected', () => {
	const huge = 'x'.repeat(SQL_VALUE_LIMIT_BYTES);
	assert.throws(
		() =>
			applyUpsert(
				EMPTY_NOTEBOOK,
				{ title: 'Huge', body: huge },
				{ now: 1, mintId: () => ID_A },
			),
		/2 MB SQL value/,
	);

	const prior: Notebook = { [ID_A]: note(ID_A, 'Keep', 'me', 1) };
	assert.throws(
		() =>
			applyUpsert(
				prior,
				{ id: ID_A, title: 'Keep', body: huge },
				{ now: 2, mintId: () => ID_B },
			),
		/2 MB SQL value/,
	);
	assert.equal(prior[ID_A]?.body, 'me');

	const small: Notebook = { [ID_A]: note(ID_A, 'Ok', 'short', 1) };
	assert.equal(notebookWriteFits(small), true);
	assert.equal(SQL_VALUE_LIMIT_BYTES, 2_000_000);
	assert.ok(SQL_VALUE_LIMIT_BYTES < 2 * 1024 * 1024);
	assert.ok(sqlValueBytes(small) < SQL_VALUE_LIMIT_BYTES - SQL_VALUE_HEADROOM_BYTES);
	assert.ok(
		sqlValueBytes({ type: 'data-note', data: small }) <
			SQL_VALUE_LIMIT_BYTES - SQL_VALUE_HEADROOM_BYTES,
	);

	const midMiB = 'x'.repeat(2_020_000);
	assert.throws(
		() =>
			applyUpsert(
				EMPTY_NOTEBOOK,
				{ title: 'Mid', body: midMiB },
				{ now: 3, mintId: () => ID_A },
			),
		/2 MB SQL value/,
	);
});

test('a later listing still sees a Note written earlier', () => {
	const written = applyUpsert(
		EMPTY_NOTEBOOK,
		{ title: 'Keep', body: 'after restart' },
		{ now: 3, mintId: () => ID_A },
	);
	assert.match(notebookCatalogLines(written.notebook), new RegExp(`${ID_A} Keep`));
	const later = applyUpsert(
		written.notebook,
		{ title: 'Second', body: 'still there' },
		{ now: 4, mintId: () => ID_B },
	);
	assert.match(notebookCatalogLines(later.notebook), new RegExp(`${ID_A} Keep`));
	assert.match(notebookCatalogLines(later.notebook), new RegExp(`${ID_B} Second`));
});

test('catalog clips long titles and stays inside the prompt budget', () => {
	const longTitle = 'T'.repeat(CATALOG_TITLE_MAX_CHARS + 40);
	const { notebook } = applyUpsert(
		EMPTY_NOTEBOOK,
		{ title: longTitle, body: 'x' },
		{ now: 1, mintId: () => ID_A },
	);
	const clipped = notebookCatalogLines(notebook);
	assert.equal(clipped.includes(longTitle), false);
	assert.match(clipped, /T{10,}\.\.\./);
	assert.equal(notebook[ID_A]?.title, longTitle);

	const crowded: Notebook = {};
	for (let index = 0; index < 80; index += 1) {
		const hex = index.toString(16).padStart(12, '0');
		const id = `11111111-1111-4111-8111-${hex}` as NoteId;
		crowded[id] = note(id, `Title ${String(index)}`, 'b', index);
	}
	const catalog = notebookCatalogLines(crowded);
	assert.ok(catalog.length <= CATALOG_MAX_CHARS + 40);
	assert.match(catalog, /\.\.\.and \d+ more\./);
});

test('the Notebook state name is notebook, not prefs', () => {
	assert.equal(NOTEBOOK_STATE_NAME, 'notebook');
	assert.notEqual(NOTEBOOK_STATE_NAME, 'prefs');
});
