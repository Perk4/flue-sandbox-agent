import type { FlueConversationMessage } from '@flue/sdk';
import * as v from 'valibot';
import { notebookCardSchema, type Note, type Notebook } from '../notebook.ts';

function isCatalog(data: unknown): data is Notebook {
	return v.is(notebookCardSchema, data);
}

/**
 * The Notebook the notes panel shows: the latest catalog-shaped `data-note`
 * across every message, including diagnostic rows. A later message with
 * no catalog Card leaves the previous catalog in place.
 */
export function latestCatalogNotebook(
	messages: readonly FlueConversationMessage[],
): Notebook | undefined {
	let catalog: Notebook | undefined;
	for (const message of messages) {
		for (const part of message.parts) {
			if (part.type === 'data-note' && isCatalog(part.data)) {
				catalog = part.data;
			}
		}
	}
	return catalog;
}

export function notesInCatalog(notebook: Notebook | undefined): Note[] {
	if (notebook === undefined) {
		return [];
	}
	return Object.values(notebook).sort((left, right) => right.updatedAt - left.updatedAt);
}

export type NotebookSnapshotEntry = {
	id: string;
	title: string;
	body: string;
	updatedAt: number;
};

/**
 * Every Note in the catalog, sorted by id. Live Stop checks compare this
 * around a queued Review so a differently titled Note or a KeepStop mutation
 * cannot hide behind a GhostStop title check.
 */
export function notebookSnapshot(notebook: Notebook): NotebookSnapshotEntry[] {
	return notesInCatalog(notebook)
		.map((entry) => ({
			id: entry.id,
			title: entry.title,
			body: entry.body,
			updatedAt: entry.updatedAt,
		}))
		.sort((left, right) => left.id.localeCompare(right.id));
}

export function notebooksEqual(left: Notebook, right: Notebook): boolean {
	return JSON.stringify(notebookSnapshot(left)) === JSON.stringify(notebookSnapshot(right));
}
