# Notes: the code as it is (branch `mac`, 2026-11-06)

Read by every executor instead of exploring from scratch. `file:line` are approximate — search the name.

## Recording protocol (Chrome extension, the model to copy)
- `extension/offscreen.js`: `SLICE = 10_000`, `RETRIES = 5`; `new MediaRecorder(stream, {mimeType:'audio/webm;codecs=opus', audioBitsPerSecond:64000})`, `recorder.start(SLICE)`. Mic `getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}})` in try/catch; without it only one track.
- Create `POST /recordings {source:'meet', title, tracks:{tab:{startedAt}, mic?:{startedAt}}}` → `{id}`. Chunk `PUT /recordings/{id}/{track}/{seq}` (seq per track from 0). Uploads per track serialized; up to 5 tries, `1000*(attempt+1)` ms; `r.ok || 409` = done; else `lost++`, recording goes on. Finish: stop recorders, await uploads, release, `POST /recordings/{id}/finish {}` → `{ok,id,lost}`.

## Engine (`engine/`)
- `app.py`: `SOURCES = ("file","mic","meet","note")` (:80), `TRACKS = ("main","mic","tab")` (:81). `start_recording` (:729) accepts `source` in mic|meet|note, track keys in TRACKS, default titles `{"mic":"Microphone recording","meet":"Meeting","note":"Note"}`, `store.create(title, source, "recording", job)`, job `{kind, tracks, language, speakers}`. `chunk` (:748) 409 when not recording, writes `incoming/{track}-{seq:06d}.part`; no size limit for token callers. `finish` (:770) body `{language?, speakers?}` → `jobs.finish_recording` + `worker.submit`; 409 "Nothing to transcribe" when no chunks. `DELETE /recordings/{id}` only while recording.
- `jobs.py`: `finish_recording` (:71-98) joins parts into `incoming/{track}.webm`, offsets from `startedAt`. `STALE = 180` s without a chunk → `_housekeeping` finishes it as interrupted ("The recording was cut off; what arrived is transcribed"). `_transcribe` (:343-421) builds transcript.json from scratch (a `redo` drops unknown keys!). Two-track path (:387): `if kind == "meet" and "mic" in tracks and "tab" in tracks:` mic words → `ME`, tab diarized → S1..; `merge.meeting(my, their, turns)` with `drop_echo` (mic word also in tab ±1.5 s dropped). Otherwise `merge.single` on the mix. `WEIGHTS` stages decode/words/speakers/save. `_resplit` (:436) keeps extra keys.
- `merge.py`: `ME = "me"`; `stored` marks words `track "mic"|"tab"|"main"`; `resplit` keeps `track == "mic"` as ME.
- `store.py`: `<data>/<id>/transcript.json`, `audio.ogg`, `incoming/`, `index.db` (sqlite + fts5 `search`). `COLUMNS` (:18) `id,title,source,created,duration,status,stage,progress,error,language,speakers_status,job,touched`; `LIST_COLUMNS` without job. `create`, `update`, `row`, `list(q)`, `transcript`, `save(id,t)` (atomic, re-indexes title + utterance texts), `delete(id)` (rmtree of the folder).
- transcript.json: `id,title,source,created,duration,language,speakers{key:{name}},utterances[{speaker,start,end,text,edited?,w?}],words[{start,end,word,track}],audio,speakersStatus`. `GET /transcripts/{id}` → `{row, transcript: public(t,id)}`; `public()` (:531) returns any extra top-level key. `PATCH /transcripts/{id}` (:551): `title`, `speakers`, `utterances`; unknown keys ignored; saves the whole dict.
- `export.py`: `FORMATS` txt|md|srt|vtt|docx|json; `SOURCES = {"meet":"Meeting","file":"File","mic":"Microphone","note":"Note"}` (:13); `to_md`, `to_txt`, `to_docx`, `meta_line`. `notes.py write_transcript(t, kb_dir, sub)` → frontmatter + `export.to_md(t)`.
- `auth.py`: a caller with `Origin` is the extension (limited routes); Electron calls go through main with `x-krya-token`, no limits.
- Tests: `engine/tests/` (test_extension.py, test_merge.py, test_store.py, test_notes.py…). `engine/.venv` does NOT exist on this Mac; `uv` at `~/.local/bin/uv`: `uv sync --project engine --group dev` first, then `npm run test:engine`.

## Electron main
- Pages call the engine through `window.tutorHost.call({call:'speech', method, route, body})` → `ipcMain.handle('host-call')` → `callAllowed(page, request)` (`src/bridge.ts:117`) → `hostCall` (main.ts:3576) → `speech.call` (`SpeechService.call`, speechservice.ts:254; a `Uint8Array` body goes as octet-stream with 120 s timeout). Returns `{ok,status,data}` / `{ok:false,status,error}`. Webview helper `api<T>()` in `src/webview/speech.ts:77`.
- `src/bridge.ts`: `type Page = 'app'|'card'|'tray'|'dictation'|'talk'|'menu'|'other'`, `PAGES` html basename → page, `APP_ONLY`, `TALK_ONLY`, `MENU_ONLY`; `dictation` may call only `/^\/(dictate|recordings)([/?]|$)/`; `micRecording` allowed for app and talk (:90).
- Red dot: `micRecording` (main.ts:309), `recordingNow()` (:3193) `dictation?.state==='recording' || micRecording || !!speech?.meeting`; `refreshTrayIcon`, `tooltip()` `t('tray.tipRecording')`. `SpeechHost.meeting` polls only when the extension said hello.
- Hidden window precedent: `src/dictation.ts:388-445` — `show:false, frame:false, focusable:false, skipTaskbar:true, transparent:true`, `webPreferences:{preload, contextIsolation:true, sandbox:true, nodeIntegration:false, spellcheck:false, backgroundThrottling:false}`, `loadFile(page, {query: pageQuery()})`, `setWindowOpenHandler(deny)`, will-navigate prevented, console-message / render-process-gone logged. Page HTML: `media/dictation.html` CSP `default-src 'none'; script-src 'self'; style-src 'self'; font-src 'self';`.
- No `setDisplayMediaRequestHandler`, `desktopCapturer`, `powerMonitor`, `systemPreferences` permission code exists. Quit: `before-quit` (:3847) sets `quitting`, `will-quit` (:3855) disposes. No quit confirmation.
- `electron-builder.yml` mac `extendInfo`: `LSUIElement`, `NSAppleEventsUsageDescription`, `NSMicrophoneUsageDescription: "Kryakl listens when you dictate."`. No screen-capture description.

