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
	assert.match(assistant, /useInstruction\(/);
	assert.match(assistant, /Prefer short replies/);
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
