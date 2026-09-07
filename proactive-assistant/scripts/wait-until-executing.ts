import type { FlueClient } from '@flue/sdk';
import {
	executionBarrierOf,
	type ExecutionBarrier,
} from '../src/execution-barrier.ts';

/**
 * Wait until Flue has started running this submission — not merely admitted it.
 * Cancelling the observer does not Stop the Assistant; that is `abort()`.
 * `onBarrier` runs before this promise resolves so Stop can race the runner.
 */
export async function waitUntilExecuting(
	client: FlueClient,
	submissionId: string,
	label: string,
	options: {
		requireTool?: string;
		timeoutMs?: number;
		onBarrier?: (barrier: ExecutionBarrier) => Promise<void>;
	} = {},
): Promise<ExecutionBarrier> {
	const observation = client.observe({ live: 'sse' });
	const timeout = AbortSignal.timeout(options.timeoutMs ?? 90_000);
	let settled = false;
	let unsubscribe = () => {};
	try {
		return await new Promise((resolve, reject) => {
			const finish = (action: () => void) => {
				if (settled) {
					return;
				}
				settled = true;
				timeout.removeEventListener('abort', onTimeout);
				unsubscribe();
				action();
			};
			const onTimeout = () => {
				finish(() => reject(new Error(`${label} never started executing`)));
			};
			timeout.addEventListener('abort', onTimeout, { once: true });

			const inspect = (): ExecutionBarrier | undefined => {
				const snap = observation.getSnapshot();
				if (snap.phase === 'error' && snap.error) {
					finish(() => reject(snap.error));
					return undefined;
				}
				const outcome = snap.conversation?.settlements.find(
					(entry) => entry.submissionId === submissionId,
				)?.outcome;
				if (outcome === 'completed') {
					finish(() => reject(new Error(`${label} completed before Stop`)));
					return undefined;
				}
				if (outcome === 'aborted' || outcome === 'failed') {
					finish(() =>
						reject(new Error(`${label} settled ${outcome} before an execution barrier`)),
					);
					return undefined;
				}
				for (const message of snap.conversation?.messages ?? []) {
					const barrier = executionBarrierOf(message, submissionId, options.requireTool);
					if (barrier !== undefined) {
						return barrier;
					}
				}
				return undefined;
			};

			const hit = (barrier: ExecutionBarrier) => {
				finish(() => {
					const hook = options.onBarrier;
					if (hook === undefined) {
						resolve(barrier);
						return;
					}
					void hook(barrier).then(
						() => resolve(barrier),
						(cause: unknown) => reject(cause),
					);
				});
			};

			unsubscribe = observation.subscribe(() => {
				const barrier = inspect();
				if (barrier !== undefined) {
					hit(barrier);
				}
			});
			const immediate = inspect();
			if (immediate !== undefined) {
				hit(immediate);
			}
		});
	} finally {
		observation.close();
	}
}
