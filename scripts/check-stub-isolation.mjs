import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync('./package.json', 'utf8'));
const names = [
	...Object.keys(pkg.dependencies ?? {}),
	...Object.keys(pkg.devDependencies ?? {}),
];
const flueDeps = names.filter((name) => name.startsWith('@flue/'));
if (flueDeps.length > 0) {
	console.error(`root package.json must not depend on ${flueDeps.join(', ')}`);
	process.exit(1);
}
