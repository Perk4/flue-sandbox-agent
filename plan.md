**Yes — this maps cleanly onto Flue’s agent + Durable Object model on Cloudflare.** Here’s a practical architecture and setup for a **proactive assistant** that:

- Generates and maintains **personalized artifacts** (documents, charts, tables, summaries, plans, etc.)
- Keeps durable per-user data
- Performs **relevant + recent search**
- Surfaces everything in an **iOS-native chat UI** style

### 1. High-level Architecture (Recommended)

```
iOS / React Native / web chat UI
        ↓ (HTTP / SSE / WebSocket)
Flue Worker (Cloudflare)
  ├── One Durable Object per user/conversation (the assistant agent)
  ├── Durable SQLite state (history, artifacts metadata, preferences)
  ├── R2 (or DO storage) for artifact files / blobs
  ├── Virtual or Computer sandbox for generation
  ├── Search tools (web + your own data)
  └── Optional: scheduled proactive wakes (alarms / cron)
```

- Each user/session gets its own **Durable Object** agent → perfect isolation, persistence, and recovery.
- Artifacts live as structured objects the agent can create, update, version, and reference.
- The UI just consumes the conversation stream + artifact attachments / side-panel data.

### 2. Project Setup

```bash
# Create project
npx flue init --target cloudflare my-proactive-assistant
cd my-proactive-assistant

# Core deps
npm install @flue/runtime @flue/vite @flue/cli @flue/sdk hono
npm install -D vite @cloudflare/vite-plugin wrangler

# Optional but recommended for richer artifacts & search
npm install @cloudflare/sandbox   # only if you need full Linux later
# or use the lighter Cloudflare Computer / virtual sandbox
```

**`vite.config.ts`**
```ts
import { flue } from '@flue/vite';
import { cloudflare } from '@cloudflare/vite-plugin';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [flue(), cloudflare()],
});
```

**`wrangler.jsonc`** (minimal starting point)
```jsonc
{
  "name": "proactive-assistant",
  "compatibility_date": "2026-09-01",
  "compatibility_flags": ["nodejs_compat"],
  "migrations": [
    {
      "tag": "v1",
      "new_sqlite_classes": ["FlueAssistantAgent"]
    }
  ],
  // Add later:
  // "r2_buckets": [{ "binding": "ARTIFACTS", "bucket_name": "user-artifacts" }],
  // "ai": { "binding": "AI" },
  // observability, etc.
}
```

### 3. Core Agent Definition

Create `src/agents/assistant.ts` (or similar):

```ts
'use agent';
import {
  useModel,
  useSandbox,
  useTool,
  useSkill,
  type AgentProps,
} from '@flue/runtime';
import { cloudflareSandbox } from '@flue/runtime/cloudflare'; // if using full sandbox
// or rely on default virtual sandbox + Computer

export function Assistant({ id }: AgentProps) {
  // Prefer Workers AI + AI Gateway for cost/control, or any Pi-supported model
  useModel('cloudflare/@cf/moonshotai/kimi-k2.6'); // or anthropic/..., openai/...

  // Lightweight durable workspace (recommended starting point)
  // For full Linux later: useSandbox(cloudflareSandbox(getSandbox(env.Sandbox, id)))

  // Skills = reusable expertise (Markdown or TS)
  useSkill('./skills/artifact-generation.md');
  useSkill('./skills/data-maintenance.md');
  useSkill('./skills/proactive-behavior.md');

  // Tools the agent can call
  useTool(searchRecent);      // web + internal search
  useTool(createArtifact);
  useTool(updateArtifact);
  useTool(listArtifacts);
  useTool(getUserData);
  useTool(saveUserPreference);
  // etc.
}
```

Mount it in `src/app.ts`:

```ts
import { Hono } from 'hono';
import { Assistant } from './agents/assistant';

const app = new Hono();

// Per-user / per-conversation route
app.route('/agents/assistant/:conversationId', Assistant);

// Optional: proactive webhook / scheduled endpoint
// app.post('/proactive/:userId', ...)

export default app;
```

### 4. Artifact Generation & Data Maintenance Pattern

Treat artifacts as **first-class durable objects** the agent owns:

**Suggested artifact shape** (store metadata in DO SQLite, content in R2 or DO storage):

