'use agent';
import { type AgentProps, useModel } from '@flue/runtime';
import * as v from 'valibot';

export function Assistant(_props: AgentProps): string {
	useModel('cloudflare/@cf/ibm-granite/granite-4.0-h-micro');
	return 'You keep notes for this user. Prefer short replies.';
}

Assistant.initialData = v.object({ userId: v.string() });