## A new key `meetingKey` (precedent `noteKey`, `talkKey`)
1. `src/settings.ts`: field in `Settings`, `DEFAULTS` `''`, parser `key(r.meetingKey, DEFAULTS.meetingKey)`.
2. `src/main.ts`: `DICTATION_KEYS` (:213, registered once the engine is installed); `registerShortcuts` (:2905) `speechKeysOk` entries (also the paused one, :2925) and the `taken` list; `SpeechView.keysOk` in protocol.ts:206; `applyKeyboard` (:2990) blanking list; keyboard-thread `hotkey: action =>` (:3735).
3. `src/typist.ts` `KeyAction`; `src/keyboard.ts:121-137` key list (on a Mac the thread does not run: only `globalShortcut`).
4. `src/webview/app.ts`: `KeyName` (:1215), `KEY_USE` (:1241), `keyRow(...)` on its page (precedent :2203), optional `HOME_KEYS` (:328).
5. Tray: `TrayCommand` (protocol.ts:347), row in `src/webview/tray.ts` via `command(id, icon, label, run, hotkey)`, `TrayView.keys`, `trayView()` (main.ts:3144), `case` in the tray command switch (main.ts ~3394).
6. Tests enumerating keys: `src/settings.test.ts`, `src/hotkey.test.ts`, `src/menu.test.ts`.

## Transcripts UI (`src/webview/transcripts.ts`)
- Types in `src/webview/speech.ts:14-50`: `Source = 'file'|'mic'|'meet'|'note'`, `Row`, `Utterance`, `Transcript`. `SOURCES` (transcripts.ts:44) source → `{label, icon}`.
- `list()` (:305) rows `.ti` with icon, title, `meta(r)` (date · length · source), snippet, `statusChip(r)`; `loadRows()` → `GET /transcripts?q=`.
- `transcriptPage` (:413): editable title (PATCH on blur), `actions(tr)` (:543: copy, export via `exportTranscript`, to-kb, delete), notices, `speakersStrip` (:701), utterances, `player`; `seek(at)` (:846). `progressCard` while not done (polls ~1.5 s). `openTranscript(id)` exported.
- `startMic` (:189) uses `ChunkRecorder` (`src/webview/recorder.ts:109`, single track `main`, RETRIES 3, 600 ms steps); `micTrouble(error)` maps getUserMedia errors to `mic.denied|mic.none|mic.busy`.
- Page `'recordings'` = `recordingsPage(v)` (app.ts:2512): tiles, `grp(t('transcribe.new'))` + `newRows(v)`, `meetCard(v)`, `speakersCard(v)`. `SubId` (:771), `SUBS` (:871).

## Local model
- `src/llama.ts LlamaServer`: `run(target, (base, loaded) => …)`, `warm`, `apiKey` (Bearer). Args `-c 8192 -np 4 --kv-unified`: one request may use ~8192 tokens of prompt + output.
- `src/llmfiles.ts createLlmFiles`: `state(model) {status:'absent'|'downloading'|'ready'|'failed', progress, size}`, `prepare`, `target(model)` (throws when missing), `mapLimit(items, limit, work)`. `settings.model`: `'accurate'|'most'`.
- Request pattern (`src/dictedit.ts:145-173`, `src/checker.ts:55-85`): `fetch(`${base}/v1/chat/completions`, {headers:{authorization:`Bearer ${files.server.apiKey}`}, body:{messages, temperature:0, max_tokens, chat_template_kwargs:{enable_thinking:false}, response_format:{type:'json_schema', json_schema:{name, schema}}}, signal})`; factories `{files, model: () => LlmModel, fetch?, onTimed?}`.
- "Model not downloaded" UI: `talkNotice(v)` (app.ts:1950) with `v.models[model]`, button `post({type:'useModel', model})`, `bar(progress)`, `speechSize(size)`.

## i18n, report, Mac, commands
- `src/i18n/en.ts` keys `<area>.<name>` (`tr.*` transcripts, `tray.*`, `keys.use*`, `menu.*`, `mic.*`); `uk.ts`/`ru.ts` are `Record<Key, Phrase>` — a missing key fails typecheck; plurals `{one, few, many, other}` in uk/ru.
- `src/report.ts` zips only report.txt, kryakl/speech/translate logs and device.json — never log transcript or summary text.
- Mac branches: `process.platform === 'darwin'` in main.ts, speech.ts, keyboard.ts (no keyboard thread), llmfiles.ts (Metal build), hotkey.ts/i18n (`onMac`).
- Commands: `npm run typecheck`, `npm test` (vitest), `npm run build` (esbuild.mjs: add a browser bundle as `{...card, entryPoints:['src/webview/X.ts'], outfile:'media/X.js'}` and push into `all`), `npm run test:engine`. Run Electron with `ELECTRON_RUN_AS_NODE` unset.