```ts
type Artifact = {
  id: string;
  userId: string;
  type: 'document' | 'chart' | 'table' | 'plan' | 'summary' | 'dashboard';
  title: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  tags: string[];
  contentRef: string;        // R2 key or DO key
  preview?: string;          // short markdown/html for chat
  personalization: {
    tone?: string;
    focusAreas?: string[];
    style?: 'ios-minimal' | 'detailed' | ...
  };
};
```

**Agent tools (examples):**

- `createArtifact({ type, title, content, tags })` → writes content, returns ID + preview
- `updateArtifact({ id, changes })` → versioned update
- `listArtifacts({ query, recent })` → filtered list
- `searchRecent({ query, sources: ['web', 'user-data', 'artifacts'], recency })`

For **proactive** behavior:
- Use Durable Object alarms / `schedule` / `scheduleEvery` so the agent can wake itself (e.g. “check for new relevant info every morning”).
- On wake it can search, update artifacts, and optionally push a notification or new message into the conversation stream.

### 5. Relevant + Recent Search Capabilities

Give the agent tools that combine:

1. **Web / real-time search** (via a search API or Cloudflare’s capabilities)
2. **Internal knowledge** (user’s previous artifacts + conversation history)
3. **Recency bias** (prefer last 7/30 days, or use timestamps in ranking)

Example tool sketch:

```ts
useTool({
  name: 'searchRecent',
  description: 'Search recent and relevant information across web and user data',
  parameters: { /* zod or json schema */ },
  async execute({ query, recencyDays = 14, sources }) {
    // 1. Search user’s artifacts + history (vector or keyword + timestamp filter)
    // 2. Call external search (Tavily, Serper, Brave, etc. or Workers AI embeddings)
    // 3. Rank by relevance + recency
    // 4. Return structured results the agent can cite and turn into artifacts
  }
});
```

Store embeddings or search indexes in the Durable Object or a shared Vectorize / D1 / R2 index if the volume grows.

### 6. iOS Chat Components & Style

**Backend side** (Flue):
- Use the official Flue streaming protocol (SSE / long-poll / WebSocket via `@flue/sdk`).
- Emit rich message parts: `text`, `artifact`, `chart`, `table`, `action`, `suggestion`.
- Attachments and artifact previews come through the same stream.

**Frontend / iOS side** (recommended approaches):

| Approach | Recommendation |
|----------|----------------|
| **Native iOS** | SwiftUI chat with custom bubbles, `MessageKit`-style or pure SwiftUI. Consume Flue SSE. Render artifact previews as cards that open full-screen views. |
| **React Native / Expo** | Use a polished chat UI library (e.g. Gifted Chat, or custom with Reanimated) + Flue React hooks (`@flue/react`) for streaming. Style heavily with iOS design tokens (SF Pro, system colors, large titles, blur, etc.). |
| **Web (progressive)** | Next/Astro + React chat components that look native-iOS (use `@flue/react` + Tailwind + iOS-inspired design system). |

**Styling tips for “iOS chat” feel**:
- Rounded message bubbles with subtle shadows / blur
- System blue / gray color palette
- SF Symbols for actions
- Large, clean typography
- Artifact cards that expand into full native-feeling sheets or navigation stacks
- Haptic feedback on key actions
- Dark mode first-class support

Emit structured parts from the agent so the UI can decide how to render:

```ts
// Example agent output part
{
  type: 'artifact',
  artifactId: '...',
  preview: '## Weekly Summary\n...',
  actions: [{ label: 'Open full view', action: 'open-artifact' }]
}
```

### 7. Proactive Behavior

1. On user message → agent responds + may create/update artifacts.
2. Background: use Durable Object `alarm` or Cloudflare Cron Triggers → agent wakes, runs `searchRecent`, decides if anything is worth notifying the user about, then posts a new message into the conversation (or sends a push via your notification service).
3. Keep a `lastProactiveCheck` and user preferences (`notifyOn`, quiet hours, topics of interest) in the Durable Object state.

### 8. Suggested Next Steps / Project Layout

```
src/
  agents/
    assistant.ts
  skills/
    artifact-generation.md
    data-maintenance.md
    proactive-behavior.md
    ios-style-guidelines.md   // tell the agent how to phrase things for iOS feel
  tools/
    search.ts
    artifacts.ts
    user-data.ts
  app.ts
  cloudflare.ts               // optional scheduled handlers
```

### 9. Quick Start Commands

```bash
# Local development (workerd)
npm run dev          # or vite dev

# Build & deploy
npm run build
npx wrangler deploy
```

# Integration Patterns and Voice Functionality 

