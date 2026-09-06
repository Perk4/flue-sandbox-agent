const USER_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

export type UserId = string & { readonly __brand: 'UserId' };

export function parseUserId(raw: string): UserId {
	if (!USER_ID.test(raw)) {
		throw new Error('invalid user id');
	}
	return raw as UserId;
}

export function instanceIdFor(userId: string): string {
	return `user-${userId}`;
}

export function ownsAddress(userId: string, address: string): boolean {
	return address === instanceIdFor(userId);
}
