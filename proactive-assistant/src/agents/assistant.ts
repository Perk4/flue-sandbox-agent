'use agent';
import { type AgentProps, useModel } from '@flue/runtime';

export function Assistant(_props: AgentProps): string {
	useModel('cloudflare/@cf/meta/llama-3.1-8b-instruct-fast');
	return 'You keep notes for this user. Prefer short replies.';
}
