# Interfaces

## Project rules (from CLAUDE.md, binding)
- Every new UI phrase goes into `src/i18n/en.ts`, `uk.ts`, `ru.ts` at once (typed; `i18n.test.ts` checks vars and plurals). Ukrainian apostrophe ’. In uk/ru the app is «Крякл».
- Never log user text (transcripts, summaries) to kryakl.log / speech.log / translate.log: they go into problem reports.
- Kryakl stays offline: nothing new talks to the network; engine and llama-server are 127.0.0.1.
- Pages get only what they do (`src/bridge.ts`): a new page gets a new `Page`, its own allowed messages and host calls.
- Match the surrounding code: its naming, comment density (sparse, plain English), no new dependencies.
- Run Electron with `ELECTRON_RUN_AS_NODE` unset. Do not commit `media/*.js` changes unrelated to your ticket (the working tree has pre-existing modified built files: leave them).

## Commands
- Stack: Electron 45, TypeScript (esbuild), vitest; Python engine with uv (`engine/pyproject.toml`).
- Check: `npm run typecheck && npm test && npm run build`; one file: `npx vitest run src/summary.test.ts`.
- Engine: once `~/.local/bin/uv sync --project engine --group dev` (creates engine/.venv), then `npm run test:engine`; one file: `uv run --project engine --frozen --no-sync pytest engine/tests/test_store.py -q`.
- Run the app on this Mac: `env -u ELECTRON_RUN_AS_NODE npm start` (quit any installed Kryakl first: single-instance lock).
- No new npm or Python dependencies.

## Boundaries decided in the spec

### Engine (T01) — HTTP, used by main and the capture page
- `POST /recordings` accepts `source: "system"` and track key `"system"`; optional `app: string` (≤ 80 chars, stored in `job` and copied into transcript.json as `app`). Default title for system: `"Call"`.
- `POST /recordings/{id}/finish` accepts optional `lost: int ≥ 0`, stored in transcript.json as `lost` (omitted when 0).
- Two-track path: `kind in ("meet","system")` and `"mic"` in tracks and (`"tab"` or `"system"`) in tracks. `system` is treated exactly as `tab` everywhere (`merge.stored`, `resplit`, word `track`).
- `PUT /transcripts/{id}/summary` body `{summary: {text: str, template: str, mine: bool, language: str|null, made: iso, edited?: iso} | null}` → `{ok: true}`; 404 unknown id; 409 while not `done`; 400 when `text` missing or > 100 000 chars. Saved inside transcript.json `summary`; `null` removes it.
- `GET /transcripts` rows carry `summarized: 0|1`; the fts index holds title + utterances + summary text.
- `redo` keeps `summary`, `app`, `lost`.
- `export.to_md/to_txt/to_docx` and `notes.write_transcript`: summary `text` on top under a heading `Summary` (md `## Summary`), then the transcript. `export.SOURCES["system"] = "Call"`.

### `src/summary.ts` (T02) — pure logic + factory
```ts
export type SummaryTemplate = 'general' | 'standup' | 'interview' | 'lecture' | 'own'
export interface SummaryLine { speaker: string; start: number; text: string }   // speaker = display name
export interface SummaryInput { title: string; lines: SummaryLine[]; duration: number; language: string | null; lost?: number }
export interface SummaryOptions { template: SummaryTemplate; own?: string; mine: boolean; native: string /* English name, e.g. 'Russian' */ }
export interface SummaryProgress { part: number; parts: number }   // the page estimates time left from the main's `started` and parts done   // part 0..parts; parts+1 means "joining"
export interface Summary { text: string; template: SummaryTemplate; mine: boolean; language: string | null; made: string }
export function splitParts(lines: SummaryLine[], partSeconds?: number, partChars?: number): SummaryLine[][]   // ~1200 s, ≤ 12000 chars
export function renderSummary(json: SummaryJson, language: string | null, lost?: number): string                       // Markdown, headings per language (en/uk/ru, else en); topics as "- [mm:ss] title" (h:mm:ss past an hour)
export function checkSummary(json: SummaryJson, input: SummaryInput): SummaryJson   // due kept only if all its numbers and 3+ letter words occur in the text; who kept only if a speaker name or in the text; any item with a number absent from the text dropped; topics outside 0..duration dropped
export function createSummarizer(o: { files: LlmFiles; model: () => LlmModel; fetch?: typeof fetch }): {
  summarize(input: SummaryInput, options: SummaryOptions, onProgress: (p: SummaryProgress) => void, signal?: AbortSignal): Promise<Summary>
}
export const TOPIC_TIME: RegExp   // matches "[mm:ss]" / "[h:mm:ss]" in a summary line, shared with the page
export function topicSeconds(stamp: string): number
```
`SummaryJson = {short: string, decisions: string[], tasks: {who: string, what: string, due: string}[], questions: string[], topics: {title: string, at: number}[]}` (exported).
Errors: throws `Error` with an English message; main maps to the UI.

### Main ↔ capture page (T03)
- Page `media/capture.html` + `src/webview/capture.ts`, bridge `Page 'capture'`, host calls only `/^\/recordings([/?]|$)/`.
- main → page `{type:'capture', command:'start', title, consent?}` / `'stop'` / `'pause'` / `'resume'`.
- page → main messages (only `capture` may send them): `captureState {state: 'starting'|'recording'|'paused'|'stopping'|'idle', id?, seconds?, silent?: boolean, micMissing?: boolean, error?: string}`, `captureDone {id: string|null, lost: number}`, `captureHide`, `captureOpenSettings`.
- main finds a known call program at start (`callApp(processNames: string[]): string | null` in `src/callapps.ts`, tested; names Zoom, Microsoft Teams, Telegram, Discord, Slack, FaceTime, Skype, Webex) → title and `app`.
- main keeps `callRecording: {state, id, startedAt} | null`; `recordingNow()` includes it; exported helpers in main: `startCall()`, `stopCall(): Promise<string|null>`, `toggleCall()`.

### Main ↔ app window (T04)
- `AppView.call: {state: 'idle'|'starting'|'recording'|'paused'|'stopping', seconds: number}`.
- `AppView.summaries: Record<string, {part: number, parts: number, started: number, error?: string}>`.
- page → main: `toggleCall`, `summarize {id, template, own?, mine}`, `cancelSummary {id}` (APP_ONLY).
- Settings fields: `meetingKey`, `callSummaryAuto`, `callTemplate: SummaryTemplate`, `callOwn`, `callSummaryMine`, `callConsentSeen`, `callPanelOffset` (T03 adds `meetingKey`, `callConsentSeen`, `callPanelOffset`; T04 the summary ones).

## What finished tickets built
(appended as tickets land)
