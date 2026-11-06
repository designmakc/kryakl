# F1 — Исправления по ревью ветки

**Требования:** R44, R38, R32
**Зависит от:** —
**Зона:** `src/report.ts` · `src/report.test.ts` · `engine/store.py` · `engine/app.py` · `engine/tests/` · `src/webview/transcripts.ts` · `src/summary.ts` · `src/summary.test.ts` · `src/keyboard.ts` · `src/main.ts` · `src/webview/app.ts` · `src/i18n/*`
**Волна:** 3
**Ревью:** да — ремонт ветки
**Модель:** сильная

## Что должно заработать

Своя инструкция для итога не попадает в отчёт о проблеме; в библиотеке видно, из какой программы созвон; итог очень длинной встречи не падает на сборке частей; режим «держу клавишу» на Mac без «Универсального доступа» не делает клавиши диктовки мёртвыми.

## Из брифа, дословно

> «Отчёт о проблеме не включает записи, расшифровки и итоги (правило уже есть)»
> «Записи в «Записях и встречах»: название, дата, длительность, источник (Zoom, весь звук…)»
> «Длинные встречи — частями (map-reduce …), чтобы влезать в контекст модели»
> «добавь возможность включить Диктовка: держишь клавишу, говоришь, отпускаешь» (пользователь, 2026-11-06)

## Критерии приёмки

- [ ] src/report.ts:71-73 · `settingsSummary` hides `talkAbout` and `dictateEditOwn`, but the new `callOwn` goes into report.txt word for word. `callOwn` is written as "N characters, not shown", as `dictateEditOwn` is, and src/report.test.ts gets a case for it.
- [ ] engine/store.py:19 with src/webview/transcripts.ts:121 · library rows carry no `app`, so the source says «Весь звук» even when the call was Zoom. Rows of `GET /transcripts` carry `app` (stored column or from the job, migration on an old index.db), the library shows it; engine test.
- [ ] src/summary.ts:251-258 · the join step sends every part's JSON in one request with nothing capping its size; with 9+ parts it overflows `-c 8192`. The join is done in groups (join groups of parts, then join those) so each request stays under a set character budget; test with 12 parts.
- [ ] src/keyboard.ts:150 with src/main.ts:2975 · with hold-to-talk on, the dictation keys are never given to Electron; on a Mac without Accessibility (the keyboard thread not running) they do nothing while `keysOk` says they work. When the keyboard thread cannot see keys, those keys fall back to Electron's toggle (as with hold off), and the Voice typing page's hold line says the hold needs Accessibility (en/uk/ru).
