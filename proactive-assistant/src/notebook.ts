import * as v from 'valibot';

export type NoteId = string & { readonly __brand: 'NoteId' };

export type Note = {
	id: NoteId;
	title: string;
	updatedAt: number;
	body: string;
};

export type Notebook = Record<NoteId, Note>;

export type UpsertNoteInput = {
	id?: string;
	title: string;
	body: string;
};

export type UpsertNoteOutput = {
	id: NoteId;
	title: string;
	updatedAt: number;
};

/** Durable Object SQL string/BLOB/row cap. A catalog write and its Card copy each must fit. */
export const SQL_VALUE_LIMIT_BYTES = 2 * 1024 * 1024;

/** The one `usePersistentState` name. There is no prefs key. */
export const NOTEBOOK_STATE_NAME = 'notebook';

export const EMPTY_NOTEBOOK: Notebook = {};

export const noteIdSchema = v.pipe(v.string(), v.uuid());

export const noteSchema = v.object({
	id: noteIdSchema,
	title: v.string(),
	updatedAt: v.number(),
	body: v.string(),
});

export const notebookCardSchema = v.record(noteIdSchema, noteSchema);

export const upsertNoteInput = v.object({
	id: v.optional(noteIdSchema),
	title: v.string(),
	body: v.string(),
});

export const upsertNoteOutput = v.object({
	id: noteIdSchema,
	title: v.string(),
	updatedAt: v.number(),
});

export function sqlValueBytes(value: unknown): number {
	return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

/** True when the Notebook JSON and the `data-note` Card copy both stay under 2 MB. */
export function notebookWriteFits(notebook: Notebook): boolean {
	const catalogBytes = sqlValueBytes(notebook);
	const cardBytes = sqlValueBytes({ type: 'data-note', data: notebook });
	return catalogBytes < SQL_VALUE_LIMIT_BYTES && cardBytes < SQL_VALUE_LIMIT_BYTES;
}

function asNoteId(id: string): NoteId {
	if (!v.is(noteIdSchema, id)) {
		throw new Error('id must be a uuid');
	}
	return id as NoteId;
}

export function applyUpsert(
	notebook: Notebook,
	input: UpsertNoteInput,
	options: { now: number; mintId: () => string },
): { notebook: Notebook; output: UpsertNoteOutput } {
	const id =
		input.id === undefined ? asNoteId(options.mintId()) : asNoteId(input.id);

	if (input.id !== undefined && !Object.hasOwn(notebook, id)) {
		throw new Error(`unknown note id ${id}`);
	}

	const note: Note = {
		id,
		title: input.title,
		body: input.body,
		updatedAt: options.now,
	};
	const next: Notebook = { ...notebook, [id]: note };
	if (!notebookWriteFits(next)) {
		throw new Error('notebook write exceeds the 2 MB SQL value limit');
	}

	return {
		notebook: next,
		output: { id, title: note.title, updatedAt: note.updatedAt },
	};
}

export type NotebookWriter = {
	setNotebook: (updater: (previous: Notebook) => Notebook) => void;
	writeNote: (notebook: Notebook) => void;
	now?: () => number;
	mintId?: () => string;
};

/**
 * Apply one upsert through the updater form so two creates in one response
 * cannot drop each other, then stamp the full Notebook as the `note` Card.
 */
export function commitUpsert(input: UpsertNoteInput, writer: NotebookWriter): UpsertNoteOutput {
	let output: UpsertNoteOutput | undefined;
	writer.setNotebook((previous) => {
		const result = applyUpsert(previous, input, {
			now: (writer.now ?? Date.now)(),
			mintId: writer.mintId ?? crypto.randomUUID.bind(crypto),
		});
		output = result.output;
		writer.writeNote(result.notebook);
		return result.notebook;
	});
	if (output === undefined) {
		throw new Error('notebook updater did not run');
	}
	return output;
}

export function notebookCatalogLines(notebook: Notebook): string {
	const notes = Object.values(notebook);
	if (notes.length === 0) {
		return 'The Notebook is empty.';
	}
	return notes
		.map((note) => `- ${note.id} ${note.title} (updated ${String(note.updatedAt)})`)
		.join('\n');
}
