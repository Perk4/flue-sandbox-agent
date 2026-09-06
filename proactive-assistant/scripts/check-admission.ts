const baseUrl = process.env.ADMISSION_BASE_URL ?? 'http://localhost:5173';
const instanceId = process.env.ADMISSION_ID ?? 'dev-1';

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireNonEmptyString(value: unknown, field: string): string {
	if (typeof value !== 'string' || value.length === 0) {
		throw new Error(`${field} must be a non-empty string`);
	}
	return value;
}

function parseAdmission(value: unknown): {
	streamUrl: string;
	offset: string;
	submissionId: string;
} {
	if (!isRecord(value)) {
		throw new Error('admission body must be a JSON object');
	}
	return {
		streamUrl: requireNonEmptyString(value.streamUrl, 'streamUrl'),
		offset: requireNonEmptyString(value.offset, 'offset'),
		submissionId: requireNonEmptyString(value.submissionId, 'submissionId'),
	};
}

const response = await fetch(`${baseUrl}/agents/assistant/${instanceId}`, {
	method: 'POST',
	headers: { 'content-type': 'application/json' },
	body: JSON.stringify({ kind: 'user', body: 'Hello' }),
});

if (response.status !== 202) {
	const text = await response.text();
	console.error(`expected HTTP 202, got ${response.status}`);
	console.error(text);
	process.exit(1);
}

const admission = parseAdmission(await response.json());
console.log(`streamUrl=${admission.streamUrl}`);
console.log(`offset=${admission.offset}`);
console.log(`submissionId=${admission.submissionId}`);
