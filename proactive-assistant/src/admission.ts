import { ownsAddress, parseUserId } from './identity.ts';

export type Credential =
	| { tag: 'authenticated'; userId: string }
	| { tag: 'unauthenticated'; reason: 'missing' | 'forged' };

export type Ingress = {
	address: string;
	isChatPost: boolean;
	postKind?: string;
};

export type Verdict =
	| { tag: 'deny'; status: 401 | 403 | 400 }
	| { tag: 'allow'; stampOrigin: boolean };

export function credentialFromSignedValue(
	value: string | false | undefined,
): Credential {
	if (value === undefined) {
		return { tag: 'unauthenticated', reason: 'missing' };
	}
	if (value === false) {
		return { tag: 'unauthenticated', reason: 'forged' };
	}
	try {
		return { tag: 'authenticated', userId: parseUserId(value) };
	} catch {
		return { tag: 'unauthenticated', reason: 'forged' };
	}
}

export function decideAdmission(ingress: Ingress, credential: Credential): Verdict {
	if (credential.tag === 'unauthenticated') {
		return { tag: 'deny', status: 401 };
	}
	if (!ownsAddress(credential.userId, ingress.address)) {
		return { tag: 'deny', status: 403 };
	}
	if (ingress.isChatPost && ingress.postKind === 'signal') {
		return { tag: 'deny', status: 400 };
	}
	return {
		tag: 'allow',
		stampOrigin: ingress.isChatPost && ingress.postKind === 'user',
	};
}

export function stampOrigin(
	body: Record<string, unknown>,
	userId: string,
): Record<string, unknown> {
	const prior =
		body.initialData !== null &&
		typeof body.initialData === 'object' &&
		!Array.isArray(body.initialData)
			? (body.initialData as Record<string, unknown>)
			: {};
	return {
		...body,
		initialData: { ...prior, userId },
	};
}

export function assistantIngress(
	pathname: string,
	method: string,
	postKind?: string,
): Ingress | null {
	const prefix = '/agents/assistant/';
	if (!pathname.startsWith(prefix)) {
		return null;
	}
	const [address, ...tail] = pathname.slice(prefix.length).split('/');
	if (!address) {
		return null;
	}
	return {
		address,
		isChatPost: method === 'POST' && tail.length === 0,
		postKind,
	};
}
