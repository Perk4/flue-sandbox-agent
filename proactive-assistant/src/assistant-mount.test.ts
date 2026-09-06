import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const srcRoot = dirname(fileURLToPath(import.meta.url));

function readSrc(relativePath: string): string {
	return readFileSync(join(srcRoot, relativePath), 'utf8');
}

test('Assistant mounts upsertNote, Instruction, and Skills without prefs or read_note', () => {
	const assistant = readSrc('agents/assistant.ts');
	const notebook = readSrc('notebook.ts');

	assert.match(assistant, /usePersistentState<Notebook>/);
	assert.match(assistant, /NOTEBOOK_STATE_NAME/);
	assert.match(assistant, /useDataWriter\('note'/);
	assert.match(assistant, /name: 'upsertNote'/);
	assert.match(assistant, /name: 'searchRecent'/);
	assert.match(assistant, /searchRecent\(notebook/);
	assert.match(assistant, /Cite a Note as id, title, and updatedAt from searchRecent/);
	assert.match(assistant, /useInstruction\(/);
	assert.match(assistant, /reviewInstructions\(/);
	assert.match(assistant, /useSkill\(analysis\)/);
	assert.match(assistant, /useSkill\(searchWriteUp\)/);
	assert.match(assistant, /useSkill\(taskTracking\)/);
	assert.match(assistant, /useSkill\(planning\)/);

	assert.doesNotMatch(assistant, /read_note|readNote/);
	assert.doesNotMatch(notebook, /read_note|readNote/);
	assert.doesNotMatch(assistant, /usePersistentState\(['"]prefs['"]/);
	assert.doesNotMatch(notebook, /usePersistentState\(['"]prefs['"]/);
	assert.equal((assistant.match(/usePersistentState<Notebook>/g) ?? []).length, 1);
});

test('Review is an instance timer: scheduleEvery, dispatch this.name, no Worker cron', () => {
	const assistant = readSrc('agents/assistant.ts');
	const review = readSrc('review.ts');
	const worker = readSrc('cloudflare.ts');
	const wrangler = readFileSync(join(srcRoot, '..', 'wrangler.jsonc'), 'utf8');

	assert.match(assistant, /export const cloudflare = extend\(/);
	assert.match(assistant, /from '@flue\/runtime\/cloudflare'/);
	assert.match(assistant, /async onStart\(/);
	assert.match(assistant, /this\.scheduleEvery\(REVIEW_INTERVAL_SECONDS, 'heartbeat'\)/);
	assert.match(assistant, /async heartbeat\(/);
	assert.match(assistant, /dispatch\(Assistant,/);
	assert.match(assistant, /instanceNameOf\(this\)/);
	assert.match(assistant, /runHeartbeat\(/);
	assert.match(assistant, /useDelivery\(\)/);
	assert.match(assistant, /reviewInstructions\(/);
	assert.match(assistant, /name: 'upsertNote'/);
	assert.match(review, /REVIEW_SIGNAL_BODY/);
	assert.match(review, /never a raw User id/);

	assert.doesNotMatch(assistant, /async fetch\(/);
	assert.doesNotMatch(assistant, /async onRequest\(/);
	assert.doesNotMatch(assistant, /async onFiberRecovered\(/);
	assert.doesNotMatch(assistant, /async alarm\(/);
	assert.doesNotMatch(assistant, /id:\s*['"]alice['"]/);
	assert.doesNotMatch(assistant, /dispatch\(Assistant,\s*\{\s*id:\s*userId/);
	assert.doesNotMatch(wrangler, /"crons"/);
	assert.doesNotMatch(wrangler, /"triggers"/);
	assert.doesNotMatch(worker, /async scheduled/);
	assert.doesNotMatch(worker, /export default/);
	assert.doesNotMatch(worker, /dispatch\(/);
});

test('upsertNote stays mounted on a Review and after a User joins', () => {
	const assistant = readSrc('agents/assistant.ts');
	const upsertIndex = assistant.indexOf("name: 'upsertNote'");
	const deliveryIndex = assistant.indexOf('useDelivery()');
	assert.ok(upsertIndex > 0);
	assert.ok(deliveryIndex > upsertIndex);
	assert.doesNotMatch(assistant, /if\s*\(\s*(?:review|isScheduleReview)/);
	assert.doesNotMatch(assistant, /unmount|removeTool/);
});

test('searchRecent does not walk chat, object storage, Vectorize, or D1', () => {
	const assistant = readSrc('agents/assistant.ts');
	const notebook = readSrc('notebook.ts');

	assert.match(notebook, /export function searchRecent\(\s*notebook: Notebook/);
	assert.match(assistant, /searchRecent\(notebook,/);
	assert.doesNotMatch(assistant, /env\.(VECTORIZE|DB|R2|BUCKET)/);
	assert.doesNotMatch(notebook, /env\.(VECTORIZE|DB|R2|BUCKET)/);
	assert.doesNotMatch(assistant, /from ['"]cloudflare:workers['"]/);
	assert.doesNotMatch(notebook, /from ['"]cloudflare:workers['"]/);
	assert.doesNotMatch(assistant, /\.history\(/);
	assert.doesNotMatch(notebook, /\.history\(/);
	assert.doesNotMatch(assistant, /getCloudflareContext/);
	assert.doesNotMatch(notebook, /getCloudflareContext/);
	assert.doesNotMatch(assistant, /recentTurns|chatTurns|messages\.filter/);
	assert.doesNotMatch(notebook, /recentTurns|chatTurns|messages\.filter/);
});

test('same-origin Assistant page uses the official client abort on this instance', () => {
	const page = readSrc('ui/assistant-page.tsx');
	const stop = readSrc('stop.ts');
	const assistant = readSrc('agents/assistant.ts');

	assert.match(page, /createFlueClient\(\{\s*url\s*\}\)/);
	assert.match(page, /useFlueAgent\(\{\s*client\s*\}\)/);
	assert.match(page, /stopInstance\(client\)/);
	assert.match(page, /toastForAbort\(/);
	assert.match(page, /type="button">\s*Stop\s*<\/button>/);
	assert.match(page, /disabled=\{stopping \|\| authFailed\}/);
	assert.doesNotMatch(page, /\btoken\b/);
	assert.match(page, /visibleChatRows\(/);
	assert.match(page, /latestCatalogNotebook\(/);
	assert.match(page, /clearStoredUserId/);
	assert.match(page, /Sign in again/);
	assert.match(page, /Sign out/);

	assert.match(stop, /client\.abort\(/);
	assert.match(stop, /POST \/:id\/abort/);
	assert.doesNotMatch(stop, /submissionId/);
	assert.doesNotMatch(stop, /cancelSchedule/);
	assert.doesNotMatch(page, /cancelSchedule/);
	assert.doesNotMatch(assistant, /cancelSchedule/);
	assert.doesNotMatch(page, /retry this Review|retryThisReview/i);
	assert.doesNotMatch(page, /this reply only/i);
	assert.doesNotMatch(page, /\/check\/review/);
	assert.match(assistant, /this\.scheduleEvery\(REVIEW_INTERVAL_SECONDS, 'heartbeat'\)/);
	assert.match(assistant, /commitUpsert\(data, \{ setNotebook, writeNote \}, signal\)/);
});

test('live-check Review uses Worker dispatch, not a chat signal POST', () => {
	const app = readSrc('app.ts');
	const wrangler = readFileSync(join(srcRoot, '..', 'wrangler.jsonc'), 'utf8');

	assert.match(app, /app\.post\('\/check\/review'/);
	assert.match(
		app,
		/dispatch\(\s*Assistant,\s*reviewDispatchRequest\(instanceIdFor\(credential\.userId\)\)/,
	);
	assert.match(app, /LIVE_STOP_CHECK/);
	assert.match(wrangler, /"\/check\/\*"/);
	assert.doesNotMatch(app, /JSON\.stringify\(\{\s*kind:\s*'signal'/);
});

test('/agents/* reaches the Worker before the SPA fallback', () => {
	const wrangler = readFileSync(join(srcRoot, '..', 'wrangler.jsonc'), 'utf8');
	const vite = readFileSync(join(srcRoot, '..', 'vite.config.ts'), 'utf8');
	const app = readSrc('app.ts');

	assert.match(wrangler, /"not_found_handling":\s*"single-page-application"/);
	assert.match(wrangler, /"\/agents\/\*"/);
	assert.match(wrangler, /"\/check\/\*"/);
	assert.doesNotMatch(app, /cors|Access-Control-Allow-Origin/);
	assert.match(vite, /plugins:\s*\[flue\(\),\s*react\(\),\s*cloudflare\(/);
});

test('skill directories match mounted jobs and carry templates', () => {
	const skills = [
		['analysis', 'ANALYSIS.md'],
		['search-write-up', 'WRITEUP.md'],
		['task-tracking', 'TASKS.md'],
		['planning', 'PLAN.md'],
	] as const;

	for (const [name, template] of skills) {
		const skill = readSrc(`skills/${name}/SKILL.md`);
		assert.match(skill, new RegExp(`^---\\nname: ${name}\\n`, 'm'));
		assert.match(skill, /description: /);
		assert.match(readSrc(`skills/${name}/${template}`), /\S/);
	}
});
