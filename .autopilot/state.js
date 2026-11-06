window.STATE =
{
  "version": 2,
  "slug": "meetings-recording",
  "dir": "2026-11-06-meetings-recording--wip",
  "title": "Запись и итоги созвонов из любой программы",
  "mode": "semi",
  "depth": "normal",
  "tier": "T2",
  "briefFile": "2026-11-06-brief.md",
  "memoryFile": "CLAUDE.md",
  "memoryOwner": "user",
  "skillDir": "/Users/mykola/.claude/skills/autopilot",
  "baseCommit": null,
  "startedAt": "2026-11-06T10:50:40+02:00",
  "updatedAt": "2026-11-06T11:07:00+02:00",
  "finishedAt": null,
  "stages": [
    {
      "id": "preflight",
      "status": "done",
      "startedAt": "2026-11-06T10:50:40+02:00",
      "finishedAt": "2026-11-06T10:50:45+02:00"
    },
    {
      "id": "manifest",
      "status": "done",
      "startedAt": "2026-11-06T10:50:45+02:00",
      "finishedAt": "2026-11-06T10:51:17+02:00"
    },
    {
      "id": "briefing",
      "status": "done",
      "startedAt": "2026-11-06T10:51:17+02:00",
      "finishedAt": "2026-11-06T10:55:25+02:00"
    },
    {
      "id": "spec",
      "status": "done",
      "startedAt": "2026-11-06T10:55:25+02:00",
      "finishedAt": "2026-11-06T11:05:59+02:00"
    },
    {
      "id": "plan",
      "status": "active",
      "startedAt": "2026-11-06T11:05:59+02:00"
    },
    {
      "id": "build",
      "status": "pending"
    },
    {
      "id": "review",
      "status": "pending"
    },
    {
      "id": "final",
      "status": "pending"
    }
  ],
  "requirements": {
    "total": 47,
    "done": 0,
    "inTicket": 41,
    "inSpec": 0,
    "placeholder": 0,
    "deferred": 6,
    "dropped": 0
  },
  "tickets": [
    {
      "id": "01",
      "title": "Движок принимает созвон, хранит итог; ядро итогов",
      "requirements": [
        "R10",
        "R28",
        "R30",
        "R32",
        "R37",
        "R39",
        "R41",
        "R46"
      ],
      "blockedBy": [],
      "wave": 1,
      "zone": [
        "engine/",
        "src/summary.ts",
        "src/summary.test.ts"
      ],
      "review": "да — фундамент",
      "model": "сильная",
      "status": "pending",
      "retries": 0,
      "repairs": 0
    },
    {
      "id": "02",
      "title": "Запись созвона: звук компьютера + микрофон, панель, клавиша, трей",
      "requirements": [
        "R01",
        "R04",
        "R05",
        "R06",
        "R08",
        "R09",
        "R11",
        "R12",
        "R13",
        "R14",
        "R15",
        "R16",
        "R17",
        "R18",
        "R19",
        "R20",
        "R22",
        "R23",
        "R24",
        "R42",
        "R43",
        "R45",
        "R47i"
      ],
      "blockedBy": [],
      "wave": 1,
      "zone": [
        "src/main.ts",
        "src/capture*.ts",
        "src/callapps.ts",
        "src/webview/capture.ts",
        "media/capture.*",
        "src/bridge.ts",
        "src/settings.ts",
        "src/protocol.ts",
        "src/typist.ts",
        "src/keyboard.ts",
        "src/webview/tray.ts",
        "src/webview/app.ts",
        "src/i18n/*",
        "esbuild.mjs",
        "electron-builder.yml"
      ],
      "review": "нет",
      "model": "сильная",
      "status": "pending",
      "retries": 0,
      "repairs": 0
    },
    {
      "id": "03",
      "title": "Итог встречи на странице записи и в библиотеке",
      "requirements": [
        "R26",
        "R27",
        "R29",
        "R30",
        "R31",
        "R33",
        "R34",
        "R36",
        "R38",
        "R40",
        "R42",
        "R44",
        "R47i"
      ],
      "blockedBy": [
        "01",
        "02"
      ],
      "wave": 2,
      "zone": [
        "src/main.ts",
        "src/webview/transcripts.ts",
        "src/webview/speech.ts",
        "src/webview/app.ts",
        "src/settings.ts",
        "src/protocol.ts",
        "src/bridge.ts",
        "src/i18n/*",
        "media/app.css"
      ],
      "review": "нет",
      "model": "обычная",
      "status": "pending",
      "retries": 0,
      "repairs": 0
    }
  ],
  "tests": null,
  "debt": {
    "placeholders": [],
    "assumptions": [],
    "emptyEnv": []
  },
  "additions": [],
  "coverage": {
    "found": 9,
    "fixed": 9,
    "deferred": 0,
    "items": []
  },
  "concerns": [],
  "blind": null,
  "beats": [
    "2026-11-06T10:50:40+02:00",
    "2026-11-06T10:50:45+02:00",
    "2026-11-06T10:50:54+02:00",
    "2026-11-06T10:51:17+02:00",
    "2026-11-06T10:51:44+02:00",
    "2026-11-06T10:55:25+02:00",
    "2026-11-06T11:05:55+02:00",
    "2026-11-06T11:05:59+02:00",
    "2026-11-06T11:07:00+02:00"
  ],
  "rev": 13,
  "waiting": null,
  "waits": [
    {
      "kind": "briefing",
      "from": "2026-11-06T10:51:44+02:00",
      "to": "2026-11-06T10:55:25+02:00"
    }
  ],
  "log": [
    {
      "t": "2026-11-06T10:50:40+02:00",
      "k": "init"
    },
    {
      "t": "2026-11-06T10:50:45+02:00",
      "k": "stage",
      "id": "manifest",
      "act": "start"
    },
    {
      "t": "2026-11-06T10:51:17+02:00",
      "k": "stage",
      "id": "briefing",
      "act": "start"
    },
    {
      "t": "2026-11-06T10:51:44+02:00",
      "k": "ask",
      "kind": "briefing",
      "note": "один вопрос — запись одной программы на Mac и Windows"
    },
    {
      "t": "2026-11-06T10:55:25+02:00",
      "k": "answered",
      "kind": "briefing"
    },
    {
      "t": "2026-11-06T10:55:25+02:00",
      "k": "gate",
      "g": "G1",
      "ok": false,
      "open": 41,
      "total": 47
    },
    {
      "t": "2026-11-06T10:55:25+02:00",
      "k": "stage",
      "id": "spec",
      "act": "start"
    },
    {
      "t": "2026-11-06T11:05:55+02:00",
      "k": "gate",
      "g": "G2",
      "ok": true,
      "found": 9,
      "fixed": 9,
      "deferred": 0
    },
    {
      "t": "2026-11-06T11:05:59+02:00",
      "k": "stage",
      "id": "plan",
      "act": "start"
    },
    {
      "t": "2026-11-06T11:07:00+02:00",
      "k": "tier",
      "v": "T2"
    },
    {
      "t": "2026-11-06T11:07:00+02:00",
      "k": "tickets",
      "n": 3
    },
    {
      "t": "2026-11-06T11:07:00+02:00",
      "k": "gate",
      "g": "G3",
      "ok": true,
      "problems": 0
    }
  ],
  "reqList": [
    {
      "id": "R01",
      "text": "«R1.1 Два источника одновременно: микрофон (дорожка mic, «Я») и звук компьютера (дорожка system, «Собеседники»)»",
      "status": "in-ticket"
    },
    {
      "id": "R02",
      "text": "«R1.2 Выбор источника звука компьютера: «Весь звук компьютера» (по умолчанию) или одна программа из списка запущенных»",
      "status": "deferred",
      "why": "пользователь: «Везде только весь звук», выбор программы — в следующей версии"
    },
    {
      "id": "R03",
      "text": "«Список — с иконками, как в выборе окна для показа экрана»",
      "status": "deferred",
      "why": "пользователь: «Везде только весь звук», выбор программы — в следующей версии"
    },
    {
      "id": "R04",
      "text": "«R1.3 macOS (13+): ScreenCaptureKit через Electron — session.setDisplayMediaRequestHandler с audio: 'loopback', видео отбрасывается»",
      "status": "in-ticket"
    },
    {
      "id": "R05",
      "text": "«при первом запуске объяснить зачем и открыть нужный раздел Системных настроек. Без разрешения — понятная ошибка, а не тишина»",
      "status": "in-ticket"
    },
    {
      "id": "R06",
      "text": "«R1.4 Windows: WASAPI loopback — тот же setDisplayMediaRequestHandler с audio: 'loopback'»",
      "status": "in-ticket"
    },
    {
      "id": "R07",
      "text": "«Отдельная программа (не весь звук) — process loopback (Windows 10 2004+); если недоступно — только «весь звук»»",
      "status": "deferred",
      "why": "пользователь: «Везде только весь звук», выбор программы — в следующей версии"
    },
    {
      "id": "R08",
      "text": "«R1.5 Запись в скрытом окне (как offscreen.js): MediaRecorder по каждой дорожке, куски по 10 с, Opus/WebM — отправка в движок существующим протоколом»",
      "status": "in-ticket"
    },
    {
      "id": "R09",
      "text": "«Пропавший кусок не роняет запись, а считается (lost) и показывается в итоге»",
      "status": "in-ticket"
    },
    {
      "id": "R10",
      "text": "«R1.6 … дубли убирает сведение дорожек (merge.meeting уже приоритизирует дорожку собеседников) — проверить на реальной записи»",
      "status": "in-ticket"
    },
    {
      "id": "R11",
      "text": "«R1.7 Тишина в дорожке system дольше 60 с в начале → подсказка «Не слышу собеседников: проверьте источник звука»»",
      "status": "in-ticket"
    },
    {
      "id": "R12",
      "text": "«R2.1 … клавиша «Записать созвон» (задаётся в Настройки › Клавиши, по умолчанию не задана)»",
      "status": "in-ticket"
    },
    {
      "id": "R13",
      "text": "«пункт в меню трея»",
      "status": "in-ticket"
    },
    {
      "id": "R14",
      "text": "«кнопка на странице «Записи и встречи»»",
      "status": "in-ticket"
    },
    {
      "id": "R15",
      "text": "«R2.2 Во время записи: красная точка в трее»",
      "status": "in-ticket"
    },
    {
      "id": "R16",
      "text": "«таймер и кнопки «Пауза» и «Стоп» в маленькой панели (как панель диктовки); панель можно скрыть»",
      "status": "in-ticket"
    },
    {
      "id": "R17",
      "text": "«R2.3 Название записи: по умолчанию «Созвон <дата время>», если известно — имя программы («Zoom · 6 ноября 14:30»); переименовать можно и потом»",
      "status": "in-ticket"
    },
    {
      "id": "R18",
      "text": "«R2.4 Запись продолжается при закрытом окне Крякла»",
      "status": "in-ticket"
    },
    {
      "id": "R19",
      "text": "«выход из Крякла во время записи спрашивает «Остановить и сохранить?»»",
      "status": "in-ticket"
    },
    {
      "id": "R20",
      "text": "«R2.5 Сон компьютера или выход программы-источника — запись сохраняется с тем, что успели, без потерь»",
      "status": "in-ticket"
    },
    {
      "id": "R21",
      "text": "«R2.6 (позже, не в v1) Автоподсказка … предлагает записать»",
      "status": "deferred",
      "why": "ТЗ: «позже, не в v1»"
    },
    {
      "id": "R22",
      "text": "«R3.1 После остановки — существующая очередь: этапы, позиция, оставшееся время»",
      "status": "in-ticket"
    },
    {
      "id": "R23",
      "text": "«R3.2 Говорящие: «Я» из дорожки микрофона; собеседники — «Говорящий 1, 2…» через pyannote … переименование говорящего меняет его во всём тексте»",
      "status": "in-ticket"
    },
    {
      "id": "R24",
      "text": "«R3.3 Язык — тот, на котором говорили (определяется сам), смешанный язык допустим»",
      "status": "in-ticket"
    },
    {
      "id": "R25",
      "text": "«R3.4 (v2) Живая расшифровка во время звонка … В v1 не делаем»",
      "status": "deferred",
      "why": "ТЗ: «В v1 не делаем»"
    },
    {
      "id": "R26",
      "text": "«R4.1 После расшифровки — кнопка «Сделать итог»»",
      "status": "in-ticket"
    },
    {
      "id": "R27",
      "text": "«настройка «Делать итог сразу» (по умолчанию включена, если модель уже скачана)»",
      "status": "in-ticket"
    },
    {
      "id": "R28",
      "text": "«R4.2 … Коротко — 3–5 предложений; Решения; Задачи — кто, что, срок (если прозвучал); Открытые вопросы»",
      "status": "in-ticket"
    },
    {
      "id": "R29",
      "text": "«Главные темы с отметкой времени — щелчок переносит в расшифровку»",
      "status": "in-ticket"
    },
    {
      "id": "R30",
      "text": "«R4.3 Шаблоны: «Общий», «Планёрка», «Интервью», «Лекция/вебинар» + свой текст-инструкция»",
      "status": "in-ticket"
    },
    {
      "id": "R31",
      "text": "«R4.4 Язык итога — язык встречи; переключатель «на моём языке»»",
      "status": "in-ticket"
    },
    {
      "id": "R32",
      "text": "«R4.5 Модель: локальная Gemma через существующий llama-server. Длинные встречи — частями (map-reduce …)»",
      "status": "in-ticket"
    },
    {
      "id": "R33",
      "text": "«Время ожидания показывается»",
      "status": "in-ticket"
    },
    {
      "id": "R34",
      "text": "«R4.6 Нет скачанной модели → предложить скачать (с размером)»",
      "status": "in-ticket"
    },
    {
      "id": "R35",
      "text": "«Облачные модели (OpenAI/Claude/Groq, как в Meetily) — не в v1»",
      "status": "deferred",
      "why": "ТЗ: «не в v1»"
    },
    {
      "id": "R36",
      "text": "«R4.7 Итог можно поправить руками, пересоздать (с другим шаблоном) и скопировать»",
      "status": "in-ticket"
    },
    {
      "id": "R37",
      "text": "«R4.8 … модели запрещено придумывать имена, сроки и цифры, которых не было; задача без срока — без срока»",
      "status": "in-ticket"
    },
    {
      "id": "R38",
      "text": "«R5.1 Записи в «Записях и встречах»: название, дата, длительность, источник (Zoom, весь звук…), статус, есть ли итог; поиск по тексту»",
      "status": "in-ticket"
    },
    {
      "id": "R39",
      "text": "«R5.2 Экспорт: Markdown (итог + расшифровка), DOCX (уже есть export.py), TXT; «В базу знаний» … итог сверху»",
      "status": "in-ticket"
    },
    {
      "id": "R40",
      "text": "«R5.3 Прослушать место расшифровки — существующая сжатая копия»",
      "status": "in-ticket"
    },
    {
      "id": "R41",
      "text": "«R5.4 Удаление записи удаляет звук, текст и итог»",
      "status": "in-ticket"
    },
    {
      "id": "R42",
      "text": "«R6.1 Всё локально; в сеть — только загрузка моделей»",
      "status": "in-ticket"
    },
    {
      "id": "R43",
      "text": "«R6.2 При первой записи — одноразовое напоминание: «Во многих странах нужно согласие собеседников на запись»»",
      "status": "in-ticket"
    },
    {
      "id": "R44",
      "text": "«R6.3 Отчёт о проблеме не включает записи, расшифровки и итоги»",
      "status": "in-ticket"
    },
    {
      "id": "R45",
      "text": "«Системы: Windows и macOS»",
      "status": "in-ticket"
    },
    {
      "id": "R46",
      "text": "«source: 'system' и имя программы в POST /recordings; дорожка system наравне с tab в merge.meeting»",
      "status": "in-ticket"
    },
    {
      "id": "R47i",
      "text": "(подразумевается) новые фразы интерфейса — на трёх языках (правило проекта i18n)",
      "status": "in-ticket"
    }
  ],
  "gates": {
    "G1": {
      "ok": false,
      "at": "2026-11-06T10:55:25+02:00",
      "open": 41,
      "total": 47
    },
    "G2": {
      "ok": true,
      "at": "2026-11-06T11:05:55+02:00",
      "found": 9,
      "fixed": 9,
      "deferred": 0
    },
    "G3": {
      "ok": true,
      "at": "2026-11-06T11:07:00+02:00",
      "problems": 0
    }
  },
  "result": null
}