**High-level architecture for a proactive, artifact-generating, data-maintaining assistant with rich search, iOS-style chat UI, and high-quality voice (STT + TTS with word-level transcription).**

### Overall Architecture

```
iOS / React Native / Web Client (iOS-styled chat)
  ├── Text + rich message parts (SSE / WebSocket)
  ├── Audio in (mic PCM 16 kHz) ──────────────────────┐
  └── Audio out (streaming TTS) ←─────────────────────┤
                                                      │
Cloudflare Worker + Flue Agent (Durable Object per user/conversation)
  ├── Agent core (hooks: model, tools, skills, sandbox)
  ├── Artifact system (metadata in DO SQLite, content in R2 / DO storage)
  ├── Search tools (web + internal + recency ranking)
  ├── Voice pipeline
  │     ├── STT (streaming or batch) → word-level transcript
  │     ├── LLM turn (same agent)
  │     └── TTS (streaming sentence-by-sentence)
  ├── Proactive alarms / scheduled wakes
  └── Optional: Cloudflare Realtime SFU / WebRTC for lower-latency voice
```

This builds directly on Flue’s Cloudflare target (one Durable Object per agent instance) and Cloudflare’s Agents SDK voice primitives (`@cloudflare/voice`). The same agent that handles text also handles voice turns, artifacts, and search — no separate “voice agent.”

### 1. Agent Core

**Best practice pattern** (declarative Flue style):

```ts
'use agent';
import {
  useModel, useSandbox, useTool, useSkill, useState,
  type AgentProps
} from '@flue/runtime';

export function Assistant({ id }: AgentProps) {
  useModel('cloudflare/@cf/moonshotai/kimi-k2.6'); // or any Pi provider

  // Durable workspace for artifacts & context
  // useSandbox(...) — virtual / Computer / full Cloudflare Sandbox as needed

  useSkill('./skills/artifact-generation.md');
  useSkill('./skills/data-maintenance.md');
  useSkill('./skills/proactive.md');
  useSkill('./skills/voice-guidelines.md'); // tone, brevity for spoken replies

  // Core tools
  useTool(searchRecent);
  useTool(createOrUpdateArtifact);
  useTool(listArtifacts);
  useTool(getUserProfile);
  useTool(transcribeAudio);   // or rely on platform STT
  useTool(synthesizeSpeech);

  // Optional persistent state hooks for preferences, last proactive check, etc.
}
```

**Key practices**:
- Keep the agent identity stable (`agentName` or function name) so Durable Object storage survives renames only via explicit migrations.
- Put reusable expertise in Markdown skills (artifact style guides, search ranking rules, iOS-friendly phrasing).
- Use Durable Object alarms / `schedule` for proactive behavior (“check for relevant updates every morning and surface new artifacts if useful”).
- Prefer Workers AI models + AI Gateway for cost control and observability.

### 2. Artifact System

**Data model** (store metadata in the agent’s Durable Object SQLite; binary/large content in R2):

```ts
type Artifact = {
  id: string;
  conversationId: string;
  type: 'document' | 'chart' | 'table' | 'plan' | 'dashboard' | 'summary';
  title: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  tags: string[];
  contentRef: string;          // R2 key or DO key
  previewMarkdown?: string;    // short version for chat bubble
  wordTimestamps?: WordTiming[]; // if generated from voice
  personalization: {
    tone?: string;
    focus?: string[];
    style?: 'ios-minimal' | 'detailed';
  };
  sourceSearchIds?: string[];  // link back to search results used
};
```

**Integration pattern**:
- Tools `createArtifact`, `updateArtifact`, `listArtifacts`, `getArtifact` are first-class.
- Agent decides when to materialize an artifact (after search, after multi-turn reasoning, on proactive wake).
- Chat UI receives a structured message part `{ type: 'artifact', artifactId, preview, actions }` and can open a full native sheet/view.
- Versioning + soft deletes keep history recoverable.
- For charts/tables, prefer structured JSON the client can render with native iOS components (Swift Charts, etc.) rather than only images.

### 3. Search Tools

**Pattern for “relevant + recent”**:

```ts
useTool({
  name: 'searchRecent',
  description: 'Search web + user data + past artifacts with recency bias',
  parameters: z.object({
    query: z.string(),
    recencyDays: z.number().default(14),
    sources: z.array(z.enum(['web', 'artifacts', 'history', 'user-data'])),
    limit: z.number().default(8)
  }),
  async execute(args) {
    // 1. Internal: keyword + vector search over artifacts/history (filter by timestamp)
    // 2. External: Tavily / Brave / Serper / Workers AI embeddings + web search
    // 3. Rank by relevance score × recency decay
    // 4. Return structured results with citations the agent can turn into artifacts
  }
});
```

