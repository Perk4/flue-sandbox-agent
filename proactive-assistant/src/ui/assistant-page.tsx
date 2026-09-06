import { useFlueAgent } from '@flue/react';
import { type FormEvent, useState } from 'react';
import { instanceIdFor } from '../identity.ts';
import { latestCatalogNotebook, notesInCatalog } from './latest-catalog.ts';
import {
	clearStoredUserId,
	isAuthFailure,
	readStoredUserId,
	writeStoredUserId,
} from './session-identity.ts';
import { textOf, visibleChatRows } from './visible-chat.ts';

function assistantUrl(userId: string): string {
	return `/agents/assistant/${instanceIdFor(userId)}`;
}

export function AssistantPage() {
	const [userId, setUserId] = useState<string | null>(readStoredUserId);

	function signOut() {
		clearStoredUserId();
		setUserId(null);
	}

	if (userId === null) {
		return (
			<SignIn
				onSignedIn={(next) => {
					writeStoredUserId(next);
					setUserId(next);
				}}
			/>
		);
	}

	return <AssistantSession onSignOut={signOut} userId={userId} />;
}

function SignIn({ onSignedIn }: { onSignedIn: (userId: string) => void }) {
	const [input, setInput] = useState('');
	const [error, setError] = useState<string | undefined>();
	const [pending, setPending] = useState(false);

	async function submit(event: FormEvent) {
		event.preventDefault();
		const nextUserId = input.trim();
		if (!nextUserId) {
			return;
		}
		setPending(true);
		setError(undefined);
		try {
			const response = await fetch('/session', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ userId: nextUserId }),
			});
			const body: unknown = await response.json().catch(() => undefined);
			if (!response.ok) {
				throw new Error(signInErrorMessage(body, response.status));
			}
			onSignedIn(nextUserId);
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : String(cause));
		} finally {
			setPending(false);
		}
	}

	return (
		<main className="shell sign-in">
			<h1>Assistant</h1>
			<p>Sign in. The session cookie rides every same-origin request.</p>
			<form onSubmit={(event) => void submit(event)}>
				<label>
					User
					<input
						autoComplete="username"
						onChange={(event) => setInput(event.target.value)}
						placeholder="alice"
						value={input}
					/>
				</label>
				<button disabled={pending || !input.trim()} type="submit">
					Sign in
				</button>
			</form>
			{error ? <p className="error">{error}</p> : null}
		</main>
	);
}

function signInErrorMessage(body: unknown, status: number): string {
	if (
		typeof body === 'object' &&
		body !== null &&
		'error' in body &&
		typeof body.error === 'string'
	) {
		return body.error;
	}
	return `sign-in failed (${String(status)})`;
}

function AssistantSession({
	onSignOut,
	userId,
}: {
	onSignOut: () => void;
	userId: string;
}) {
	const url = assistantUrl(userId);
	const agent = useFlueAgent({ url });
	const [input, setInput] = useState('');
	const [sendError, setSendError] = useState<unknown>();
	const rows = visibleChatRows(agent.messages);
	const notebook = latestCatalogNotebook(agent.messages);
	const notes = notesInCatalog(notebook);
	const busy = agent.status === 'submitted' || agent.status === 'streaming';
	const authFailed = isAuthFailure(agent.error) || isAuthFailure(sendError);

	async function submit(event: FormEvent) {
		event.preventDefault();
		const body = input.trim();
		if (!body) {
			return;
		}
		setInput('');
		setSendError(undefined);
		try {
			await agent.sendMessage(body);
		} catch (cause) {
			setInput(body);
			setSendError(cause);
		}
	}

	return (
		<main className="shell">
			<header className="top">
				<h1>Assistant</h1>
				<p className="meta">
					{userId} · {url} · {agent.status}
				</p>
				<button onClick={onSignOut} type="button">
					Sign out
				</button>
			</header>
			<div className="panes">
				<section className="chat" aria-label="Chat">
					<div aria-live="polite" className="log">
						{rows.map((row) => (
							<article className="row" data-role={row.role} key={row.id}>
								<strong>{row.role === 'user' ? 'User' : 'Assistant'}</strong>
								<p>{textOf(row)}</p>
							</article>
						))}
					</div>
					<form className="composer" onSubmit={(event) => void submit(event)}>
						<input
							aria-label="Message"
							onChange={(event) => setInput(event.target.value)}
							placeholder="Send a message"
							value={input}
						/>
						<button disabled={busy || authFailed || !input.trim()} type="submit">
							Send
						</button>
					</form>
					{authFailed ? (
						<p className="error">
							Session expired or this User does not own this Assistant.{' '}
							<button onClick={onSignOut} type="button">
								Sign in again
							</button>
						</p>
					) : agent.error ? (
						<p className="error">{agent.error.message}</p>
					) : null}
				</section>
				<aside className="notes" aria-label="Notebook">
					<h2>Notebook</h2>
					{notes.length === 0 ? (
						<p className="empty">No notes yet.</p>
					) : (
						<ul>
							{notes.map((entry) => (
								<li key={entry.id}>
									<h3>{entry.title}</h3>
									<pre>{entry.body}</pre>
								</li>
							))}
						</ul>
					)}
				</aside>
			</div>
		</main>
	);
}
