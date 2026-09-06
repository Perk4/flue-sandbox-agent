'use agent';
import {
	type AgentProps,
	useDataWriter,
	useInstruction,
	useModel,
	usePersistentState,
	useSkill,
	useTool,
} from '@flue/runtime';
import * as v from 'valibot';
import {
	EMPTY_NOTEBOOK,
	NOTEBOOK_STATE_NAME,
	commitUpsert,
	notebookCardSchema,
	notebookCatalogLines,
	searchRecent,
	searchRecentInput,
	searchRecentOutput,
	upsertNoteInput,
	upsertNoteOutput,
	type Notebook,
} from '../notebook.ts';
import analysis from '../skills/analysis/SKILL.md';
import planning from '../skills/planning/SKILL.md';
import searchWriteUp from '../skills/search-write-up/SKILL.md';
import taskTracking from '../skills/task-tracking/SKILL.md';

export function Assistant(_props: AgentProps): string {
	useModel('cloudflare/@cf/ibm-granite/granite-4.0-h-micro');

	const [notebook, setNotebook] = usePersistentState<Notebook>(
		NOTEBOOK_STATE_NAME,
		EMPTY_NOTEBOOK,
	);
	const writeNote = useDataWriter('note', { schema: notebookCardSchema });

	useTool({
		name: 'upsertNote',
		description:
			"Create or update one markdown Note in this User's Notebook. Omit id to create and mint a uuid. Pass a known Note id to update that Note. An unknown id fails and does not insert. Returns id, title, and updatedAt.",
		input: upsertNoteInput,
		output: upsertNoteOutput,
		run({ data }) {
			return {
				output: commitUpsert(data, { setNotebook, writeNote }),
			};
		},
	});

	useTool({
		name: 'searchRecent',
		description:
			"Find Notes in this User's Notebook by recency (updatedAt). Optional query matches id, title, or body. Returns { id, title, updatedAt } only. Does not scan chat. Cite a Note from this output, not from earlier turns.",
		input: searchRecentInput,
		output: searchRecentOutput,
		run({ data }) {
			return {
				output: searchRecent(notebook, data),
			};
		},
	});

	useSkill(analysis);
	useSkill(searchWriteUp);
	useSkill(taskTracking);
	useSkill(planning);
	useInstruction('You keep notes for this user. Prefer short replies.');

	return `You keep notes for this user. Prefer short replies. Use upsertNote to create or update Notes. Omit id to create. Pass a known uuid to update. When a Note is missing from this listing, call searchRecent. Cite a Note as id, title, and updatedAt from searchRecent. Do not cite chat turns as Notes.

Notebook:
${notebookCatalogLines(notebook)}`;
}

Assistant.initialData = v.object({ userId: v.string() });
