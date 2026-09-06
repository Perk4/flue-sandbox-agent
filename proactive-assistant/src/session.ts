export const SESSION_COOKIE = 'session';

export function sessionCookieOptions(secure: boolean): {
	path: '/';
	httpOnly: true;
	sameSite: 'Strict';
	secure: boolean;
} {
	return {
		path: '/',
		httpOnly: true,
		sameSite: 'Strict',
		secure,
	};
}
