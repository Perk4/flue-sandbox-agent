export const SESSION_USER_KEY = 'assistant-user-id';

export function isAuthFailure(error: unknown): boolean {
	if (typeof error === 'object' && error !== null && 'status' in error) {
		const status = error.status;
		return status === 401 || status === 403;
	}
	const message = error instanceof Error ? error.message : undefined;
	return typeof message === 'string' && /\b40[13]\b/.test(message);
}

export function readStoredUserId(): string | null {
	try {
		return sessionStorage.getItem(SESSION_USER_KEY);
	} catch {
		return null;
	}
}

export function writeStoredUserId(userId: string): void {
	try {
		sessionStorage.setItem(SESSION_USER_KEY, userId);
	} catch {
		// Cookie still authenticates this tab.
	}
}

export function clearStoredUserId(): void {
	try {
		sessionStorage.removeItem(SESSION_USER_KEY);
	} catch {
		// Signing out still returns the page to SignIn.
	}
}