Best practices:
- Always return source + timestamp so the agent can cite them.
- Bias ranking toward the last 7–30 days unless the user asks for historical.
- Cache frequent queries or use AI Gateway caching.
- Let the agent decide whether to create/update an artifact from the results.

### 4. Chat UI Contract (iOS-styled)

**Message part types** the client should support:

| Part type       | Purpose                                      | iOS rendering idea                  |
|-----------------|----------------------------------------------|-------------------------------------|
| `text`          | Normal reply                                 | Bubble (system blue / gray)         |
| `artifact`      | Generated/updated artifact                   | Card → full-screen sheet            |
| `search-result` | Intermediate search hits                     | Collapsible list with citations     |
| `transcript`    | STT result with word timings                 | Highlighted words, tappable         |
| `audio`         | TTS audio URL or stream                      | Inline player / auto-play           |
| `suggestion`    | Quick replies / proactive prompts            | Pill buttons                        |
| `action`        | “Open artifact”, “Regenerate”, etc.          | Native buttons                      |

**Streaming contract**:
- Use Flue’s existing SSE / long-poll / WebSocket protocol (`@flue/sdk` or `@flue/react`).
- For voice, extend the same WebSocket with binary PCM frames (inbound) and streaming audio chunks (outbound).
- Client keeps a single conversation ID → one Durable Object.

**iOS style guidelines** (put in a skill so the agent follows them):
- Short spoken sentences.
- Prefer system colors, SF Symbols, large titles, blur materials.
- Artifact cards should feel like native “widgets” or Notes attachments.

### 5. Voice (TTS + STT) — High Quality + Lite + Word-Level Transcription

**Recommended stack on Cloudflare (2026)**:

| Component | Recommended options | Notes |
|-----------|---------------------|-------|
| **STT (Whisper-level / better)** | `@cf/openai/whisper-large-v3-turbo` or `@cf/deepgram/nova-3` / Flux via Workers AI | Word-level timestamps available; Flux is optimized for conversational agents. Deepgram / AssemblyAI for production streaming + diarization if needed. |
| **TTS (high quality + low latency)** | Workers AI Deepgram Aura-2 (lite, edge), Cartesia Sonic (≈40 ms TTFA), ElevenLabs Flash / Turbo, OpenAI TTS-1 | Cartesia or Aura for real-time agents; ElevenLabs for highest naturalness. |
| **Transport** | Binary WebSocket PCM 16 kHz mono (same connection as text) or Cloudflare Realtime SFU / WebRTC | Matches official Agents SDK voice examples. |

**Integration patterns**:

**A. Platform-native (preferred with Flue / Agents SDK)**  
Use Cloudflare’s experimental `@cloudflare/voice` (`withVoice(Agent)`):

```ts
import { withVoice, WorkersAIFluxSTT, WorkersAITTS } from '@cloudflare/voice';

const VoiceAssistant = withVoice(Assistant); // your Flue agent class

// Inside the agent:
transcriber = new WorkersAIFluxSTT(env.AI);  // or Nova-3
tts = new WorkersAITTS(env.AI);              // Aura-2
```

- Mic audio streams as 16 kHz PCM over the existing WebSocket.
- STT detects end-of-turn and produces a transcript (with word timings when the model supports it).
- LLM runs the normal agent turn (tools, artifacts, search).
- TTS streams sentence-by-sentence while the LLM is still generating → low time-to-first-audio.
- Supports barge-in / interruption.

**B. Tool-based (more control, works with pure Flue)**  
Expose tools:

- `transcribe({ audioUrl or base64, wordTimestamps: true })` → calls Workers AI Whisper-large-v3-turbo or Deepgram.
- `speak({ text, voice, speed })` → returns streaming audio URL or chunks.

For true “Whisperflow-level” (precise word timestamps + alignment):

- Request `word_timestamps: true` / `timestamp_granularities: ["word"]` (OpenAI Whisper style) or Deepgram/AssemblyAI equivalents.
- Store the `words: [{ word, start, end, confidence }]` array with the transcript message part.
- Client can highlight words in real time or seek audio to exact words.

