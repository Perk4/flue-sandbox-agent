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

export type SearchRecentInput = {
	query?: string;
	limit?: number;
};

export type SearchRecentHit = {
	id: NoteId;
	title: string;
	updatedAt: number;
};

/** Cloudflare Durable Object SQL string/BLOB/row cap. Decimal 2 MB, not 2 MiB. */
export const SQL_VALUE_LIMIT_BYTES = 2_000_000;

/** Room for Flue record envelopes around the catalog JSON and the Card copy. */
export const SQL_VALUE_HEADROOM_BYTES = 4 * 1024;

/** Prompt catalog: clip each title so one long string cannot blow the context. */
export const CATALOG_TITLE_MAX_CHARS = 80;

/** Prompt catalog: keep the interpolated Notebook listing bounded. */
export const CATALOG_MAX_CHARS = 4_000;

/** Default number of recency hits returned to the model. */
export const SEARCH_RECENT_DEFAULT_LIMIT = 8;

/** Cap so one search cannot dump the whole Notebook into the prompt. */
export const SEARCH_RECENT_MAX_LIMIT = 20;

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

export const searchRecentHitSchema = v.object({
	id: noteIdSchema,
	title: v.string(),
	updatedAt: v.number(),
});

export const searchRecentInput = v.object({
	query: v.optional(v.string()),
	limit: v.optional(
		v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(SEARCH_RECENT_MAX_LIMIT)),
	),
});

export const searchRecentOutput = v.array(searchRecentHitSchema);

export function sqlValueBytes(value: unknown): number {
	return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

/** True when the Notebook JSON and the `data-note` Card copy both stay under 2 MB. */
export function notebookWriteFits(notebook: Notebook): boolean {
	const budget = SQL_VALUE_LIMIT_BYTES - SQL_VALUE_HEADROOM_BYTES;
	const catalogBytes = sqlValueBytes(notebook);
	const cardBytes = sqlValueBytes({ type: 'data-note', data: notebook });
	return catalogBytes < budget && cardBytes < budget;
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
 *
 * Flue commits `usePersistentState` with the tool batch. An abort that
 * already fired must not apply the updater: a committed Note stays, and an
 * in-flight upsert does not land. Pass the tool `signal`.
 */
export function commitUpsert(
	input: UpsertNoteInput,
	writer: NotebookWriter,
	signal?: AbortSignal,
): UpsertNoteOutput {
	if (signal?.aborted) {
		throw new Error('upsertNote aborted');
	}
	let output: UpsertNoteOutput | undefined;
	writer.setNotebook((previous) => {
		if (signal?.aborted) {
			throw new Error('upsertNote aborted');
		}
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

function clipCatalogTitle(title: string): string {
	if (title.length <= CATALOG_TITLE_MAX_CHARS) {
		return title;
	}
	return `${title.slice(0, CATALOG_TITLE_MAX_CHARS - 3)}...`;
}

export function notebookCatalogLines(notebook: Notebook): string {
	const notes = Object.values(notebook).sort((left, right) => right.updatedAt - left.updatedAt);
	if (notes.length === 0) {
		return 'The Notebook is empty.';
	}

	const lines: string[] = [];
	let used = 0;
	for (const entry of notes) {
		const line = `- ${entry.id} ${clipCatalogTitle(entry.title)} (updated ${String(entry.updatedAt)})`;
		const next = used === 0 ? line.length : used + 1 + line.length;
		if (next > CATALOG_MAX_CHARS) {
			break;
		}
		lines.push(line);
		used = next;
	}

	const hidden = notes.length - lines.length;
	if (hidden > 0) {
		lines.push(`...and ${String(hidden)} more.`);
	}
	return lines.join('\n');
}

function noteMatchesQuery(note: Note, query: string): boolean {
	const needle = query.trim().toLowerCase();
	if (needle.length === 0) {
		return true;
	}
	return (
		note.id.toLowerCase().includes(needle) ||
		note.title.toLowerCase().includes(needle) ||
		note.body.toLowerCase().includes(needle)
	);
}

/**
 * TypeScript filter over this User's Notebook. Recency is `updatedAt`.
 * Reads the render snapshot: same-batch search after an upsert can miss
 * the Note just written. Does not walk chat, fetch object storage, or
 * query Vectorize / D1.
 */
export function searchRecent(
	notebook: Notebook,
	input: SearchRecentInput = {},
): SearchRecentHit[] {
	const requested = input.limit ?? SEARCH_RECENT_DEFAULT_LIMIT;
	const limit = Math.min(Math.max(1, requested), SEARCH_RECENT_MAX_LIMIT);
	const query = input.query ?? '';
	return Object.values(notebook)
		.filter((entry) => noteMatchesQuery(entry, query))
		.sort((left, right) => right.updatedAt - left.updatedAt)
		.slice(0, limit)
		.map((entry) => ({
			id: entry.id,
			title: entry.title,
			updatedAt: entry.updatedAt,
		}));
}
