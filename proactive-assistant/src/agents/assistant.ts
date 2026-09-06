'use agent';
import {
	type AgentProps,
	dispatch,
	useDataWriter,
	useDelivery,
	useInstruction,
	useModel,
	usePersistentState,
	useSkill,
	useTool,
} from '@flue/runtime';
import { extend, type CloudflareAgentLike } from '@flue/runtime/cloudflare';
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
import {
	REVIEW_INTERVAL_SECONDS,
	instanceNameOf,
	reviewInstructions,
	runHeartbeat,
	type ReviewAgentState,
} from '../review.ts';
import analysis from '../skills/analysis/SKILL.md';
import planning from '../skills/planning/SKILL.md';
import searchWriteUp from '../skills/search-write-up/SKILL.md';
import taskTracking from '../skills/task-tracking/SKILL.md';

export function Assistant(_props: AgentProps): string {
	useModel('cloudflare/@cf/moonshotai/kimi-k2.6');

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
	useInstruction(reviewInstructions(useDelivery()));

	return `You keep notes for this user. Prefer short replies. Use upsertNote to create or update Notes. Omit id to create. Pass a known uuid to update. When a Note is missing from this listing, call searchRecent. Cite a Note as id, title, and updatedAt from searchRecent. Do not cite chat turns as Notes.

Notebook:
${notebookCatalogLines(notebook)}`;
}

Assistant.initialData = v.object({ userId: v.string() });

type AssistantHost = CloudflareAgentLike<ReviewAgentState> & {
	name: string;
	heartbeat(): Promise<void>;
};

export const cloudflare = extend({
	base: (Base) => {
		class ReviewTimer extends (Base as unknown as new (...args: unknown[]) => AssistantHost) {
			async onStart() {
				await this.scheduleEvery(REVIEW_INTERVAL_SECONDS, 'heartbeat');
			}

			async heartbeat() {
				await runHeartbeat(
					{
						name: instanceNameOf(this),
						state: this.state,
						setState: (next) => {
							this.setState({ ...this.state, lastScheduleAt: next.lastScheduleAt });
						},
					},
					async (request) => {
						await dispatch(Assistant, request);
					},
					Date.now(),
				);
			}
		}
		return ReviewTimer as unknown as typeof Base;
	},
});
