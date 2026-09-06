import { useFlueAgent } from '@flue/react';
import { type FormEvent, useState } from 'react';
import { instanceIdFor } from '../identity.ts';
import { latestCatalogNotebook, notesInCatalog } from './latest-catalog.ts';
import { textOf, visibleChatRows } from './visible-chat.ts';

const SESSION_USER_KEY = 'assistant-user-id';

function assistantUrl(userId: string): string {
	return `/agents/assistant/${instanceIdFor(userId)}`;
}

function readStoredUserId(): string | null {
	try {
		return sessionStorage.getItem(SESSION_USER_KEY);
	} catch {
		return null;
	}
}

export function AssistantPage() {
	const [userId, setUserId] = useState<string | null>(readStoredUserId);

	if (userId === null) {
		return (
			<SignIn
				onSignedIn={(next) => {
					try {
						sessionStorage.setItem(SESSION_USER_KEY, next);
					} catch {
						// Cookie still authenticates this tab.
					}
					setUserId(next);
				}}
			/>
		);
	}

	return <AssistantSession userId={userId} />;
}

function SignIn({ onSignedIn }: { onSignedIn: (userId: string) => void }) {
	const [input, setInput] = useState('');
	const [error, setError] = useState<string | undefined>();
	const [pending, setPending] = useState(false);

	async function submit(event: FormEvent) {
		event.preventDefault();
		const userId = input.trim();
		if (!userId) {
			return;
		}
		setPending(true);
		setError(undefined);
		try {
			const response = await fetch('/session', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ userId }),
			});
			const body: unknown = await response.json().catch(() => undefined);
			if (!response.ok) {
				const message =
					typeof body === 'object' &&
					body !== null &&
					'error' in body &&
					typeof body.error === 'string'
						? body.error
						: `sign-in failed (${String(response.status)})`;
				throw new Error(message);
			}
			onSignedIn(userId);
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

function AssistantSession({ userId }: { userId: string }) {
	const url = assistantUrl(userId);
	const agent = useFlueAgent({ url });
	const [input, setInput] = useState('');
	const rows = visibleChatRows(agent.messages);
	const notebook = latestCatalogNotebook(agent.messages);
	const notes = notesInCatalog(notebook);
	const busy = agent.status === 'submitted' || agent.status === 'streaming';

	async function submit(event: FormEvent) {
		event.preventDefault();
		const body = input.trim();
		if (!body) {
			return;
		}
		setInput('');
		try {
			await agent.sendMessage(body);
		} catch {
			setInput(body);
		}
	}

	return (
		<main className="shell">
			<header className="top">
				<h1>Assistant</h1>
				<p className="meta">
					{userId} · {url} · {agent.status}
				</p>
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
						<button disabled={busy || !input.trim()} type="submit">
							Send
						</button>
					</form>
					{agent.error ? <p className="error">{agent.error.message}</p> : null}
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