**Best practices for voice quality & latency**:
- Stream TTS as soon as the first complete sentence arrives from the LLM (sentence aggregator pattern).
- Use a lightweight “voice” skill that forces concise, speakable language.
- Prefer edge models (Workers AI Aura / Whisper-turbo, Cartesia) for <200–300 ms perceived latency.
- Keep audio in the same Durable Object conversation so history, artifacts, and voice turns stay consistent.
- For mobile: capture 16 kHz mono PCM, apply simple VAD client-side if desired, support push-to-talk + continuous modes.
- Proactive voice: on alarm wake the agent can generate a short spoken summary + new artifact and push a notification with audio.

**References & examples**:
- Cloudflare Agents voice pipeline: https://blog.cloudflare.com/voice-agents/ and the `voice-agent` example in `cloudflare/agents`.
- Workers AI models: Whisper-large-v3-turbo, Deepgram Flux/Nova-3 (STT), Aura-2 (TTS).
- Word-level timestamps: Whisper `word_timestamps=True`, Deepgram/AssemblyAI native word timings.
- Flue Cloudflare target + Durable Objects for state.
- Client: `@flue/sdk` / `@flue/react` for text + extend with binary audio frames.

This architecture keeps everything inside one Flue agent per user, gives you durable personalized artifacts, strong recent search, native-feeling iOS chat, and production-grade voice with word-level transcription — while staying lightweight on the edge.


# Data Flows and Patterns 

**Data Flow Notes & References for the Proactive Assistant**

Here is a clear, end-to-end picture of how data moves through the system (Flue agent on Cloudflare Durable Objects + artifacts + search + voice + iOS-style client).

### 1. High-Level Data Flow Overview

```
Client (iOS / RN / Web)
  │
  ├── Text message / voice PCM (16 kHz mono)
  │         ↓  (HTTP POST or WebSocket / SSE)
  │
Flue Worker
  │
  └── Durable Object (one per conversation / user)
        │
        ├── Admission → durable queue (persists even if client disconnects)
        ├── STT (if voice) → word-level transcript
        ├── Agent turn (LLM + tools + skills)
        │     ├── Search tools → ranked results
        │     ├── Artifact tools → create / update / list
        │     └── Other tools (user data, preferences…)
        ├── State written to DO SQLite (history, artifact metadata, preferences)
        ├── Large blobs → R2 (artifact content, audio files)
        ├── TTS (streaming) → audio chunks back to client
        └── Response stream (text parts + artifact cards + audio + transcript)
              ↓
Client renders iOS-style bubbles, cards, word-highlighted transcript, plays audio
```

Proactive path (no user input):
```
Cloudflare Alarm / Cron → Durable Object wakes
  → Agent runs searchRecent + decides whether to create/update artifact
  → Optionally posts a new message into the conversation stream
  → Optional push notification with short audio summary
```

### 2. Detailed Flows

#### A. Text Message Flow
1. Client sends `{ message: { kind: "user", body: "..." } }` to `/agents/assistant/:conversationId`.
2. Flue admits the input into the Durable Object’s durable queue (survives disconnects/restarts).
3. Agent “re-renders” (hooks run): model, skills, tools are composed.
4. LLM decides tool calls (search, createArtifact, etc.).
5. Tool results are fed back; final response is streamed as structured parts.
6. Everything (messages, tool calls, artifact metadata) is appended to the canonical conversation stream in DO SQLite.
7. Client receives SSE / WebSocket events and updates the chat UI.

#### B. Voice (STT → Agent → TTS) Flow
1. Client captures mic → 16 kHz mono PCM → binary WebSocket frames (same connection used for text).
2. Durable Object feeds audio to STT:
   - Preferred: Workers AI `@cf/openai/whisper-large-v3-turbo` or `@cf/deepgram/nova-3` / Flux.
   - Request word-level timestamps when available.
3. STT emits final transcript (+ optional interim partials + word timings).
4. Transcript becomes a normal user message → same agent turn as text.
5. LLM streams text response → sentence aggregator splits into speakable chunks.
6. Each chunk goes to TTS (Workers AI Aura-2, Cartesia Sonic, ElevenLabs Flash, etc.).
7. Audio streams back as binary frames or short-lived URLs; client plays with low latency.
8. Full transcript (with word timings) and any generated artifacts are stored in the same conversation.

**Barge-in / interruption**: Client can send a cancel signal; Durable Object aborts the current fiber/turn.

