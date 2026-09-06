import type { AgentAbortResult, FlueClient } from '@flue/sdk';

/** Toast copy when Stop actually ended work. Idle Stop must not show this. */
export const STOPPED_TOAST = 'stopped';

/** Official conversation abort. No submission id — there is no “this reply only.” */
export type StopAbort = Pick<FlueClient, 'abort'>;

/**
 * Notice after Stop. `{ aborted: false }` is idle: nothing to toast.
 * `{ aborted: true }` means in-flight and queued work (User turn, Review,
 * joined send) is being aborted. Saved Notes are not rolled back here.
 */
export function toastForAbort(result: AgentAbortResult): typeof STOPPED_TOAST | undefined {
	return result.aborted ? STOPPED_TOAST : undefined;
}

/**
 * Stop on this Assistant instance. `FlueClient.abort()` is `POST /:id/abort`:
 * conversation-scoped, every unsettled submission. It does not cancel
 * `heartbeat` / `scheduleEvery`. Aborting a fetch is not this call.
 */
export async function stopInstance(
	client: StopAbort,
	options?: { signal?: AbortSignal },
): Promise<AgentAbortResult> {
	return await client.abort(options);
}