#### C. Artifact Data Flow
1. Agent calls `createArtifact` / `updateArtifact` tool.
2. Tool writes:
   - Metadata + preview + version + tags → DO SQLite (fast queries, personalization).
   - Full content (Markdown, JSON chart data, HTML, etc.) → R2 (keyed by `userId/artifactId/version`).
3. Tool returns `{ artifactId, preview, actions }` to the LLM.
4. LLM emits a structured message part of type `artifact`.
5. Client renders a native-looking card; tapping opens a full-screen view that fetches content from R2 (or via a signed Flue endpoint).
6. Later searches or proactive runs can retrieve/update the same artifact by ID.

#### D. Search Data Flow
1. Agent calls `searchRecent({ query, recencyDays, sources })`.
2. Tool:
   - Queries DO SQLite / Vectorize (or simple keyword + timestamp filter) for past artifacts & history.
   - Calls external search (or Workers AI embeddings + web).
   - Ranks by relevance × recency decay.
3. Structured results (with sources + timestamps) return to the agent.
4. Agent may cite them, turn them into a new artifact, or both.
5. Results can be stored temporarily in the conversation for citation.

#### E. Proactive / Background Flow
1. Durable Object alarm fires (or Cloudflare Cron triggers a wake).
2. Agent loads user preferences + last check timestamp from SQLite.
3. Runs `searchRecent` with the user’s focus topics.
4. If something new and useful → creates/updates artifact + posts a short message (optionally with TTS audio).
5. Client receives the new message the next time it connects (or via push).

### 3. Storage & Persistence Summary

| Data                        | Location                  | Why |
|----------------------------|---------------------------|-----|
| Conversation history, tool calls, submissions | Durable Object SQLite    | Strong consistency, recovery, single source of truth |
| Artifact metadata, versions, tags, personalization | DO SQLite                | Fast listing & filtering per user |
| Artifact content (large)   | R2                        | Cheap, durable object storage |
| Audio recordings / TTS files (optional) | R2 or temporary           | Avoid bloating DO storage |
| User preferences, last proactive check | DO SQLite                | Survives restarts |
| Search indexes (optional)  | Vectorize / D1 / R2       | Scale beyond single DO |

Flue automatically uses the Durable Object’s SQLite for the canonical stream; you do **not** write a separate `db.ts` on the Cloudflare target.

### 4. Key References & Best-Practice Sources

**Flue / Cloudflare core**
- Flue Cloudflare target: https://flueframework.com/docs/guide/cloudflare-target/
- Deploy on Cloudflare: https://flueframework.com/docs/ecosystem/deploy/cloudflare/
- Durable execution & recovery model (fibers, alarms, streams)

**Voice pipeline**
- Cloudflare Agents voice: https://blog.cloudflare.com/voice-agents/ and `cloudflare/agents` examples (`voice-agent`)
- Workers AI models: Whisper-large-v3-turbo (STT + segments/word timings), Deepgram Flux/Nova-3, Aura-2 (TTS)
- Official pattern: `withVoice(Agent)` + binary PCM over the same WebSocket

**Word-level transcription**
- Whisper `word_timestamps=True` / `timestamp_granularities: ["word"]`
- Deepgram & AssemblyAI native word timings + confidence scores
- Store the `words: [{word, start, end, confidence}]` array with the transcript message part

**Artifacts & client contract**
- Structured message parts (text, artifact, transcript, audio, suggestion) — design the TypeScript types once and share between agent tools and client.
- R2 for content + DO SQLite for metadata is the standard pattern on Cloudflare.

**Proactive / scheduling**
- Durable Object Alarms API + Flue’s `schedule` / `scheduleEvery` helpers.

### 5. Practical Notes & Gotchas

- **Admission vs execution**: Client can disconnect after sending a message; the Durable Object continues the turn and the client can later replay from any offset via the Durable Streams protocol.
- **CPU limits**: Agent turns are mostly I/O-bound; raise `cpu_ms` only if you do heavy local computation.
- **Audio latency**: Stream TTS sentence-by-sentence; keep STT and TTS on the same edge network (Workers AI) when possible.
- **Personalization**: Keep a small user profile object in the DO; pass relevant pieces into skills/prompts.
- **Migrations**: Adding a new agent or changing its identity requires an explicit Durable Object migration tag.
- **Observability**: Enable Workers observability + Flue’s OpenTelemetry adapter so you can see the full STT → tool → TTS trace.

This data-flow design keeps the agent the single source of truth, makes artifacts durable and queryable, supports high-quality word-level voice, and gives the iOS client a clean, structured stream to render native-feeling UI.

