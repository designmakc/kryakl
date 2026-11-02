// The app window, Krya's back office. A sidebar holds every place in groups
// (Home; the actions; the library; the person's lists; Krya itself), the
// open one lit, and a search over every line of every page. The bar over the
// content says where the person is (a second-level page as a crumb), carries
// the action's keys, Back, and the window's buttons. Home comes first, always:
// one line that shows what Krya does (on the first opening it plays as a
// moment: a word typed in the wrong layout is fixed, translated and read
// aloud, each step lighting the person's own key; then the line rises into
// Home's head and the keys drop into their actions), whether the translator
// and the voice are here, and the actions with their keys. Back and Esc go
// back through the places visited, as a browser does (from a transcript, to
// the library first). Everything shown comes from the main process in one
// `app` message, sent again whenever any of it changes; every change goes back
// as a message.

import { NATURAL_PREFIX, NATURAL_VOICES, naturalLabel } from '../natural'
import { DOUBLE_MS, HotkeyRecorder, hotkeyLabel, type Recorded } from '../hotkey'
import type { AppTab, AppView, DiffPart, Feature, KeyboardLayout, MistakeEntry, SavedWord, Settings, StorageId, StoragePart, StorageView, ToView, TutorHost } from '../protocol'
import { LANGUAGES } from '../languages'
import { translationAdvice, type LevelFit } from '../hardware'
import { DEFAULTS, keptForm, myLanguages, RATES, SWITCH_SOUNDS, TALK_ABOUT_MAX, TALK_LEVELS, type AppRule, type LlmModel, type TalkLevel, type ThemeMode, type TranslationLevel } from '../settings'
import type { AppPart } from '../typist'
// app.ts has a languageName of its own (a code's English name); the interface's is langName here.
import { formatDate, languageName as langName, levelName, setUiLanguage, t, uiLanguage, type Key } from '../i18n'
import { parseEntry } from '../vocabulary'
import { changesOf, wordDiff } from '../worddiff'
import { logo, tile } from './brand'
import { el, icon, setIcon } from './dom'
import { glyph } from './glyphs'
import { caps, COPY_TWICE } from './keycaps'
import { lucide, type LucideName } from './lucide'
import { aside, bad, bar, btn, card, chip, grp, ib, link, linkBtn, listPage, liveField, navCard, post, row, seg, select, radioRow, recommended, toggle, toggleCard, toggleKnob, uiLanguageCard, warn } from './ui'
import { minutes, seconds } from '../speechplan'
import { recommend, recommendedModels } from '../setup'
import { resetSetup, setupNodes } from './setup'
import { aboutOf, api, computerRows, diarizationOf, engineRows, engineSettings, fault, forgetEngine, gpuRow, hasPart, installed, onRedraw, pickKb, preferRow, running, saveEngine, size as speechSize, speakerRows, speechChoiceRows, testOffer, toast } from './speech'
import { TOPICS } from '../topics'
import { withMarks } from './marks'
import { backToList, enterTranscripts, leaveTranscripts, newRows, openTranscript, setTranscriptHooks, transcriptsBody, transcriptsCap } from './transcripts'

declare global {
  interface Window {
    tutorHost: TutorHost
  }
}

const save = (patch: Partial<Settings>) => post({ type: 'saveSettings', patch })
/** Where new versions are: downloaded by hand, nothing installs itself (main.ts LINKS has it). */
const RELEASES = 'https://github.com/ikstro/krya/releases'
/** Where a problem report goes by email (report.ts writes to it). */
const REPORT_EMAIL = 'ikstro.design@gmail.com'

/**
 * Phrases read each time they are used, so a constant table follows the
 * language a page is drawn in (the search draws every page in English too, linesOf).
 */
function phrases<K extends string>(keys: Record<K, Key>): Record<K, string> {
  const out = {} as Record<K, string>
  for (const k of Object.keys(keys) as K[]) Object.defineProperty(out, k, { get: () => t(keys[k]), enumerable: true })
  return out
}

type Action = 'talk' | 'listen' | 'translate' | 'check' | 'screen' | 'dictate' | 'transcribe' | 'keyboard'
type Page = Action | 'words' | 'mistakes' | 'transcripts' | 'translations' | 'phrases' | 'vocabulary' | 'kept' | 'learned' | 'programs' | 'layouts' | 'settings' | 'models' | 'storage' | 'about' | 'report' | 'search'

const ACTIONS: readonly Action[] = ['talk', 'listen', 'translate', 'check', 'screen', 'dictate', 'transcribe', 'keyboard']
const isAction = (name: Page): name is Action => (ACTIONS as readonly string[]).includes(name)
/** Each action's icon, on its Home card and its page. */
const ICONS: Record<Action, LucideName> = { talk: 'bird', listen: 'volume-2', translate: 'languages', check: 'graduation-cap', screen: 'scan', dictate: 'mic', transcribe: 'audio-lines', keyboard: 'keyboard' }
const TITLES: Record<Page, string> = phrases({
  talk: 'nav.talk',
  listen: 'nav.listen',
  translate: 'nav.translate',
  check: 'nav.check',
  screen: 'nav.screen',
  dictate: 'nav.dictate',
  transcribe: 'nav.transcribe',
  keyboard: 'nav.keyboard',
  words: 'nav.words',
  mistakes: 'nav.mistakes',
  transcripts: 'nav.transcripts',
  translations: 'nav.translations',
  phrases: 'nav.phrases',
  vocabulary: 'nav.vocabulary',
  kept: 'nav.kept',
  learned: 'nav.learned',
  programs: 'nav.programs',
  layouts: 'nav.layouts',
  settings: 'nav.settings',
  models: 'nav.models',
  storage: 'nav.storage',
  about: 'nav.about',
  report: 'nav.report',
  search: 'nav.search',
})

let view: AppView | undefined
/** A place asked for before the first `app` message. */
let askedTab: AppTab | undefined
/** A transcript asked for before the first `app` message. */
let askedTranscript = ''
let search = ''
/** What is typed in the sidebar's search: the Search page lists every line that has it. */
let finding = ''
/** Why the last key recorded was not kept: by the setting's name, or a layout's id. */
let keyTrouble: { name: string; text: string } | undefined
/** The program whose page is open (Keyboard › Programs › one of them). */
let programOpen = ''
/** The programs with a window open now, asked when the Programs page opens. */
let runningApps: string[] = []

const reduced = matchMedia('(prefers-reduced-motion: reduce)')
// #t= freezes the moment at a time (seconds), for pictures of it, the way the
// design's own frames were made.
const frozenAt = (name: string) => {
  const m = new RegExp(`(?:^#|&)${name}=([\\d.]+)`).exec(location.hash)
  return m ? parseFloat(m[1] as string) : undefined
}
const FROZEN_T = frozenAt('t')

// ---------------------------------------------------------------- motion

const clamp = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x)
const prog = (t: number, a: number, b: number) => clamp((t - a) / (b - a))
const lerp = (a: number, b: number, p: number) => a + (b - a) * p
/** A spring with a small overshoot (about 5 %), settled at 1. */
const spring = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : 1 - Math.exp(-8 * x) * (Math.cos(8.5 * x) + (8 / 8.5) * Math.sin(8.5 * x)))
/** A livelier one for the play button (about 12 %). */
const pop = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : 1 - Math.exp(-6.5 * x) * Math.cos(10 * x))

type Box = { x: number; y: number; w: number; h: number }

const root = document.getElementById('root') as HTMLDivElement
/** The column right of the sidebar: the bar, then Home or a page; the moment plays over it. */
const mainCol = el('section', { class: 'main' })

/** Where a node is, in the content column. */
function rel(node: Element): Box {
  const w = mainCol.getBoundingClientRect()
  const b = node.getBoundingClientRect()
  return { x: b.left - w.left, y: b.top - w.top, w: b.width, h: b.height }
}

const fontOf = (node: Element) => parseFloat(getComputedStyle(node).fontSize) || 16

// ---------------------------------------------------------------- keys

/** The person's line for the moment: a word typed in the wrong layout and the same keys in theirs. */
type Sample = { typed: string; fixed: string; from: string; to: string }
const SAMPLES: Record<string, Sample> = {
  Russian: { typed: 'ghbdtn vbh', fixed: 'привет мир', from: 'EN', to: 'RU' },
  Ukrainian: { typed: 'ghbdsn cdsn', fixed: 'привіт світ', from: 'EN', to: 'UK' },
}
// The fix only means something between Latin and Cyrillic layouts; other languages see the Russian line.
const sampleOf = (native: string): Sample => SAMPLES[native] ?? (SAMPLES.Russian as Sample)

/** A hotkey in a sentence: "Ctrl + C twice", "Left Ctrl twice", "Ctrl+Alt+T". */
const said = (hotkey: string) =>
  hotkey === COPY_TWICE ? t('keys.copyTwice') : hotkey.endsWith('*2') ? t('keys.twice', { key: hotkeyLabel(hotkey.slice(0, -2)) }) : hotkeyLabel(hotkey)
/** A modifier alone, tapped (once or twice) rather than pressed with another key. */
const isTap = (hotkey: string) => /^(Left|Right)(Control|Shift|Alt|Super)(\*2)?$/.test(hotkey)
/** How a key is used, in a few words: a modifier alone is tapped, anything else pressed. */
const usage = (hotkey: string) => t(isTap(hotkey) ? 'keys.tap' : 'keys.press', { key: said(hotkey) })

/** The Chrome extension's key for recording a meeting (extension/manifest.json). */
const MEET_KEY = 'Alt+Shift+M'

type KeyLine = { label: string; hotkey: string; chain?: 'listen' | 'translate' | 'fix' }

/** The keys an action shows by its name, the person's own; the chain marks the three the moment lights. */
function keyLines(action: Action, s: Settings): KeyLine[] {
  switch (action) {
    case 'talk':
      return [{ label: t('keys.talk'), hotkey: s.talkKey }]
    case 'listen':
      // One action: its key, else Ctrl+C twice.
      return [{ label: t('keys.selection'), hotkey: s.selectKey || (s.doubleCopy ? COPY_TWICE : ''), chain: 'listen' }]
    case 'translate':
      return [
        { label: t('keys.selection'), hotkey: s.translateKey, chain: 'translate' },
        ...(s.typeKey ? [{ label: t('keys.type'), hotkey: s.typeKey }] : []),
        { label: t('keys.pasteBack'), hotkey: 'Enter' },
      ]
    case 'check':
      return [
        { label: t('keys.selection'), hotkey: s.checkKey },
        ...(s.typeCheckKey ? [{ label: t('keys.type'), hotkey: s.typeCheckKey }] : []),
        { label: t('keys.byVoice'), hotkey: s.practiceKey },
      ]
    case 'screen':
      return [
        { label: t('keys.listen'), hotkey: s.snipKey },
        { label: t('keys.translate'), hotkey: s.textKey },
      ]
    case 'dictate':
      return [
        { label: t('keys.dictate'), hotkey: s.dictateKey },
        { label: t('keys.note'), hotkey: s.noteKey },
      ]
    case 'transcribe':
      return [{ label: t('keys.inMeet'), hotkey: MEET_KEY }]
    case 'keyboard':
      return [
        { label: t('keys.switch'), hotkey: s.switchKey },
        { label: t('keys.fix'), hotkey: s.fixKey, chain: 'fix' },
      ]
  }
}

/** An action's keys as caps; `setOnly` leaves out those not set (the bar, where "not set" only crowds the title). */
function keysOf(action: Action, s: Settings, chained = false, setOnly = false): HTMLElement[] {
  return keyLines(action, s)
    .filter(k => !setOnly || k.hotkey)
    .flatMap(k => [el('span', { class: 'kl' }, k.label), caps(k.hotkey, chained ? k.chain : undefined)])
}

/** The layouts the keys go through, in order: those chosen that Windows has, or all of them. */
function cycleOf(v: AppView): KeyboardLayout[] {
  const chosen = v.settings.layouts.map(id => v.layouts.find(l => l.id === id)).filter((l): l is KeyboardLayout => !!l)
  if (chosen.length > 0) return chosen
  // As the keyboard thread goes (typist.ts cycle): the layouts in the person's languages, when two or more are.
  const languages = myLanguages(v.settings)
  const mine = v.layouts.filter(l => languages.includes(l.lang))
  return mine.length >= 2 ? mine : v.layouts
}

/** The natural voice reads: it is here and chosen (Automatic picks it). */
const naturalOn = (v: AppView) => v.natural.status === 'ready' && (v.settings.voice === '' || v.settings.voice.startsWith(NATURAL_PREFIX))
const pairOf = (v: AppView) => t('lang.pairEnglish', { lang: langName(v.settings.native) })

/** What Dictate runs on, and how quick it is here: the speech engine's model, once the engine is here. */
function engineCap(v: AppView): string {
  const p = v.speech.pack
  if (p.status === 'installing' && !installed(v)) return t('home.downloadingPct', { pct: Math.round((p.progress ?? 0) * 100) })
  if (!installed(v)) return t('home.downloadsOnce')
  if (!running(v)) return t('home.speechToText')
  const c = v.speech.plan.dictation.chosen
  return t(c.device === 'cuda' ? 'home.speechOnCard' : 'home.speechOnProcessor')
}

/** What an action is called, what it runs on, and what it does. */
function actionText(action: Action, v: AppView): { title: string; cap: string; desc: string } {
  const title = TITLES[action]
  switch (action) {
    case 'talk':
      return { title, cap: talkCap(v), desc: t('home.talkDesc') }
    case 'listen':
      return { title, cap: t(naturalOn(v) ? 'home.natural' : 'home.windowsVoice'), desc: t('home.listenDesc') }
    case 'translate':
      return { title, cap: pairOf(v), desc: t('home.translateDesc') }
    case 'check':
      return { title, cap: checkCap(v), desc: t('home.checkDesc') }
    case 'screen':
      return { title, cap: t('home.screenCap'), desc: t('home.screenDesc') }
    case 'dictate':
      return { title, cap: engineCap(v), desc: t('home.dictateDesc', { lang: langName(v.settings.native) }) }
    case 'transcribe':
      return { title, cap: t('home.transcribeCap'), desc: t('home.transcribeDesc') }
    case 'keyboard':
      return {
        title,
        cap: cycleOf(v)
          .map(l => l.short)
          .join(' · '),
        desc: t(v.settings.autoFix ? 'home.keyboardAuto' : 'home.keyboardDesc'),
      }
  }
}

// ---------------------------------------------------------------- skeleton
// The window has no Windows frame: the sidebar's mark and the bar's empty
// parts drag it, and the bar ends in the window's own minimize, maximize and
// close. Every place is in the sidebar, in groups, each once.

/** A place in the sidebar: what it opens, its icon and name, and a quiet value after it (a count). */
type NavItem = { page: Page | 'home'; icon: LucideName; title: string; value?: (v: AppView) => string }

const many = (n: number) => (n ? String(n) : '')

const NAV: { label: string; items: NavItem[] }[] = [
  { label: '', items: [{ page: 'home', icon: 'house', title: t('nav.home') }] },
  { label: t('nav.actions'), items: ACTIONS.map(a => ({ page: a, icon: ICONS[a], title: TITLES[a] })) },
  {
    label: t('nav.library'),
    items: [
      { page: 'words', icon: 'book-open', title: TITLES.words, value: v => many(v.words.length) },
      { page: 'mistakes', icon: 'list-checks', title: TITLES.mistakes, value: v => many(v.mistakes.length) },
      { page: 'transcripts', icon: 'file-text', title: TITLES.transcripts },
      { page: 'translations', icon: 'clock', title: TITLES.translations, value: v => many(v.translations.length) },
      { page: 'phrases', icon: 'message-square-text', title: TITLES.phrases, value: v => many(v.dictation.recent.length) },
    ],
  },
  {
    label: t('nav.lists'),
    items: [
      { page: 'vocabulary', icon: 'spell-check', title: TITLES.vocabulary, value: v => many(v.settings.vocabulary.length) },
      { page: 'kept', icon: 'lock', title: TITLES.kept, value: v => many(v.settings.keepWords.length) },
      { page: 'learned', icon: 'sparkles', title: TITLES.learned, value: v => many(v.learned.alwaysFix.length + v.learned.myWords.length) },
      { page: 'programs', icon: 'monitor', title: TITLES.programs, value: v => many(v.settings.apps.length) },
      { page: 'layouts', icon: 'list-ordered', title: TITLES.layouts, value: v => cycleOf(v).map(l => l.short).join('·') },
    ],
  },
  {
    label: 'Krya',
    items: [
      { page: 'settings', icon: 'settings', title: TITLES.settings },
      { page: 'models', icon: 'boxes', title: TITLES.models },
      { page: 'storage', icon: 'database', title: TITLES.storage, value: v => (v.storage?.parts.length ? speechSize(downloadsMb(v.storage)) : '') },
      { page: 'about', icon: 'info', title: TITLES.about },
      { page: 'report', icon: 'bug', title: TITLES.report },
    ],
  },
]

const findField = el('input', {
  type: 'text',
  placeholder: t('search.placeholder'),
  spellcheck: 'false',
  autocomplete: 'off',
  'aria-label': t('search.placeholder'),
  oninput: () => find(findField.value),
  onkeydown: (event: Event) => {
    const key = (event as KeyboardEvent).key
    if (key === 'Escape') {
      event.preventDefault()
      findField.value = ''
      find('')
      findField.blur()
    } else if (key === 'Enter') {
      event.preventDefault()
      pBody.querySelector<HTMLElement>('.row.found')?.click()
    }
  },
})
const tree = el('nav', { class: 'tree' })
const navValues = new Map<Page | 'home', HTMLElement>()
for (const g of NAV) {
  if (g.label) tree.append(el('div', { class: 'gl' }, g.label))
  for (const i of g.items) {
    const value = el('span', { class: 'v' })
    navValues.set(i.page, value)
    const page = i.page
    tree.append(el('button', { class: 'it', 'data-nav': page, title: i.title, onclick: () => (page === 'home' ? goHome() : go(page)) }, lucide(i.icon), el('span', { class: 'lb' }, i.title), value))
  }
}
const side = el(
  'aside',
  { class: 'side' },
  // The text logo; a narrow sidebar has room for the icon only.
  el('div', { class: 'brand' }, logo(), tile(28)),
  el('label', { class: 'find', title: t('search.title') }, lucide('search', 's'), findField, el('span', { class: 'key' }, 'Ctrl F')),
  tree,
)

const maxButton = el('button', { class: 'icon-btn max', title: t('common.maximize'), 'aria-label': t('common.maximize'), onclick: () => post({ type: 'window', action: 'maximize' }) }, glyph('maximize'))
const winButtons = el(
  'div',
  { class: 'wbtns' },
  el('button', { class: 'icon-btn', title: t('nav.minimize'), 'aria-label': t('nav.minimize'), onclick: () => post({ type: 'window', action: 'minimize' }) }, glyph('minimize')),
  maxButton,
  el('button', { class: 'icon-btn', title: t('common.close'), 'aria-label': t('common.close'), onclick: () => post({ type: 'window', action: 'close' }) }, glyph('close')),
)

/** The window was maximized or put back (by the button, a double click on the bar, Win+↑): the button shows the other way. */
function windowState(maximized: boolean): void {
  const label = t(maximized ? 'common.restore' : 'common.maximize')
  maxButton.replaceChildren(glyph(maximized ? 'restore' : 'maximize'))
  maxButton.title = label
  maxButton.setAttribute('aria-label', label)
  root.classList.toggle('maxed', maximized)
}
// The bar says where the person is: Back, the page's name (a second-level page as a crumb), a few words on it, the action's keys.
const pBack = el('button', { class: 'icon-btn back', title: t('nav.backEsc'), 'aria-label': t('nav.back'), onclick: () => back() }, lucide('arrow-left', 's'))
const pTitle = el('div', { class: 'ptitle' })
const pCap = el('span', { class: 'pcap' })
const pKeys = el('div', { class: 'pkeys' })
// The logo in the bar is for the setup, which has no sidebar.
const barMark = el('div', { class: 'brand bb' }, logo())
const top = el('header', { class: 'top' }, barMark, pBack, pTitle, pCap, el('span', { class: 'gap' }), pKeys, winButtons)
const home = el('main', { class: 'home' })
const pBody = el('div', { class: 'pbody' })

mainCol.append(top, home, pBody)
root.append(side, mainCol)

/** The transcript the engine is making now and how far it has got: the sidebar's live line by Transcripts. */
let making: { id: string; progress: number } | undefined

function updateNav(): void {
  const lit = open?.name ?? 'home'
  for (const b of tree.querySelectorAll<HTMLElement>('.it')) b.classList.toggle('on', b.dataset.nav === lit)
  const v = view
  if (!v) return
  for (const g of NAV) for (const i of g.items) if (i.value) navValues.get(i.page)?.replaceChildren(i.value(v))
  const busy = running(v) ? v.speech.health?.busy : null
  const live = navValues.get('transcripts')
  if (!live) return
  live.classList.toggle('live', !!busy)
  live.title = busy ? t('nav.making') : ''
  live.replaceChildren(...(busy ? [el('span', { class: 'dot' }), making?.id === busy ? `${Math.round(making.progress * 100)}%` : ''] : []))
}

/** While the engine makes a transcript, how far it has got, asked every few seconds while the window is up. */
async function followMaking(): Promise<void> {
  const id = view && running(view) ? view.speech.health?.busy : null
  if (!id) {
    if (making) (making = undefined), updateNav()
    return
  }
  if (document.hidden) return
  try {
    const r = await api<{ row: { status: string; progress: number } }>('GET', `/transcripts/${id}`)
    making = r.row.status === 'done' ? undefined : { id, progress: r.row.progress }
  } catch {
    // the engine is away for a moment; the dot stays
  }
  updateNav()
}
window.setInterval(() => void followMaking(), 3000)

// ---------------------------------------------------------------- home

function readiness(v: AppView): (Node | string)[] {
  const translator = t(
    (
      {
        ready: 'home.translatorReady',
        absent: 'home.translatorAbsent',
        downloading: 'home.translatorDownloading',
        failed: 'home.translatorFailed',
        unsupported: 'home.translatorUnsupported',
      } as const
    )[v.translator],
  )
  const n = v.natural
  const voice: (Node | string)[] =
    n.status === 'downloading'
      ? [el('b', {}, t('home.natural')), ` ${Math.round(n.progress * 100)}%`]
      : n.status === 'failed'
        ? [el('b', {}, t('home.windowsVoice')), ` ${t('home.voiceFailed')}`]
        : [el('b', {}, t(naturalOn(v) ? 'home.natural' : 'home.windowsVoice')), ` ${t('home.voiceReady')}`]
  const sp = v.speech
  const speech: (Node | string)[] = !installed(v)
    ? sp.pack.status === 'installing'
      ? [', ', el('b', {}, t('home.speech')), ` ${Math.round((sp.pack.progress ?? 0) * 100)}%`]
      : []
    : [', ', el('b', {}, t('home.speech')), ` ${t(running(v) ? 'home.speechReady' : sp.service === 'down' ? 'home.speechStopped' : 'home.speechStarting')}`]
  return [el('b', {}, pairOf(v)), ` ${translator}, `, ...voice, ...speech, `. ${t('home.everything')}`]
}

function homeRow(action: Action, v: AppView): HTMLElement {
  const a = actionText(action, v)
  const open = () => go(action)
  return el(
    'li',
    {
      class: 'act',
      'data-page': action,
      role: 'button',
      tabindex: 0,
      onclick: open,
      onkeydown: (event: Event) => {
        const key = (event as KeyboardEvent).key
        if (key === 'Enter' || key === ' ') (event.preventDefault(), open())
      },
    },
    lucide(ICONS[action]),
    el('div', {}, el('div', { class: 'an' }, el('b', {}, a.title), el('i', {}, a.cap)), el('div', { class: 'ad' }, a.desc)),
    el('div', { class: 'keys' }, ...keysOf(action, v.settings, true)),
    lucide('chevron-right', 'chev'),
  )
}

/** Krya is paused: every key and reaction is off until Resume, here or in the tray. */
function pausedNotice(v: AppView): HTMLElement | null {
  if (!v.settings.paused) return null
  return el(
    'div',
    { class: 'row notice paused' },
    lucide('pause'),
    el('div', { class: 'l' }, t('home.paused'), el('small', {}, t('home.pausedNote'))),
    btn(t('tray.resume'), () => save({ paused: false }), 'primary'),
  )
}

function homeNodes(v: AppView): HTMLElement[] {
  const sample = sampleOf(v.settings.native)
  return [
    el(
      'div',
      { class: 'head' },
      el(
        'div',
        { class: 'hline' },
        el('span', { class: 'hs h1' }, sample.typed),
        el('span', { class: 'arr a1' }, '→'),
        el('span', { class: 'hs h2' }, sample.fixed),
        el('span', { class: 'arr a2' }, '→'),
        el('span', { class: 'hs h3' }, 'hello world'),
        el('button', { class: 'replay', title: t('home.replayTitle'), onclick: () => playMoment(false) }, icon('play'), el('span', {}, t('home.replay'))),
      ),
      el('p', { class: 'hcap' }, ...readiness(v)),
    ),
    pausedNotice(v),
    el('ul', { class: 'acts' }, ...ACTIONS.map(a => homeRow(a, v))),
    el('p', { class: 'foot' }, t('home.foot')),
  ].filter((n): n is HTMLElement => n !== null)
}

function renderHome(force = false): void {
  // While the moment plays Home stays as it is; the moment's end draws it.
  if (!view || moment) return
  const next = el('div', {}, ...homeNodes(view))
  if (!force && next.innerHTML === home.innerHTML) return
  home.replaceChildren(...next.childNodes)
}

// ---------------------------------------------------------------- the moment
// One line through fix → translate → listen, on the person's keys; then the
// line travels up into the header and each key drops into its action.

const T_END = 5.7
const TYPE0 = 0.2
const TYPE_STEP = 0.09 // the wrong layout, letter by letter
const FIX = 1.3 // the fix key
const FLIP0 = 1.36
const FLIP_STEP = 0.045
const FLIP_D = 0.3
const TR = [2.12, 2.26] as const // the translate key, twice
const SWAP = 2.32 // the fixed line → English
const LI = [3.02, 3.15] as const // Ctrl C, twice
const WORDS = [
  [3.3, 3.76],
  [3.76, 4.26],
] as const // each word lit while it is said
const TRAVEL = 4.4

type Cell = { c: HTMLElement; a: HTMLElement; b: HTMLElement; wa: number; wb: number }
type Moment = {
  raf: number
  markSeen: boolean
  sample: Sample
  stage: HTMLElement
  cells: Cell[]
  caret: HTMLElement
  badge: HTMLElement
  t1: HTMLElement
  t2: HTMLElement
  line: HTMLElement
  line2: HTMLElement
  w1: HTMLElement
  w2: HTMLElement
  play: HTMLElement
  playIcon: HTMLElement
  eyebrow: HTMLElement
  smalls: HTMLElement[]
  rail: { fix: HTMLElement; translate: HTMLElement; listen: HTMLElement }
  /** Home's own pieces, which the travellers become. */
  h: {
    head: HTMLElement
    h1: HTMLElement
    h2: HTMLElement
    h3: HTMLElement
    arrows: HTMLElement[]
    replay: HTMLElement
    replayLabel: HTMLElement
    hcap: HTMLElement
    foot: HTMLElement
    rows: HTMLElement[]
    kf: HTMLElement
    kt: HTMLElement
    kl: HTMLElement
  }
  g: Record<'t1' | 't2' | 'line' | 'line2' | 'play' | 'h1' | 'h2' | 'h3' | 'replay' | 'rf' | 'rt' | 'rl' | 'kf' | 'kt' | 'kl', Box>
  /** Font sizes: the trail, the big line, the header line. */
  f: { trail: number; big: number; head: number }
}

let moment: Moment | undefined

function buildMoment(v: AppView, markSeen: boolean): Moment | undefined {
  const q = <T extends HTMLElement>(s: string) => home.querySelector<T>(s)
  const head = q('.head'), h1 = q('.h1'), h2 = q('.h2'), h3 = q('.h3'), replay = q('.replay'), hcap = q('.hcap'), foot = q('.foot')
  const kf = q('[data-chain=fix]'), kt = q('[data-chain=translate]'), kl = q('[data-chain=listen]')
  if (!head || !h1 || !h2 || !h3 || !replay || !hcap || !foot || !kf || !kt || !kl) return undefined
  const s = v.settings
  const sample = sampleOf(s.native)
  const cells = [...sample.typed].map((ch, i) => {
    const a = el('span', {}, ch === ' ' ? ' ' : ch)
    const b = el('span', {}, sample.fixed[i] === ' ' ? ' ' : (sample.fixed[i] ?? ''))
    return { c: el('span', { class: 'cell' }, a, b), a, b, wa: 0, wb: 0 }
  })
  const caret = el('span', { class: 'caret' })
  const badge = el('span', { class: 'badge' }, sample.from)
  const line = el('div', { class: 'big' }, ...cells.map(k => k.c), caret, badge)
  const w1 = el('span', { class: 'w' }, 'hello')
  const w2 = el('span', { class: 'w' }, 'world')
  const line2 = el('div', { class: 'big' }, w1, ' ', w2)
  const playIcon = icon('play')
  const play = el('div', { class: 'play' }, playIcon)
  const t1 = el('div', { class: 'trail t1' }, sample.typed)
  const t2 = el('div', { class: 'trail t2' }, sample.fixed)
  const eyebrow = el('div', { class: 'eyebrow' }, t('home.eyebrow'))
  const listenKey = keyLines('listen', s)[0]?.hotkey ?? ''
  const step = (n: number, hotkey: string, what: string) => {
    const keys = caps(hotkey)
    const small = el('small', {}, el('em', {}, String(n)), what)
    return { keys, small, node: el('div', { class: 'step' }, keys, small) }
  }
  const sf = step(1, s.fixKey, t('home.stepFix')), st = step(2, s.translateKey, t('home.stepTranslate')), sl = step(3, listenKey, t('home.stepListen'))
  const rail = el('div', { class: 'rail' }, sf.node, st.node, sl.node)
  const stage = el('div', { class: 'stage' }, eyebrow, t1, t2, line, line2, play, rail)
  // The composition is drawn for a 620 px window; a shorter or taller one keeps it in the middle.
  stage.style.top = `${Math.round(Math.max(-40, Math.min(80, (mainCol.clientHeight - 620) / 2)))}px`
  mainCol.append(stage)

  // Measure everything where it ends, before anything moves.
  for (const k of cells) {
    k.wa = k.a.getBoundingClientRect().width
    k.wb = k.b.getBoundingClientRect().width
  }
  const l2 = rel(line2)
  play.style.left = `${l2.x + l2.w + 18}px`
  play.style.top = `${l2.y - (parseFloat(stage.style.top) || 0) + (l2.h - 40) / 2}px`
  const m: Moment = {
    raf: 0,
    markSeen,
    sample,
    stage,
    cells,
    caret,
    badge,
    t1,
    t2,
    line,
    line2,
    w1,
    w2,
    play,
    playIcon,
    eyebrow,
    smalls: [sf.small, st.small, sl.small],
    rail: { fix: sf.keys, translate: st.keys, listen: sl.keys },
    h: { head, h1, h2, h3, arrows: [...home.querySelectorAll<HTMLElement>('.arr')], replay, replayLabel: replay.querySelector('span') ?? replay, hcap, foot, rows: [...home.querySelectorAll<HTMLElement>('.act')], kf, kt, kl },
    g: {
      t1: rel(t1),
      t2: rel(t2),
      line: rel(line),
      line2: l2,
      play: rel(play),
      h1: rel(h1),
      h2: rel(h2),
      h3: rel(h3),
      replay: rel(replay),
      rf: rel(sf.keys),
      rt: rel(st.keys),
      rl: rel(sl.keys),
      kf: rel(kf),
      kt: rel(kt),
      kl: rel(kl),
    },
    f: { trail: fontOf(t1), big: fontOf(line), head: fontOf(h3) },
  }
  root.classList.add('playing')
  return m
}

const press = (t: number, at: number) => t >= at && t < at + 0.11

function lightKeys(group: HTMLElement, lit: boolean, down: boolean): void {
  for (const k of group.querySelectorAll('.key')) {
    k.classList.toggle('lit', lit)
    k.classList.toggle('down', down)
  }
  group.classList.toggle('lit', lit)
}

function setStyle(node: HTMLElement, opacity: number, transform = ''): void {
  node.style.opacity = String(opacity)
  node.style.transform = transform
}

const shown = (node: HTMLElement, on: boolean) => (node.style.visibility = on ? 'visible' : 'hidden')

/** Moves a node from one box towards another, centre-left to centre-left, scaling it to `s1`. */
function move(node: HTMLElement, from: Box, to: Box, p: number, s1: number): void {
  const s = lerp(1, s1, p)
  const dx = (to.x - from.x) * p
  const dy = (to.y + to.h / 2 - (from.y + (from.h / 2) * s1)) * p
  node.style.transform = `translate(${dx}px, ${dy}px) scale(${s})`
}

function renderMoment(m: Moment, t: number): void {
  const { g, h, f } = m

  // Typing in the wrong layout; the fix rolls each letter into the right one.
  m.cells.forEach((k, i) => {
    k.c.style.display = t >= TYPE0 + i * TYPE_STEP ? '' : 'none'
    const p = spring(prog(t, FLIP0 + i * FLIP_STEP, FLIP0 + i * FLIP_STEP + FLIP_D))
    k.c.style.width = `${lerp(k.wa, k.wb, clamp(p))}px`
    setStyle(k.a, 1 - clamp(p * 2.2), `translateY(${-p * 26}px)`)
    setStyle(k.b, clamp((p - 0.25) * 1.6), `translateY(${(1 - p) * 26}px)`)
  })
  const typing = t >= TYPE0 && t < TYPE0 + m.cells.length * TYPE_STEP + 0.05
  m.caret.style.opacity = t < SWAP && (typing || Math.floor(t * 2.4) % 2 === 0) ? '1' : '0'
  // The layout badge rides the caret: the wrong layout while typing, the right one once fixed.
  const out = prog(t, SWAP - 0.1, SWAP + 0.1)
  m.badge.textContent = t < FIX + 0.25 ? m.sample.from : m.sample.to
  const pulse = t >= FIX + 0.25 ? 1 + 0.18 * Math.sin(Math.PI * prog(t, FIX + 0.25, FIX + 0.5)) : 1
  setStyle(m.badge, 1 - out, `scale(${pulse * (1 - out)})`)

  // Each earlier form lifts out of the line into the trail above it.
  const big = f.big / f.trail
  const p1 = spring(prog(t, FIX + 0.04, FIX + 0.8))
  move(m.t1, g.t1, g.line, 1 - p1, big)
  m.t1.style.opacity = t < FIX + 0.04 ? '0' : String(clamp(p1 * 2.2))
  const p2 = spring(prog(t, SWAP, SWAP + 0.75))
  move(m.t2, g.t2, g.line, 1 - p2, big)
  m.t2.style.opacity = t < SWAP ? '0' : '1'

  // The fixed line lifts as the trail's copy, and the English comes up in its place.
  m.line.style.opacity = t < SWAP ? '1' : '0'
  const inn = spring(prog(t, SWAP + 0.14, SWAP + 0.8))
  setStyle(m.line2, clamp(inn * 2), `translateY(${(1 - inn) * 34}px)`)

  // Listen: play turns into stop in place; each word lights while it is said.
  const speaking = t >= WORDS[0][0] && t < WORDS[1][1]
  m.w1.classList.toggle('on', t >= WORDS[0][0] && t < WORDS[0][1])
  m.w2.classList.toggle('on', t >= WORDS[1][0] && t < WORDS[1][1])
  setIcon(m.playIcon, speaking ? 'primitive-square' : 'play')
  m.play.classList.toggle('speaking', speaking)

  // The keys under the line light as their step runs.
  lightKeys(m.rail.fix, t >= FIX && t < SWAP, press(t, FIX))
  lightKeys(m.rail.translate, t >= TR[0] && t < LI[0], press(t, TR[0]) || press(t, TR[1]))
  lightKeys(m.rail.listen, t >= LI[0] && t < WORDS[1][1] + 0.1, press(t, LI[0]) || press(t, LI[1]))

  // Travel: the line goes up into the header, the keys down to their actions.
  const T = (d: number, dur = 0.8) => spring(prog(t, TRAVEL + d, TRAVEL + d + dur))
  if (t >= TRAVEL) {
    move(m.line2, g.line2, g.h3, T(0), f.head / f.big)
    move(m.t2, g.t2, g.h2, T(0.06), f.head / f.trail)
    move(m.t1, g.t1, g.h1, T(0.12), f.head / f.trail)
    m.t1.style.opacity = '1'
    m.t2.style.opacity = '1'
  }
  // The play button lands as the start of Replay.
  if (t < TRAVEL) setStyle(m.play, t >= LI[0] ? 1 : 0, `scale(${pop(prog(t, LI[0] + 0.02, LI[0] + 0.5))})`)
  else {
    m.play.style.opacity = '1'
    move(m.play, g.play, { x: g.replay.x, y: g.replay.y, w: 28, h: 28 }, T(0.02), 28 / 40)
  }
  const flights: [HTMLElement, Box, Box, number][] = [
    [m.rail.listen, g.rl, g.kl, 0],
    [m.rail.translate, g.rt, g.kt, 0.06],
    [m.rail.fix, g.rf, g.kf, 0.12],
  ]
  for (const [node, from, to, d] of flights) {
    const p = T(0.1 + d)
    node.style.transform = t >= TRAVEL ? `translate(${(to.x - from.x) * p}px, ${(to.y - from.y) * p}px)` : ''
  }
  // The moment's captions give way.
  const fade = 1 - prog(t, TRAVEL, TRAVEL + 0.25)
  m.eyebrow.style.opacity = String(fade)
  for (const s of m.smalls) s.style.opacity = String(fade)

  // Home settles around them.
  h.rows.forEach((row, i) => {
    const p = spring(prog(t, TRAVEL + 0.22 + i * 0.06, TRAVEL + 0.92 + i * 0.06))
    setStyle(row, clamp(p * 1.3), `translateY(${(1 - p) * 14}px)`)
  })
  const hp = spring(prog(t, TRAVEL + 0.45, TRAVEL + 1.0))
  for (const a of h.arrows) setStyle(a, hp, `translateX(${(1 - hp) * -8}px)`)
  setStyle(h.hcap, hp, `translateY(${(1 - hp) * 6}px)`)
  h.head.style.borderBottomColor = `color-mix(in srgb, var(--border-soft) ${hp * 100}%, transparent)`
  h.foot.style.opacity = String(spring(prog(t, TRAVEL + 0.8, TRAVEL + 1.2)))

  // Each traveller gives way to the real thing once it has landed.
  const landed = (d: number) => t >= TRAVEL + d + 0.8
  shown(h.h3, landed(0)), shown(m.line2, !landed(0))
  shown(h.h2, landed(0.06)), shown(m.t2, !landed(0.06))
  shown(h.h1, landed(0.12)), shown(m.t1, !landed(0.12))
  shown(h.kl, landed(0.1)), shown(m.rail.listen, !landed(0.1))
  shown(h.kt, landed(0.16)), shown(m.rail.translate, !landed(0.16))
  shown(h.kf, landed(0.22)), shown(m.rail.fix, !landed(0.22))
  shown(m.play, !landed(0.02))
  // Replay grows out of the landed play button.
  const rp = spring(prog(t, TRAVEL + 0.82, TRAVEL + 1.3))
  shown(h.replay, landed(0.02))
  h.replay.style.width = `${lerp(28, g.replay.w, rp)}px`
  h.replayLabel.style.opacity = String(rp)
}

/** Plays the moment (from `at`, frozen there when it is given). */
function playMoment(markSeen: boolean, at?: number): void {
  if (!view) return
  if (moment) finishMoment()
  closePage()
  const v = view
  void document.fonts.ready.then(() => {
    if (moment) return
    renderHome(true)
    const m = buildMoment(v, markSeen)
    if (!m) return
    moment = m
    // The first frame now, so the settled Home never flashes before the moment.
    renderMoment(m, Math.min(at ?? 0, T_END))
    if (at !== undefined) return
    const t0 = performance.now()
    const tick = (now: number) => {
      const t = (now - t0) / 1000
      if (t >= T_END) return finishMoment()
      renderMoment(m, t)
      m.raf = requestAnimationFrame(tick)
    }
    m.raf = requestAnimationFrame(tick)
  })
}

/** Ends the moment where it ends (also when it is cut short by a click or a key). */
function finishMoment(): void {
  const m = moment
  if (!m) return
  cancelAnimationFrame(m.raf)
  m.stage.remove()
  root.classList.remove('playing')
  moment = undefined
  renderHome(true)
  if (m.markSeen) save({ introSeen: true })
}

// ---------------------------------------------------------------- places
// A place is a page, or a second-level page on it (opened from a card with a
// chevron: the body slides over, the bar's title becomes a crumb). Every move
// is kept, so Back and Esc go back through the places visited, each where it
// was scrolled to, as a browser does.

/** A page of a page: a long part of it, opened from a card with a chevron. */
type SubId = 'meet' | 'speakers' | 'fixing' | 'program' | 'languages' | 'forTranslate' | 'forCheck' | 'forDictate' | 'forTranscribe' | 'forVoice'

type Place = { name: Page; sub?: SubId }

/** The open page and its second-level page; none: Home. */
let open: Place | undefined
/** The places left, each with where it was scrolled to: Back goes to the last. */
const visited: { place: Place | undefined; scroll: number }[] = []

const samePlace = (a: Place | undefined, b: Place | undefined) => a?.name === b?.name && a?.sub === b?.sub
const scroller = () => (open ? pBody : home)

/** Goes to a page, or a second-level page of it; `flash` lights the line with that title once there (a search's find). */
function go(name: Page, sub?: SubId, flash = ''): void {
  if (!view) return
  const next: Place = sub ? { name, sub } : { name }
  if (samePlace(open, next)) return flash ? flashRow(flash) : undefined
  visited.push({ place: open && { ...open }, scroll: scroller().scrollTop })
  if (visited.length > 50) visited.shift()
  show(next, open?.name === name ? (sub ? 1 : -1) : 0)
  if (flash) flashRow(flash)
}

/** Home, kept in the way back like any place. */
function goHome(): void {
  if (!open) return
  visited.push({ place: { ...open }, scroll: pBody.scrollTop })
  show(undefined, 0)
}

/** Home without a step back: the moment, the setup. */
function closePage(): void {
  if (open) show(undefined, 0)
}

/** Back (or Esc): from a transcript to the library, else to the place before. */
function back(): void {
  if (open?.name === 'transcripts' && !open.sub && backToList()) return
  let last = visited.pop()
  while (last && samePlace(last.place, open)) last = visited.pop()
  if (!last) return closePage()
  const from = open
  const dir = last.place && from && last.place.name === from.name ? (from.sub && !last.place.sub ? -1 : 1) : 0
  show(last.place, dir, last.scroll)
  // Back from a second-level page: the card that opened it has the focus again.
  if (dir === -1 && from?.sub) pBody.querySelector<HTMLElement>(`[data-sub="${from.sub}"]`)?.focus({ preventScroll: true })
}

/** Draws a place: Home or the page, the body sliding over (`dir`) on the same page, a short fade to another. */
function show(place: Place | undefined, dir: 1 | -1 | 0, scroll = 0): void {
  if (!view) return
  if (moment) finishMoment()
  const was = open
  if (was?.name === 'transcripts' && place?.name !== 'transcripts') leaveTranscripts()
  open = place
  keyTrouble = undefined
  if (place?.name !== was?.name) search = ''
  // The search's words stay for Back to the results; the field shows them only there.
  findField.value = place?.name === 'search' ? finding : ''
  if (place?.name === 'transcripts' && was?.name !== 'transcripts') enterTranscripts()
  if (place?.name === 'programs' && !place.sub) askRunningApps()
  // Sizes are measured each time the page opens: a download or a removal elsewhere changes them (Models says what nothing uses).
  if ((place?.name === 'storage' || place?.name === 'models') && was?.name !== place.name) post({ type: 'storage' })
  if (place?.name !== 'models') recommending = false
  asking = ''
  root.classList.toggle('page-open', !!place)
  fillHeader()
  updateNav()
  if (!place) {
    renderHome()
    home.scrollTop = scroll
    return fade(home)
  }
  if (dir && was) slideBody(dir)
  else {
    bodyPending = false
    pBody.replaceChildren(...bodyOf(view))
    fade(pBody)
  }
  pBody.scrollTop = scroll
}

/** A place comes in: a short fade up, unless motion is reduced. */
function fade(node: HTMLElement): void {
  if (reduced.matches) return
  node.animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 160, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' })
}

/** A line found by the search, lit for a moment where it is. */
function flashRow(title: string): void {
  const rows = [...pBody.querySelectorAll<HTMLElement>('.row')]
  const row = rows.find(r => lineTitle(r) === title) ?? rows.find(r => lineTitle(r).startsWith(title))
  if (!row) return
  row.scrollIntoView({ block: 'center' })
  row.classList.add('flash')
  window.setTimeout(() => row.classList.remove('flash'), 1600)
}

type Sub = { title: string | (() => string); cap?: (v: AppView) => string; body: (v: AppView) => HTMLElement[]; valid?: (v: AppView) => boolean }

const SUBS: Record<SubId, Sub> = {
  meet: { title: 'Google Meet', cap: () => t('page.meetCap'), body: meetPage },
  speakers: { title: () => t('page.speakers'), cap: () => t('page.speakersCap'), body: speakerRows, valid: installed },
  fixing: { title: () => t('page.fixing'), cap: () => t('page.fixingCap'), body: fixingPage },
  program: { title: () => programOpen, body: programPage, valid: () => !!programOpen },
  languages: { title: () => t('page.languages'), body: languagesPage },
  forTranslate: { title: () => TITLES.translate, cap: () => t('page.forTranslateCap'), body: translateChoicePage },
  forCheck: { title: () => t('page.checkEnglish'), cap: () => t('page.forCheckCap'), body: checkChoicePage },
  forDictate: { title: () => TITLES.dictate, cap: () => t('page.forDictateCap'), body: v => speechChoicePage(v, 'dictation') },
  forTranscribe: { title: () => TITLES.transcribe, cap: () => t('page.forTranscribeCap'), body: v => speechChoicePage(v, 'transcripts') },
  forVoice: { title: () => t('page.voice'), cap: () => t('page.forVoiceCap'), body: voiceChoicePage },
}
const subTitle = (id: SubId) => {
  const title = SUBS[id].title
  return typeof title === 'string' ? title : title()
}

/** A few words by the page's name in the bar. */
const CAPS: Partial<Record<Page, (v: AppView) => string>> = {
  words: v => (v.words.length ? t('page.wordsCap', { n: v.words.length }) : t('page.wordsNone')),
  mistakes: () => t('page.mistakesCap'),
  transcripts: () => transcriptsCap(),
  translations: () => t('page.translationsCap'),
  phrases: () => t('page.phrasesCap'),
  vocabulary: () => t('page.vocabularyCap'),
  kept: () => t('page.keptCap'),
  learned: () => t('page.learnedCap'),
  programs: () => t('page.programsCap'),
  layouts: () => t('page.layoutsCap'),
  models: () => t('page.modelsCap'),
  storage: v => (v.storage?.measuring ? t('page.measuring') : v.storage ? t('page.freeOn', { size: speechSize(v.storage.freeMb), drive: v.storage.drive }) : t('page.storageCap')),
  about: v => `Krya ${v.version}`,
  report: () => t('page.reportCap'),
}

let sliding: Animation[] = []

/** Draws the body again with the old one sliding out of the way: right to left opening (`dir` 1), back when closing. */
function slideBody(dir: 1 | -1): void {
  if (!view || !open) return
  for (const a of sliding) a.finish()
  sliding = []
  const ghost = el('div', { class: 'pbody pghost', inert: true, 'aria-hidden': 'true' })
  const scroll = pBody.scrollTop
  ghost.append(...pBody.childNodes)
  mainCol.append(ghost)
  ghost.scrollTop = scroll
  bodyPending = false
  pBody.replaceChildren(...bodyOf(view))
  if (reduced.matches) return ghost.remove()
  const easing = 'cubic-bezier(0.2, 0.8, 0.2, 1)'
  const duration = 220
  const out = ghost.animate([{ transform: 'none', opacity: 1 }, { transform: `translateX(${-48 * dir}px)`, opacity: 0 }], { duration, easing, fill: 'forwards' })
  const inn = pBody.animate([{ transform: `translateX(${48 * dir}px)`, opacity: 0 }, { transform: 'none', opacity: 1 }], { duration, easing })
  out.onfinish = () => ghost.remove()
  sliding = [out, inn]
}

/** A second-level page of the open page. */
function openSub(id: SubId): void {
  if (open) go(open.name, id)
}

function fillHeader(): void {
  if (!view) return
  const v = view
  pBack.hidden = !open && visited.length === 0
  if (!open) {
    pTitle.replaceChildren(t('nav.home'))
    pCap.textContent = ''
    pKeys.replaceChildren()
    return
  }
  const name = open.name
  if (open.sub) {
    const sub = SUBS[open.sub]
    pTitle.replaceChildren(el('button', { class: 'pcrumb', onclick: () => go(name) }, TITLES[name]), el('span', { class: 'psep' }, '›'), subTitle(open.sub))
    pCap.textContent = sub.cap?.(v) ?? ''
    pKeys.replaceChildren()
    return
  }
  pTitle.replaceChildren(TITLES[name])
  pCap.textContent = isAction(name) ? actionText(name, v).cap : name === 'search' ? searchCap(v) : (CAPS[name]?.(v) ?? '')
  const keys = isAction(name) ? keysOf(name, v.settings, false, true) : []
  const next = el('div', {}, ...keys)
  if (next.innerHTML !== pKeys.innerHTML) pKeys.replaceChildren(...next.childNodes)
}

/** Set when the body changed while it was in use (a key being recorded, a box typed in): drawn once it is let go. */
let bodyPending = false
let pointerDown = false

function busy(): boolean {
  const a = document.activeElement
  return !!a && pBody.contains(a) && (a.matches('input[type=text]:not([data-live]), input[type=search], input[type=password], input[type=range], textarea') || (a as HTMLElement).isContentEditable || a.classList.contains('recording'))
}

/**
 * The fields that keep what was typed across a redraw (`data-live`, the add
 * fields of a list): the ones in use or holding text move into the new body in
 * place of their fresh twins, so an item added shows at once under the field.
 */
function carryFields(next: HTMLElement): (HTMLInputElement | HTMLTextAreaElement)[] {
  const carried: (HTMLInputElement | HTMLTextAreaElement)[] = []
  for (const old of pBody.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input[data-live], textarea[data-live]')) {
    if (!old.value && document.activeElement !== old) continue
    const fresh = next.querySelector(`${old.localName}[data-live="${old.dataset.live}"]`)
    if (!fresh) continue
    fresh.replaceWith(old)
    carried.push(old)
  }
  return carried
}

function renderBody(): void {
  if (!view || !open) return
  if (open.sub && SUBS[open.sub].valid?.(view) === false) {
    open.sub = undefined
    fillHeader()
  }
  const next = el('div', {}, ...bodyOf(view))
  if (next.innerHTML === pBody.innerHTML) return
  if (busy()) {
    bodyPending = true
    return
  }
  bodyPending = false
  const scroll = pBody.scrollTop
  const focused = document.activeElement
  const carried = carryFields(next)
  pBody.replaceChildren(...next.childNodes)
  pBody.scrollTop = scroll
  const live = carried.find(f => f === focused)
  if (live) live.focus({ preventScroll: true })
}

// A redraw waits for the click that took the focus away, so the click lands on what it was aimed at.
pBody.addEventListener('focusout', () => {
  if (!bodyPending) return
  const later = () => window.setTimeout(renderBody, 0)
  if (pointerDown) window.addEventListener('pointerup', later, { once: true })
  else later()
})
window.addEventListener('pointerdown', () => (pointerDown = true), true)
window.addEventListener('pointerup', () => (pointerDown = false), true)

function bodyOf(v: AppView): HTMLElement[] {
  if (!open) return []
  if (open.sub) return SUBS[open.sub].body(v)
  switch (open.name) {
    case 'talk':
      return talkPage(v)
    case 'listen':
      return listenPage(v)
    case 'translate':
      return translatePage(v)
    case 'check':
      return checkPage(v)
    case 'screen':
      return screenPage(v)
    case 'dictate':
      return dictatePage(v)
    case 'transcribe':
      return transcribePage(v)
    case 'keyboard':
      return keyboardPage(v)
    case 'words':
      return wordsPage(v)
    case 'mistakes':
      return mistakesPage(v)
    case 'transcripts':
      return transcriptsBody(v)
    case 'translations':
      return translationsPage(v)
    case 'phrases':
      return recentPage(v)
    case 'vocabulary':
      return vocabularyPage(v)
    case 'kept':
      return keptPage(v)
    case 'learned':
      return learnedPage(v)
    case 'programs':
      return programsPage(v)
    case 'layouts':
      return layoutsPage(v)
    case 'settings':
      return settingsPage(v)
    case 'models':
      return modelsPage(v)
    case 'storage':
      return storagePage(v)
    case 'about':
      return aboutPage(v)
    case 'report':
      return reportPage(v)
    case 'search':
      return searchPage(v)
  }
}

// ---------------------------------------------------------------- search
// Every line of every page that sets something, found by its name or its
// note; a find opens its page with the line lit. The lists of things saved
// (words, transcripts, translations, phrases) have searches of their own.

/** The places the search reads, second-level pages too. */
const SEARCHED: Place[] = [
  ...ACTIONS.map(name => ({ name })),
  { name: 'keyboard', sub: 'fixing' },
  { name: 'transcribe', sub: 'speakers' },
  { name: 'transcribe', sub: 'meet' },
  { name: 'vocabulary' },
  { name: 'kept' },
  { name: 'learned' },
  { name: 'programs' },
  { name: 'layouts' },
  { name: 'settings' },
  { name: 'settings', sub: 'languages' },
  { name: 'models' },
  { name: 'models', sub: 'forTranslate' },
  { name: 'models', sub: 'forCheck' },
  { name: 'models', sub: 'forDictate' },
  { name: 'models', sub: 'forTranscribe' },
  { name: 'models', sub: 'forVoice' },
  { name: 'storage' },
  { name: 'report' },
]

/** A line found by the search; `en` is its title and note in English, so English words find it in any interface language. */
type Line = { place: Place; section: string; title: string; note: string; en: string }

/** A line's name: the first thing in its text. */
const lineTitle = (row: Element) => (row.querySelector(':scope > .l')?.firstChild?.textContent ?? '').trim()

/** A place's body drawn aside, as it would be if it were open. */
function bodyFor(v: AppView, place: Place): HTMLElement[] {
  const was = open
  open = place
  try {
    return bodyOf(v)
  } catch {
    return []
  } finally {
    open = was
  }
}

let lineCache: { view: AppView; lines: Line[] } | undefined

type DrawnLine = { section: string; title: string; note: string }

/** The lines of a place's body, in the order they are drawn, each under its section. */
function drawnLines(v: AppView, place: Place): DrawnLine[] {
  const lines: DrawnLine[] = []
  let section = ''
  for (const node of bodyFor(v, place)) {
    if (node.classList.contains('grp')) {
      section = (node.firstChild?.textContent ?? '').trim()
      continue
    }
    for (const row of node.matches('.row') ? [node] : [...node.querySelectorAll('.row')]) {
      const title = lineTitle(row)
      const note = [...row.querySelectorAll(':scope > .l > small')].map(s => s.textContent ?? '').join(' · ')
      if (title) lines.push({ section, title, note })
    }
  }
  return lines
}

/** A place's lines drawn in English, for a search in English while the interface is Ukrainian or Russian. */
function englishLines(v: AppView, place: Place): DrawnLine[] {
  const was = uiLanguage()
  setUiLanguage('en')
  try {
    return drawnLines(v, place)
  } finally {
    setUiLanguage(was)
  }
}

/**
 * Every line of the searched places, read from their bodies once per snapshot.
 * In Ukrainian or Russian each body is drawn a second time in English and its
 * lines paired with the first by order; a place whose two drawings differ in
 * their number of lines is found by its own language only.
 */
function linesOf(v: AppView): Line[] {
  if (lineCache?.view === v) return lineCache.lines
  const lines: Line[] = []
  const english = uiLanguage() !== 'en'
  for (const place of SEARCHED) {
    if (place.sub && SUBS[place.sub].valid?.(v) === false) continue
    const mine = drawnLines(v, place)
    const en = english ? englishLines(v, place) : []
    const paired = en.length === mine.length
    mine.forEach((l, i) => {
      const e = paired ? en[i] : undefined
      lines.push({ place, ...l, en: e ? `${e.title} ${e.note}` : '' })
    })
  }
  lineCache = { view: v, lines }
  return lines
}

const found = (v: AppView) => {
  const q = finding.trim().toLowerCase()
  return q ? linesOf(v).filter(l => `${l.title} ${l.note}`.toLowerCase().includes(q) || l.en.toLowerCase().includes(q)) : []
}

function searchCap(v: AppView): string {
  const n = found(v).length
  const q = finding.trim()
  return q ? (n ? t('search.places', { n, q }) : t('search.none', { q })) : ''
}

/** Where a place is, in words, as its header says it: "Kept as typed", "Keyboard › Fixing as I type". */
function whereOf(place: Place): string {
  return place.sub ? `${TITLES[place.name]} › ${subTitle(place.sub)}` : TITLES[place.name]
}

/** A text with the words searched for marked. */
function marked(text: string, q: string): (Node | string)[] {
  const i = text.toLowerCase().indexOf(q)
  return i < 0 ? [text] : [text.slice(0, i), el('mark', {}, text.slice(i, i + q.length)), text.slice(i + q.length)]
}

function searchPage(v: AppView): HTMLElement[] {
  const q = finding.trim().toLowerCase()
  const hits = found(v)
  if (!hits.length) return [aside('search', q ? t('search.nothing', { q: finding.trim() }) : t('search.hint'))]
  const out: HTMLElement[] = []
  let last = ''
  for (const hit of hits) {
    const where = whereOf(hit.place)
    if (where !== last) out.push(grp(where))
    last = where
    out.push(
      el(
        'button',
        { class: 'row navc found', onclick: () => go(hit.place.name, hit.place.sub, hit.title) },
        el('div', { class: 'l' }, el('span', {}, ...marked(hit.title, q)), hit.note ? el('small', {}, ...marked(hit.note, q)) : null),
        hit.section ? el('span', { class: 'v' }, hit.section) : null,
        lucide('chevron-right', 'chev'),
      ),
    )
  }
  return out
}

/** The search field changed: the Search page opens with its finds, or closes when it is empty. */
function find(text: string): void {
  finding = text
  if (!view) return
  if (!text.trim()) {
    if (open?.name === 'search') back()
    return
  }
  if (open?.name !== 'search') return go('search')
  fillHeader()
  bodyPending = false
  pBody.replaceChildren(...bodyOf(view))
}

// ---------------------------------------------------------------- page parts

/** A sample to select and try the keys on, right here. */
function tryIt(text: string, how: string): HTMLElement {
  return el('div', { class: 'try' }, el('p', {}, text), el('small', {}, how))
}

// ---------------------------------------------------------------- keys on pages

type KeyName =
  | 'selectKey'
  | 'snipKey'
  | 'translateKey'
  | 'textKey'
  | 'inPlaceKey'
  | 'checkKey'
  | 'typeKey'
  | 'typeCheckKey'
  | 'switchKey'
  | 'fixKey'
  | 'dictateKey'
  | 'englishKey'
  | 'noteKey'
  | 'againKey'
  | 'practiceKey'
  | 'talkKey'
  | 'pauseKey'
  | 'windowKey'

const KEY_USE: Record<KeyName, string> = phrases({
  selectKey: 'keys.useSelect',
  snipKey: 'keys.useSnip',
  translateKey: 'keys.useTranslate',
  textKey: 'keys.useText',
  inPlaceKey: 'keys.useInPlace',
  checkKey: 'keys.useCheck',
  typeKey: 'keys.useType',
  typeCheckKey: 'keys.useTypeCheck',
  switchKey: 'keys.useSwitch',
  fixKey: 'keys.useFix',
  dictateKey: 'keys.useDictate',
  englishKey: 'keys.useEnglish',
  noteKey: 'keys.useNote',
  againKey: 'keys.useAgain',
  practiceKey: 'keys.usePractice',
  talkKey: 'keys.useTalk',
  pauseKey: 'keys.usePause',
  windowKey: 'keys.useWindow',
})

/** What else a key is for already, besides `self` (a setting's name, or a layout's id for its own key). */
function keyTakenBy(key: string, self: string): string | undefined {
  const s = view?.settings
  // No key is nobody's: any number of them may be empty.
  if (!s || !key) return undefined
  const other = (Object.keys(KEY_USE) as KeyName[]).find(n => n !== self && s[n] === key)
  if (other) return KEY_USE[other]
  const layout = Object.entries(s.layoutKeys).find(([id, k]) => id !== self && k === key)?.[0]
  return layout ? t('keys.toLayout', { layout: view?.layouts.find(l => l.id === layout)?.name ?? t('keys.aLayout') }) : undefined
}

/** Saves a key unless another use has it already. */
function saveKey(name: KeyName, key: string): void {
  const other = keyTakenBy(key, name)
  if (other) {
    keyTrouble = { name, text: t('keys.taken', { key: said(key), use: other }) }
    return renderBody()
  }
  keyTrouble = undefined
  save({ [name]: key })
}

/** A key of an action, from the settings (see keyRecorder). */
function keyRow(name: KeyName, label: string, note: string, taken = false, iconName?: LucideName, extra?: HTMLElement | null): HTMLElement {
  const key = view?.settings[name] ?? ''
  const menu = menuNote(key)
  return keyRecorder(name, key, key => saveKey(name, key), label, menu ? `${note}; ${menu}` : note, taken, iconName, extra, DEFAULTS[name])
}

/** Alt or Win alone as a key: Krya keeps it from opening a menu (typist.ts), so the line says where the menu went. */
function menuNote(key: string): string {
  if (/^(Left|Right)Alt(\*2)?$/.test(key)) return t('keys.menuAlt')
  if (/^(Left|Right)Super(\*2)?$/.test(key)) return t('keys.menuWin')
  return ''
}

/** A layout's own key, which goes to that layout at once. */
function layoutKeyRow(l: KeyboardLayout, label: string, note: (string | HTMLElement)[]): HTMLElement {
  const keys = () => view?.settings.layoutKeys ?? {}
  const set = (key: string) => {
    const next = { ...keys() }
    if (key) next[l.id] = key
    else delete next[l.id]
    save({ layoutKeys: next })
  }
  const saveIt = (key: string) => {
    const other = key ? keyTakenBy(key, l.id) : undefined
    if (other) {
      keyTrouble = { name: l.id, text: t('keys.taken', { key: said(key), use: other }) }
      return renderBody()
    }
    keyTrouble = undefined
    set(key)
  }
  return keyRecorder(l.id, keys()[l.id] ?? '', saveIt, label, note, false, 'keyboard')
}

/**
 * A key recorded from a press: Change (or a tap on the keys) listens for keys
 * with modifiers, a modifier tapped alone or twice (it waits a moment for a
 * second tap), modifiers pressed together, Pause or Caps Lock alone, the
 * mouse's side buttons. Esc gives up; × clears the key; ↺ brings back the key
 * it came with (`byDefault`), when it had one and has another now. `id` names
 * it for the trouble line under it; `extra` sits after its controls (a switch).
 */
function keyRecorder(
  id: string,
  current: string,
  saveKeyAs: (key: string) => void,
  label: string,
  note: string | (string | HTMLElement)[],
  taken = false,
  iconName?: LucideName,
  extra?: HTMLElement | null,
  byDefault = '',
): HTMLElement {
  const name = id
  const recorder = new HotkeyRecorder()
  let waiting: number | undefined
  const field = el('button', {
    class: 'krec',
    title: t('keys.recordTitle'),
    'aria-label': t('keys.aria', { label, key: current ? said(current) : t('keys.notSet') }),
  })
  field.append(caps(current))
  const showing = (...nodes: HTMLElement[]) => field.replaceChildren(...nodes)
  const done = (key: string) => {
    window.clearTimeout(waiting)
    field.blur()
    saveKeyAs(key)
  }
  const recorded = (r: Recorded | undefined) => {
    window.clearTimeout(waiting)
    if (!r) return
    if (!r.more) return done(r.hotkey)
    // A tap: a second one within a moment makes it a double.
    showing(caps(r.hotkey), el('span', { class: 'x2' }, '…'))
    waiting = window.setTimeout(() => done(r.hotkey), DOUBLE_MS)
  }
  const listen = () => {
    if (field.classList.contains('recording')) return
    recorder.reset()
    field.classList.add('recording')
    showing(el('span', { class: 'key rec' }, t('keys.pressKeys')))
  }
  // Focus starts it; so does the click itself, should the window not have the focus yet.
  field.addEventListener('focus', listen)
  field.addEventListener('click', () => (field.focus(), listen()))
  field.addEventListener('blur', () => {
    window.clearTimeout(waiting)
    field.classList.remove('recording')
    showing(caps(current))
  })
  field.addEventListener('keydown', event => {
    if (!field.classList.contains('recording')) return
    event.preventDefault()
    if (event.key === 'Escape') return field.blur()
    if (event.repeat) return
    window.clearTimeout(waiting)
    recorded(recorder.keydown(event.code, event.timeStamp))
  })
  field.addEventListener('keyup', event => {
    if (!field.classList.contains('recording')) return
    event.preventDefault()
    recorded(recorder.keyup(event.code, event.timeStamp))
  })
  field.addEventListener('mousedown', event => {
    if (document.activeElement !== field || (event.button !== 3 && event.button !== 4)) return
    event.preventDefault()
    recorded(recorder.mouse(event.button))
  })
  // The side buttons go back and forward in a page; here they are recorded instead.
  field.addEventListener('mouseup', event => {
    if (event.button === 3 || event.button === 4) event.preventDefault()
  })
  const clear = current
    ? el(
        'button',
        {
          class: 'kx',
          title: t('keys.clear'),
          'aria-label': t('keys.clearAria', { label }),
          onclick: () => {
            keyTrouble = undefined
            saveKeyAs('')
          },
        },
        lucide('x', 's'),
      )
    : null
  const restore =
    byDefault && current !== byDefault
      ? el(
          'button',
          {
            class: 'kx',
            title: t('keys.backTo', { key: said(byDefault) }),
            'aria-label': t('keys.backToAria', { label, key: said(byDefault) }),
            onclick: () => {
              keyTrouble = undefined
              saveKeyAs(byDefault)
            },
          },
          lucide('rotate-ccw', 's'),
        )
      : null
  const trouble = keyTrouble?.name === name ? keyTrouble.text : ''
  const notes = typeof note === 'string' ? [note] : note
  const node = row(
    label,
    [...notes, taken && current ? bad(t('keys.takenProgram')) : null, trouble ? bad(trouble) : null],
    el('span', { class: 'kchg' }, field, clear, restore, linkBtn(t(current ? 'keys.change' : 'keys.set'), () => field.click()), extra ?? null),
  )
  if (iconName) node.prepend(lucide(iconName))
  return node
}

/** A key that cannot be changed, shown where it works. */
const fixedKey = (label: string, hotkey: string, note?: string) => row(label, [note], caps(hotkey))

// ---------------------------------------------------------------- action pages

function listenPage(v: AppView): HTMLElement[] {
  const s = v.settings
  const how = s.selectKey ? t('listen.tryKey', { how: usage(s.selectKey) }) : t(s.doubleCopy ? 'listen.tryTwice' : 'listen.tryNone')
  return [
    grp(t('keys.group')),
    keyRow('selectKey', t('listen.select'), t('listen.selectNote'), !v.keysOk.select, 'volume-2'),
    card(
      'copy',
      t('listen.alsoTwice'),
      [t('listen.alsoTwiceNote')],
      el('span', { class: 'kchg' }, caps(COPY_TWICE), el('span', { class: 'tgwrap' }, toggleKnob(s.doubleCopy, doubleCopy => save({ doubleCopy }), t('keys.copyTwice')))),
    ),
    keyRow('snipKey', t('listen.snip'), t('listen.boxNote'), !v.keysOk.snip, 'scan'),
    grp(t('listen.voiceGroup')),
    navCard('volume-2', t('listen.voiceGroup'), t('listen.voiceNote'), voiceValue(v), () => go('models', 'forVoice'), 'models'),
    speedCard(v),
    grp(t('listen.cardGroup')),
    toggleCard('volume-2', t('listen.autoRead'), s.autoRead, autoRead => save({ autoRead })),
    toggleCard('spell-check', t('listen.rareWords'), s.rareWords, rareWords => save({ rareWords })),
    toggleCard('list', t('listen.oneAtATime'), s.oneAtATime, oneAtATime => save({ oneAtATime })),
    card(
      'book-open',
      t('listen.wordHint'),
      [],
      select(
        s.wordHint,
        [
          ['shift', t('listen.hintShift')],
          ['hover', t('listen.hintHover')],
          ['off', t('listen.hintOff')],
        ],
        wordHint => save({ wordHint }),
      ),
    ),
    grp(t('listen.inCard')),
    card('play', t('listen.playKeys'), [], el('span', { class: 'kg2' }, caps('Space'), caps('←'), caps('→'))),
    card('book-open', t('listen.clickWord'), [t('listen.clickWordNote')], null),
    card('languages', t('listen.clickSentence'), [t('listen.clickSentenceNote')], null),
    card('x', t('listen.closeCard'), [], caps('Esc')),
    tryIt('The morning was quiet. A small boat drifted along the river, and two children watched the ducks from the bridge.', how),
  ].filter((n): n is HTMLElement => n !== null)
}

const TRY_TRANSLATE: Record<string, string> = {
  Russian: 'Конечно, пришлю обновлённые макеты до созвона.',
  Ukrainian: 'Звісно, надішлю оновлені макети до дзвінка.',
}

function translatorChip(v: AppView): [HTMLElement, string] {
  const level = v.settings.translationLevel
  const from = level === 'fast' ? 'Mozilla' : 'Hugging Face'
  switch (v.translator) {
    case 'ready':
      return [chip(t('translate.chipReady')), t('translate.readyNote', { level: levelName(level) })]
    case 'absent':
      return [chip(t('translate.chipFirstUse'), 'off'), t('translate.absentNote', { from })]
    case 'downloading':
      return [chip(t('translate.chipDownloading')), t('translate.downloadingNote', { from })]
    case 'failed':
      return [chip(t('translate.chipFailed'), 'bad'), t('translate.failedNote')]
    case 'unsupported':
      return [chip(t('translate.chipUnsupported'), 'off'), t('translate.unsupportedNote')]
  }
}

const LEVEL_ABOUT: Record<TranslationLevel, string> = phrases({
  fast: 'models.aboutFast',
  accurate: 'models.aboutAccurateLevel',
  most: 'models.aboutMostLevel',
})

/** The model behind a level, named last. */
const LEVEL_MODEL: Record<TranslationLevel, string> = {
  fast: 'Firefox Translations',
  accurate: 'Gemma 4 E4B',
  most: 'Gemma 4 12B',
}

const FIT_WHERE: Record<LevelFit['where'], string> = phrases({
  card: 'models.onCard',
  part: 'models.partlyOnCard',
  processor: 'models.onProcessor',
})

/** The time expected before any is measured here. */
const FIT_GUESS: Record<LevelFit['where'], string> = phrases({
  card: 'models.guessCard',
  part: 'models.guessPart',
  processor: 'models.guessProcessor',
})

/** A model partly on an NVIDIA card runs on llama.cpp's CUDA build, which its download carries. */
const cudaGuess = () => t('models.cudaGuess')
const cudaSize = () => t('models.cudaSize')

/** A sentence slower than this reads as slow. */
const SLOW_SENTENCE_S = 2

/** The wait for a model loaded again after it was let go, measured here. */
const startText = (start: number | undefined) => (start !== undefined ? `; ${t('models.starts', { time: seconds(start) })}` : '')

/** What a model on the graphics card holds of it (measured on an NVIDIA card), and when it gives it back (llama.ts, main.ts stopForFullScreen). */
function cardText(fit: LevelFit, card: number | undefined): string | null {
  if (fit.where === 'processor') return null
  return card !== undefined ? t('models.cardHeld', { size: speechSize(card) }) : t('models.cardFrees')
}

/** Where a level runs here and how long it takes: measured, once it has been, else expected. */
function levelFitText(fit: LevelFit, speed: AppView['modelSpeed'][LlmModel]): string {
  const where = FIT_WHERE[fit.where]
  const measured = speed?.sentence === undefined ? undefined : { sentence: speed.sentence, start: speed.start }
  if (!measured) return fit.cuda ? `${cudaGuess()}, ${where}` : fit.where === 'card' ? `${FIT_GUESS.card} ${where}` : `${FIT_GUESS[fit.where]}, ${where}`
  return `${t(measured.sentence > SLOW_SENTENCE_S ? 'models.slowHere' : 'models.here')}: ${t('models.perSentence', { time: seconds(measured.sentence) })}, ${where}${startText(measured.start)}`
}

// ---------------------------------------------------------------- models
// Every model Krya runs, on one page, each once, with the actions it serves:
// one used by two actions is downloaded and loaded once (the language model
// for Translate and Check, a speech model for Dictate and Transcribe). Each
// action's page names its model in one line that opens this page at it.

/** What each language model is like, translating and checking. */
const MODEL_ABOUT: Record<LlmModel, string> = phrases({
  accurate: 'models.aboutAccurate',
  most: 'models.aboutMost',
})

/** Where a language model runs here and how long it takes, translating and checking: measured, once it has been, else expected. */
function llmFitText(fit: LevelFit, speed: AppView['modelSpeed'][LlmModel]): string {
  if (!speed || (speed.sentence === undefined && speed.text === undefined)) return levelFitText(fit, speed)
  const times = [
    speed.sentence !== undefined ? t('models.perSentence', { time: seconds(speed.sentence) }) : '',
    speed.text !== undefined ? t('models.perCheck', { time: seconds(speed.text) }) : '',
    speed.reply !== undefined ? t('models.perAnswer', { time: seconds(speed.reply) }) : '',
  ]
    .filter(Boolean)
    .join(', ')
  const slow = (speed.sentence ?? 0) > SLOW_SENTENCE_S || (speed.text ?? 0) > SLOW_CHECK_S
  return `${t(slow ? 'models.slowHere' : 'models.here')}: ${times}, ${FIT_WHERE[fit.where]}${startText(speed.start)}`
}

const pct = (progress: number) => el('span', { class: 'pct' }, `${Math.round(progress * 100)}%`)

/** A language model's size here, or what picking it downloads. */
function llmSizeNote(v: AppView, model: LlmModel, inUse: boolean): string | HTMLElement {
  const m = v.models[model]
  const size = speechSize(m.size)
  if (m.status === 'failed') return bad(t('models.failedRetry'))
  if (m.status === 'ready') return t('models.onComputer', { size })
  if (m.status === 'downloading') return t('models.downloadingSize', { size })
  return `${t(inUse ? 'models.toDownloadFirst' : 'models.toDownloadPicked', { size })}${translationAdvice(v.speech.device)[model].cuda ? ` (${cudaSize()})` : ''}`
}

/**
 * Accurate or Most accurate on an action's choice page: what it is, its time
 * here, its size, and what the other action does with it (one model at a time
 * for both, main.ts keeps them in step). One on the disk that neither action
 * uses can go.
 */
function llmChoice(v: AppView, model: LlmModel, on: boolean, pick: () => void, share: string): HTMLElement {
  const s = v.settings
  const m = v.models[model]
  const advice = translationAdvice(v.speech.device)
  const fit = advice[model]
  const fetching = m.status === 'downloading'
  const used = s.model === model || s.translationLevel === model
  const notes = [
    `${MODEL_ABOUT[model]} (${LEVEL_MODEL[model]})`,
    llmFitText(fit, v.modelSpeed[model]),
    llmSizeNote(v, model, on),
    share,
    m.status === 'ready' ? cardText(fit, v.modelSpeed[model]?.card) : null,
    fetching ? bar(m.progress) : null,
  ]
  const label = el('span', {}, levelName(model), advice.advised === model ? recommended() : null)
  const control = fetching ? pct(m.progress) : on && m.status !== 'ready' ? linkBtn(t(m.status === 'failed' ? 'common.tryAgain' : 'models.download'), () => post({ type: 'useModel', model })) : null
  const remove = m.status === 'ready' && !used ? ib('x', t('models.remove', { level: levelName(model), size: speechSize(m.size) }), () => post({ type: 'removeStored', id: model })) : null
  return radioRow(label, notes, on, pick, control, remove)
}

/** Models › Translate: Fast (Firefox's models, which only translate), or the language model Check my English uses too. */
function translateChoicePage(v: AppView): HTMLElement[] {
  const s = v.settings
  const advice = translationAdvice(v.speech.device)
  const fast = v.translation.fast
  const fetching = fast.status === 'downloading'
  const fastRow = radioRow(
    el('span', {}, levelName('fast'), advice.advised === 'fast' ? recommended() : null),
    [
      `${LEVEL_ABOUT.fast} (${LEVEL_MODEL.fast})`,
      fast.status === 'failed'
        ? bad(t('models.fastFailed'))
        : fast.status === 'ready'
          ? t('models.onThisComputer')
          : fetching || fast.status === 'unsupported'
            ? null
            : t(s.translationLevel === 'fast' ? 'models.fastNext' : 'models.fastPicked', { size: speechSize(fast.size) }),
      t('models.draft', { accurate: levelName('accurate'), most: levelName('most') }),
      fetching ? bar(fast.progress) : null,
    ],
    s.translationLevel === 'fast',
    () => post({ type: 'translationLevel', level: 'fast' }),
    fetching ? pct(fast.progress) : null,
  )
  const share = (model: LlmModel) =>
    t(s.model !== model ? 'models.checkMoves' : s.translationLevel === model ? 'models.checkShares' : 'models.checkAlready')
  return [
    grp(t('models.translateWith')),
    fastRow,
    ...(['accurate', 'most'] as const).map(model => llmChoice(v, model, s.translationLevel === model, () => post({ type: 'translationLevel', level: model }), share(model))),
  ]
}

/** Models › Check my English: the language model; Translate uses the same one unless it is on Fast. */
function checkChoicePage(v: AppView): HTMLElement[] {
  const s = v.settings
  const share = (model: LlmModel) =>
    s.translationLevel === model ? t('models.translateShares') : s.translationLevel === 'fast' ? t('models.translateStays', { fast: levelName('fast') }) : t('models.translateMoves')
  return [
    grp(t('models.checkWith')),
    ...(['accurate', 'most'] as const).map(model => llmChoice(v, model, s.model === model, () => post({ type: 'useModel', model }), share(model))),
    aside('info', t('models.fastOnly', { fast: levelName('fast') })),
  ]
}

/** Models › Dictate, Models › Transcribe: Automatic or a model of the action's own; the engine's download until it runs. */
function speechChoicePage(v: AppView, feature: Feature): HTMLElement[] {
  const name = feature === 'dictation' ? TITLES.dictate : TITLES.transcribe
  // engineRows takes the feature's English id and words the offer itself (speech.ts).
  const offer = engineRows(v, feature === 'dictation' ? 'Dictate' : 'Transcribe')
  if (offer.length) return [grp(t('models.engine')), ...offer]
  return [
    testOffer(v),
    grp(t('models.speechWith', { name })),
    ...speechChoiceRows(v, feature),
    grp(t('models.options')),
    preferRow(v),
    gpuRow(v),
    feature === 'transcripts' ? speakersCard(v, () => go('transcribe', 'speakers'), true) : null,
  ].filter((n): n is HTMLElement => n !== null)
}

/** Models › Listen voice: Automatic (the natural voice once it is here), each natural voice, each Windows voice. */
function voiceChoicePage(v: AppView): HTMLElement[] {
  const s = v.settings
  const natural = recommend(v).voice.on
  const rtf = v.natural.rtf
  // The natural voice slower than it speaks here pauses between sentences: said plainly, with the instant Windows voice offered.
  const slow = naturalOn(v) && rtf !== undefined && rtf > 1
  const windows = v.hostVoices.find(h => /^en\b/i.test(h.lang))?.name
  const noteOf = (value: string) =>
    value === ''
      ? v.natural.status === 'ready'
        ? t('models.naturalReady')
        : t('models.naturalLater')
      : value.startsWith(NATURAL_PREFIX)
        ? `${t('models.naturalNote')}${rtf && rtf <= 1 ? ` · ${t('models.naturalFaster', { n: Math.max(1, Math.round(1 / rtf)) })}` : ''}`
        : t('models.windowsNote')
  const rows = voiceOptions(v).map(([value, label]) => {
    const advised = value === '' ? natural : !natural && value === windows
    return radioRow(el('span', {}, label, advised ? recommended() : null), [noteOf(value)], s.voice === value, () => save({ voice: value }))
  })
  return [
    grp(t('models.readWith')),
    ...rows,
    naturalRow(v),
    slow ? warn(t('models.naturalSlow')) : null,
  ].filter((n): n is HTMLElement => n !== null)
}

/** Use recommended was tapped: what it would change shows, with Apply and Cancel. */
let recommending = false

/** Use recommended: the models advised for this computer (setup.ts recommendedModels), each change shown before anything changes. */
function recommendRows(v: AppView): HTMLElement[] {
  const close = () => ((recommending = false), renderBody())
  if (!recommending)
    return [row(t('models.useRecommendedTitle'), [t('models.useRecommendedNote')], btn(t('models.useRecommended'), () => ((recommending = true), renderBody()), 'primary'))]
  const advice = recommendedModels(v)
  if (!advice.changes.length)
    return [el('div', { class: 'row total' }, el('div', { class: 'l' }, t('models.already'), el('small', {}, t('models.alreadyNote'))), linkBtn('OK', close))]
  const free = v.storage?.freeMb ?? v.speech.disk.freeMb
  const needs = advice.download * 1.1
  const short = advice.download > 0 && free > 0 && free < needs
  const apply = btn(t('models.apply'), () => ((recommending = false), post({ type: 'useRecommended' }), renderBody()), 'primary')
  apply.disabled = short
  return [
    el(
      'div',
      { class: 'row total' },
      el(
        'div',
        { class: 'l' },
        t('models.changes'),
        ...advice.changes.map(c => el('small', {}, el('b', {}, c.what), `: ${c.from} → ${c.to}${c.mb ? ` · ${t('models.toDownload', { size: speechSize(c.mb) })}` : ''}`)),
        el(
          'small',
          {},
          `${advice.download ? t('models.toDownloadAll', { size: speechSize(advice.download) }) : t('models.nothingToDownload')}${free > 0 ? ` · ${t('models.free', { size: speechSize(free) })}` : ''} · ${t('models.nothingRemoved')}`,
        ),
        short ? bad(t('models.needsFree', { size: speechSize(needs) })) : null,
      ),
      el('span', { class: 'kchg' }, linkBtn(t('common.cancel'), close), apply),
    ),
  ]
}

/** Clean up was tapped: it shows as going on until the storage is measured again. */
let cleaning: 'asked' | 'measuring' | undefined

/** Why a part the person asked to remove is still here (main's `refused`), or null. */
function refusedNote(v: AppView, p: StoragePart): HTMLElement | null {
  const r = v.storage?.refused?.find(r => r.id === p.id && (r.item ?? '') === (p.item ?? ''))
  return r ? bad(t('engine.notRemoved', { name: storedName(v, p), why: r.why })) : null
}

/** What nothing uses (storage.ts withUse; the processor's spare speech model is not in it), in one line with Clean up. */
function unusedNotice(v: AppView): HTMLElement | null {
  const parts = (v.storage?.parts ?? []).filter(p => p.unused && p.bytes > 0)
  if (!parts.length) return null
  const kept = cleaning ? [] : parts.map(p => refusedNote(v, p))
  const mb = parts.reduce((n, p) => n + p.bytes / 1e6, 0)
  return el(
    'div',
    { class: 'row notice old' },
    lucide('trash-2'),
    el('div', { class: 'l' }, t('models.unused', { size: speechSize(mb) }), el('small', {}, t('models.unusedNote', { list: parts.map(p => storedName(v, p)).join(', ') })), ...kept),
    cleaning ? el('span', { class: 'v' }, t('models.cleaning')) : btn(t('models.cleanUp'), () => ((cleaning = 'asked'), post({ type: 'cleanUp' }), renderBody()), 'primary'),
  )
}

/** Models: this computer and its advice on top, then what each action uses, each opening its own choice. */
function modelsPage(v: AppView): HTMLElement[] {
  return [
    grp(t('models.computer')),
    ...computerRows(v),
    testOffer(v),
    ...recommendRows(v),
    unusedNotice(v),
    grp(t('models.eachAction')),
    navCard('languages', TITLES.translate, t('models.translateNote'), levelValue(v), () => go('models', 'forTranslate'), 'forTranslate'),
    navCard('graduation-cap', t('page.checkEnglish'), t('page.forCheckCap'), checkValue(v), () => go('models', 'forCheck'), 'forCheck'),
    navCard('mic', TITLES.dictate, t('models.dictateNote'), speechValue(v, 'dictation'), () => go('models', 'forDictate'), 'forDictate'),
    navCard('audio-lines', TITLES.transcribe, t('models.transcribeNote'), speechValue(v, 'transcripts'), () => go('models', 'forTranscribe'), 'forTranscribe'),
    speakersCard(v, () => go('transcribe', 'speakers'), true),
    navCard('volume-2', t('page.voice'), t('page.forVoiceCap'), voiceValue(v), () => go('models', 'forVoice'), 'forVoice'),
    aside('info', t('models.shared')),
  ].filter((n): n is HTMLElement => n !== null)
}

/** A model's state after its name, in a few words: its size here, its download. */
function stateText(m: { status: string; progress: number; size: number }): string {
  if (m.status === 'downloading') return ` · ${t('models.stateDownloading', { pct: Math.round(m.progress * 100) })}`
  if (m.status === 'failed') return ` · ${t('models.stateFailed')}`
  if (m.status === 'ready') return ` · ${speechSize(m.size)}`
  return m.status === 'unsupported' ? '' : ` · ${t('home.downloadsOnce')}`
}

/** A level in a few words, for the lines to Models › Translate: its name, its size, its download. */
function levelValue(v: AppView): string {
  const level = v.settings.translationLevel
  return `${levelName(level)}${stateText(v.translation[level])}`
}

/** The checker in a few words, for the lines to Models › Check my English. */
function checkValue(v: AppView): string {
  return `${levelName(v.settings.model)}${stateText(v.models[v.settings.model])}`
}

function translatePage(v: AppView): HTMLElement[] {
  const s = v.settings
  const [state, note] = translatorChip(v)
  const text = TRY_TRANSLATE[s.native] ?? 'Of course, I will send the updated layouts before the call.'
  const how = s.translateKey ? t('translate.tryKey', { how: usage(s.translateKey) }) : t('translate.tryNone')
  return [
    grp(t('keys.group')),
    keyRow('translateKey', t('translate.select'), s.translateKey ? t('translate.selectNote', { how: usage(s.translateKey) }) : t('translate.selectNoKey'), !v.keysOk.translate, 'languages'),
    keyRow('typeKey', t('translate.type'), t('translate.typeNote'), !v.keysOk.type, 'type'),
    keyRow('inPlaceKey', t('translate.inPlace'), t('translate.inPlaceNote'), !v.keysOk.inPlace, 'wand-sparkles'),
    keyRow('textKey', t('translate.text'), t('listen.boxNote'), !v.keysOk.text, 'scan'),
    fixedKey(t('translate.pasteBack'), 'Enter'),
    grp(t('translate.group')),
    navCard('boxes', t('translate.model'), t('translate.modelNote'), levelValue(v), () => go('models', 'forTranslate'), 'models'),
    grp(t('translate.languages')),
    card('globe', pairOf(v), [note], state),
    languagesCard(v),
    grp(t('translate.history')),
    navCard('clock', t('translate.recent'), t('translate.recentNote'), v.translations.length ? String(v.translations.length) : t('translate.none'), () => go('translations'), 'translations'),
    tryIt(text, how),
  ]
}

/** The texts translated lately (translationlog.ts), each to copy; Krya forgets them after 30 days by itself. */
function translationsPage(v: AppView): HTMLElement[] {
  const list = v.translations
  return [
    grp(TITLES.translations, list.length || undefined, list.length ? linkBtn(t('keys.clear'), () => post({ type: 'clearTranslations' })) : null),
    ...(list.length
      ? list.map(e =>
          el(
            'div',
            { class: 'row phrase' },
            el(
              'div',
              { class: 'l' },
              el('span', { class: 'said translated', title: `${e.text}\n\n${e.translation}` }, e.translation),
              el('small', {}, `${e.text.length > 80 ? `${e.text.slice(0, 80)}…` : e.text} · ${whenSaid(e.at, Date.now())}`),
            ),
            linkBtn(t('common.copy'), () => copyText(e.translation)),
          ),
        )
      : [aside('info', t('translate.empty'))]),
  ]
}

// ---------------------------------------------------------------- check my English

/** Mistakes made by learners whose own language is Russian or Ukrainian: the page's text to try. */
const TRY_CHECK = 'I want to learn English and can we made tutor option? I dictate or tupe in English and you show my my mistake.'

/** A text slower than this to check reads as slow. */
const SLOW_CHECK_S = 4

// ---------------------------------------------------------------- talk
// The talk itself and its history are the talk window's (webview/talk.ts);
// this page holds its settings and opens it.

/** A topic's name (topics.ts); an unknown one, as it was saved. */
const topicTitle = (id: string) => (TOPICS.some(x => x.id === id) ? t(`topic.${id}` as Key) : id)

/** The Talk page and Home: what stands in the way, else what it does. */
function talkCap(v: AppView): string {
  if (v.speech.device.at && translationAdvice(v.speech.device).accurate.where !== 'card') return t('talkPage.needsCard')
  const m = v.models[v.settings.model]
  if (m.status === 'downloading') return t('check.downloadingPct', { pct: Math.round(m.progress * 100) })
  if (m.status !== 'ready') return t('check.downloadsOnce')
  return t('check.capNotes', { lang: languageName(v.settings.native) })
}

/** What keeps the talk window from working here, said on its page with what to do. */
function talkNotice(v: AppView): HTMLElement | null {
  const model = v.settings.model
  const files = v.models[model]
  if (v.speech.device.at && translationAdvice(v.speech.device).accurate.where !== 'card')
    return el('div', { class: 'row notice' }, lucide('cpu'), el('div', { class: 'l' }, t('talk.needsCard'), el('small', {}, t('talk.needsCardNote'))))
  if (files.status !== 'ready') {
    const fetching = files.status === 'downloading'
    return el(
      'div',
      { class: 'row notice' },
      lucide('download'),
      el(
        'div',
        { class: 'l' },
        t('talk.needsModel', { name: levelName(model), size: speechSize(files.size) }),
        el('small', {}, fetching ? t('talkPage.downloading') : files.status === 'failed' ? t('talk.downloadFailed') : t('talkPage.downloadOnce')),
        fetching ? bar(files.progress) : null,
      ),
      fetching ? el('span', { class: 'pct' }, `${Math.round(files.progress * 100)}%`) : btn(files.status === 'failed' ? t('common.tryAgain') : t('settings.download'), () => post({ type: 'useModel', model }), 'primary'),
    )
  }
  if (!installed(v))
    return el('div', { class: 'row notice' }, lucide('mic'), el('div', { class: 'l' }, t('talkPage.engineTitle'), el('small', {}, t('talkPage.engineNote'))), linkBtn(t('talkPage.openDictate'), () => go('dictate')))
  return null
}

/** What the person types about themselves, saved a moment after they stop (and at once when they leave the field). */
let aboutTimer: number | undefined

function aboutField(value: string): HTMLTextAreaElement {
  const field = el('textarea', {
    class: 'field report about',
    rows: 3,
    maxlength: TALK_ABOUT_MAX,
    placeholder: t('talkPage.aboutPlaceholder'),
    'aria-label': t('talkPage.aboutYou'),
    'data-live': 'about',
  })
  field.value = value
  const store = () => {
    window.clearTimeout(aboutTimer)
    aboutTimer = undefined
    if (field.value !== view?.settings.talkAbout) save({ talkAbout: field.value })
  }
  field.addEventListener('input', () => {
    window.clearTimeout(aboutTimer)
    aboutTimer = window.setTimeout(store, 600)
  })
  field.addEventListener('blur', () => aboutTimer !== undefined && store())
  return field
}

/** The Talk page: the window's button, then its settings. */
function talkPage(v: AppView): HTMLElement[] {
  const s = v.settings
  const going = v.talk
  const keyNote = !installed(v) ? t('talkPage.needsEngine') : s.talkKey ? t('talkPage.keyNote', { keys: usage(s.talkKey) }) : t('talkPage.keyNoteNone')
  return [
    el(
      'div',
      { class: 'row notice talk-open' },
      tile(36),
      el('div', { class: 'l' }, 'Talk to the duck', el('small', {}, going ? t('talkPage.openGoing', { topic: topicTitle(going.topic), lines: t('talk.lines', { n: going.lines }) }) : t('talkPage.openIdle'))),
      btn([lucide('message-square'), t('talkPage.open')], () => post({ type: 'talkOpen' }), 'primary'),
    ),
    talkNotice(v),
    grp(t('talkPage.you')),
    el('div', { class: 'row add' }, el('div', { class: 'l' }, t('talkPage.aboutYou')), aboutField(s.talkAbout), el('small', {}, t('talkPage.aboutNote'))),
    row(
      t('talkPage.level'),
      [t(`talkPage.level${s.talkLevel}`)],
      seg(s.talkLevel, TALK_LEVELS.map(l => [l, l] as [TalkLevel, string]), talkLevel => save({ talkLevel }), true),
    ),
    grp(t('talkPage.keys')),
    keyRow('talkKey', 'Talk to the duck', keyNote, !v.speech.keysOk.talk, 'bird'),
    fixedKey(t('talkPage.spaceKey'), 'Space'),
    fixedKey(t('talkPage.escKey'), 'Escape'),
    grp(t('talkPage.duck')),
    toggleCard('volume-2', t('talkPage.aloud'), s.talkAloud, talkAloud => save({ talkAloud }), t('talkPage.aloudNote')),
    toggleCard('pin', t('talkPage.onTop'), s.talkOnTop, talkOnTop => save({ talkOnTop }), t('talkPage.onTopNote')),
    navCard('boxes', t('talkPage.model'), t('talkPage.modelNote'), checkValue(v), () => go('models', 'forCheck'), 'models'),
    navCard('volume-2', t('talkPage.voice'), t('talkPage.voiceNote'), voiceValue(v), () => go('models', 'forVoice'), 'models'),
    grp(t('talkPage.kept')),
    aside('history', t('talkPage.history')),
    navCard('list-checks', t('mistakes.title'), t('talkPage.mistakesNote'), v.mistakes.length ? String(v.mistakes.length) : t('kb.none'), () => go('mistakes'), 'mistakes'),
  ].filter((n): n is HTMLElement => !!n)
}

/** What the checker does, for the bar and Home: the language it checks, or its model's download. */
function checkCap(v: AppView): string {
  const m = v.models[v.settings.model]
  if (m.status === 'downloading') return t('check.downloadingPct', { pct: Math.round(m.progress * 100) })
  return m.status === 'ready' ? t('check.capNotes', { lang: languageName(v.settings.native) }) : t('check.downloadsOnce')
}

function checkPage(v: AppView): HTMLElement[] {
  const s = v.settings
  const typed = s.typeCheckKey ? t('check.typedKey', { keys: usage(s.typeCheckKey) }) : t('check.typedTray')
  const how = s.checkKey ? t('check.tryKey', { keys: usage(s.checkKey), typed }) : t('check.tryNoKey', { typed })
  return [
    grp(t('talkPage.keys')),
    keyRow('checkKey', t('check.keySelected'), s.checkKey ? t('check.keySelectedNote', { keys: usage(s.checkKey) }) : t('check.keySelectedNone'), !v.keysOk.check, 'graduation-cap'),
    keyRow('typeCheckKey', t('check.typeKey'), t('check.typeKeyNote'), !v.keysOk.typeCheck, 'type'),
    keyRow('practiceKey', t('check.practiceKey'), installed(v) ? t('check.practiceNote') : t('talkPage.needsEngine'), !v.speech.keysOk.practice, 'mic'),
    fixedKey(t('check.enterKey'), 'Enter'),
    aside('info', t('check.speechNote')),
    grp(t('talkPage.model')),
    navCard('boxes', t('talkPage.model'), t('check.modelNote'), checkValue(v), () => go('models', 'forCheck'), 'models'),
    grp(t('check.history')),
    navCard('list-checks', t('mistakes.title'), t('check.mistakesNote'), v.mistakes.length ? String(v.mistakes.length) : t('kb.none'), () => go('mistakes'), 'mistakes'),
    tryIt(TRY_CHECK, how),
  ]
}

/** The changes of each kept text, worked out once (worddiff.ts). */
const diffs = new Map<string, DiffPart[]>()
function partsOf(e: MistakeEntry): DiffPart[] {
  const key = `${e.text}\u0000${e.corrected}`
  let parts = diffs.get(key)
  if (!parts) diffs.set(key, (parts = wordDiff(e.text, e.corrected)))
  return parts
}

/** One change on its own: "made → make", "+ a", "about" struck out. */
function changeText(wrong: string, right: string): HTMLElement {
  return el('span', { class: 'said marks' }, wrong ? el('del', {}, wrong) : '+', ' ', right ? el('ins', {}, right) : '')
}

/**
 * Library › Mistakes: the changes made more than once, most first, then every
 * checked text that had a mistake, newest first, marked as in the card, with
 * its note; searched by the words; a cross forgets one, Clear all of them.
 */
function mistakesPage(v: AppView): HTMLElement[] {
  // A mistake repeats when the same words are struck out again ("made" → "make", "make a"); a word only missing, when the same one is put in.
  const counts = new Map<string, { wrong: string; rights: string[] }>()
  for (const e of v.mistakes)
    for (const c of changesOf(partsOf(e))) {
      const key = c.wrong ? c.wrong.toLowerCase() : `+${c.right.toLowerCase()}`
      const known = counts.get(key)
      if (known) known.rights.push(c.right)
      else counts.set(key, { wrong: c.wrong, rights: [c.right] })
    }
  // Shown with its commonest fix, the shortest of equals.
  const commonest = (rights: string[]) =>
    rights.slice().sort((a, b) => rights.filter(r => r === b).length - rights.filter(r => r === a).length || a.length - b.length)[0] ?? ''
  const repeated = [...counts.values()]
    .filter(c => c.rights.length > 1)
    .sort((a, b) => b.rights.length - a.rights.length)
    .slice(0, 12)
    .map(c => ({ wrong: c.wrong, right: commonest(c.rights), n: c.rights.length }))
  const list = el('div', {})
  const fill = () => {
    // The newest mistakes: this list may outlive the message it was drawn from.
    const all = view?.mistakes ?? v.mistakes
    const q = search.trim().toLowerCase()
    const shown = q ? all.filter(e => `${e.text} ${e.corrected} ${e.note}`.toLowerCase().includes(q)) : all
    list.replaceChildren(
      ...(shown.length
        ? shown.map(e =>
            el(
              'div',
              { class: 'row phrase mistake' },
              el('div', { class: 'l' }, el('span', { class: 'said marks', title: e.corrected }, ...withMarks(partsOf(e))), el('small', {}, [e.note, whenSaid(e.at, Date.now())].filter(Boolean).join(' · '))),
              linkBtn(t('common.copy'), () => copyText(e.corrected)),
              ib('x', t('mistakes.forget'), () => post({ type: 'forgetMistake', at: e.at })),
            ),
          )
        : [aside('info', all.length ? t('mistakes.noSuch') : t('mistakes.empty'))]),
    )
  }
  fill()
  return [
    ...(repeated.length ? [grp(t('mistakes.repeat')), ...repeated.map(c => row(changeText(c.wrong, c.right), [t('mistakes.times', { n: c.n })]))] : []),
    grp(t('mistakes.title'), v.mistakes.length || undefined, v.mistakes.length ? linkBtn(t('mistakes.clear'), () => post({ type: 'clearMistakes' })) : null),
    ...(v.mistakes.length
      ? [
          el(
            'div',
            { class: 'tools' },
            el(
              'label',
              { class: 'search' },
              icon('search'),
              el('input', {
                type: 'search',
                placeholder: t('mistakes.search'),
                value: search,
                oninput: event => {
                  search = (event.target as HTMLInputElement).value
                  fill()
                },
              }),
            ),
          ),
        ]
      : []),
    list,
  ]
}

function screenPage(v: AppView): HTMLElement[] {
  return [
    grp(t('talkPage.keys')),
    keyRow('snipKey', t('screen.snipKey'), t('screen.keyNote'), !v.keysOk.snip, 'volume-2'),
    keyRow('textKey', t('screen.textKey'), t('screen.keyNote'), !v.keysOk.text, 'languages'),
    grp(t('screen.how')),
    card('scan', t('screen.draw'), [t('screen.drawNote')], null),
    card('type', t('screen.reads'), [t('screen.readsNote')], linkBtn(t('screen.languages'), () => post({ type: 'openLanguageSettings' }))),
    card('spell-check', t('screen.fix'), [t('screen.fixNote')], null),
  ]
}

/** A folder or file, in a note: its end shows when it is long. */
const pathNote = (path: string) => el('small', { class: 'path', title: path }, el('bdi', {}, path))


/** Where notes go: the knowledge base folder and the folder inside it, the engine's own settings. */
function kbRows(v: AppView): HTMLElement[] {
  const e = engineSettings(v)
  if (!running(v) || !e) return [card('folder', t('dictate.notesFolder'), [installed(v) ? t('dictate.folderShown') : t('dictate.folderChosen')], null)]
  const inbox = el('input', {
    type: 'text',
    class: 'field',
    value: e.kbInbox,
    placeholder: t('dictate.inboxPlaceholder'),
    'aria-label': t('dictate.inboxAria'),
    onkeydown: (event: Event) => (event as KeyboardEvent).key === 'Enter' && (event.target as HTMLInputElement).blur(),
    onchange: (event: Event) => void saveEngine({ kbInbox: (event.target as HTMLInputElement).value.trim() }),
  })
  return [
    card('folder', t('dictate.notesFolder'), [e.kbDir ? pathNote(e.kbDir) : t('dictate.folderNone')], linkBtn(e.kbDir ? t('dictate.change') : t('dictate.choose'), () => void pickKb())),
    card('notebook-pen', t('dictate.subfolder'), [t('dictate.subfolderNote')], inbox),
  ]
}

/** The card that opens the words to spell: how many there are. */
function vocabularyCard(v: AppView): HTMLElement {
  const n = v.settings.vocabulary.length
  return navCard('spell-check', t('vocab.title'), t('vocab.note'), n ? t('backup.words', { n }) : t('vocab.noneYet'), () => go('vocabulary'), 'vocabulary')
}

/** A speech action's model in a few words: Automatic and the one it picked, or the one picked; its download. */
function speechValue(v: AppView, feature: Feature): string {
  if (!installed(v)) return t('dictate.needsEngine')
  const p = v.speech.plan[feature]
  const live = v.speech.health?.models[feature]
  const state = live?.name === p.chosen.model && live.state === 'downloading' ? ` · ${t('check.downloadingPct', { pct: Math.round((live.progress ?? 0) * 100) })}` : ''
  return `${p.pinned ? p.chosen.label : t('dictate.automatic', { model: p.chosen.label })}${state}`
}

/** The line to the Models page at a feature's speech model: the one in use, and its download. */
function modelCard(v: AppView, feature: Feature): HTMLElement | null {
  if (!running(v)) return null
  const p = v.speech.plan[feature]
  const how = feature === 'dictation' ? t('dictate.modelNote', { time: seconds(p.chosen.estimate) }) : t('transcribe.modelNote', { time: minutes(p.chosen.estimate) })
  return navCard('boxes', t('dictate.speechModel'), how, speechValue(v, feature), () => go('models', feature === 'dictation' ? 'forDictate' : 'forTranscribe'), 'models')
}

function dictatePage(v: AppView): HTMLElement[] {
  const s = v.settings
  const k = v.speech.keysOk
  const offer = engineRows(v, 'Dictate')
  const recent = v.dictation.recent
  return [
    ...(offer.length ? [grp(t('dictate.engine')), ...offer] : []),
    testOffer(v),
    grp(t('talkPage.keys')),
    keyRow('dictateKey', t('dictate.typeKey'), t('dictate.typeNote'), !k.dictate, 'mic'),
    keyRow('englishKey', t('dictate.englishKey'), t('dictate.englishNote', { lang: languageName(s.native) }), !k.english, 'languages'),
    keyRow('noteKey', t('dictate.noteKey'), t('dictate.noteNote'), !k.note, 'notebook-pen'),
    keyRow('againKey', t('dictate.againKey'), t('dictate.againNote'), !k.again, 'rotate-cw'),
    keyRow('practiceKey', t('check.practiceKey'), t('check.practiceNote'), !k.practice, 'graduation-cap'),
    aside('info', t('dictate.escNote')),
    grp(t('dictate.notes')),
    ...kbRows(v),
    grp(t('dictate.wordsPhrases')),
    vocabularyCard(v),
    navCard('clock', t('dictate.recent'), t('dictate.recentNote'), recent.length ? recent[0]?.text ?? '' : t('vocab.noneYet'), () => go('phrases'), 'phrases'),
    modelCard(v, 'dictation'),
    el('p', { class: 'privacy' }, lucide('lock', 's'), t('dictate.privacy')),
  ].filter((n): n is HTMLElement => n !== null)
}

/**
 * Words to spell: names and terms dictation and transcripts write as the
 * person does, each with what it may be heard as (vocabulary.ts). Krya's own
 * setting, sent to the engine with its plan, so it can be filled in before the
 * engine is here. Two fields add one: the word as written, and the heard
 * forms; a tap on a word puts it back into the fields to change it.
 */
function vocabularyPage(v: AppView): HTMLElement[] {
  const s = v.settings
  const wordOf = (line: string) => parseEntry(line).word.toLowerCase()
  const word = liveField('word', t('vocab.wordPlaceholder'), t('vocab.wordAria'), key => (key === 'Enter' ? add() : clear()))
  const heard = liveField('heard', t('vocab.heardPlaceholder'), t('vocab.heardAria'), key => (key === 'Enter' ? add() : clear()))
  const clear = () => {
    word.value = ''
    heard.value = ''
    word.focus()
  }
  const add = () => {
    const w = word.value.replace(/\s+/g, ' ').trim()
    const h = heard.value.replace(/\s+/g, ' ').replace(/[()]/g, '').trim()
    if (!w) return word.focus()
    const line = h ? `${w} (${h})` : w
    if (!parseEntry(line).word) return
    // The same word again is the person correcting it: the new line replaces the old.
    const lines = (view?.settings.vocabulary ?? s.vocabulary).filter(l => wordOf(l) !== w.toLowerCase())
    clear()
    save({ vocabulary: [...lines, line] })
  }
  const edit = (line: string) => {
    const { word: w, heard: hs } = parseEntry(line)
    word.value = w
    heard.value = hs.join(', ')
    word.focus()
  }
  const items = s.vocabulary.map(line => {
    const { word: w, heard: hs } = parseEntry(line)
    return el(
      'div',
      { class: 'row' },
      el('button', { class: 'l', title: t('vocab.change'), onclick: () => edit(line) }, w, hs.length ? el('small', {}, t('vocab.heardAs', { forms: hs.join(', ') })) : null),
      ib('x', t('vocab.remove', { word: w }), () => save({ vocabulary: (view?.settings.vocabulary ?? s.vocabulary).filter(l => l !== line) })),
    )
  })
  return [
    grp(t('vocab.addGroup')),
    el(
      'div',
      { class: 'row add' },
      el('div', { class: 'fields' }, word, heard, btn([lucide('plus', 's'), t('vocab.add')], add, 'primary')),
      el('small', {}, t('vocab.addNote')),
    ),
    grp(t('vocab.words'), items.length || undefined, items.length ? linkBtn(t('vocab.clearAll'), () => save({ vocabulary: [] })) : null),
    ...(items.length ? items : [aside('info', t('vocab.empty'))]),
    aside('info', t('vocab.shared')),
  ]
}

/** The phrases typed lately (dictationlog.ts), each to copy; Krya forgets them after 30 days by itself. */
function recentPage(v: AppView): HTMLElement[] {
  const recent = v.dictation.recent
  return [
    grp(t('dictate.phrases'), recent.length || undefined, recent.length ? linkBtn(t('mistakes.clear'), () => post({ type: 'clearDictation' })) : null),
    ...(recent.length
      ? recent.map(e =>
          el(
            'div',
            { class: 'row phrase' },
            el('div', { class: 'l' }, el('span', { class: 'said', title: e.heard ? `${e.text}\n\n${t('dictate.said', { heard: e.heard })}` : e.text }, e.text), el('small', {}, whenSaid(e.at, Date.now()))),
            linkBtn(t('common.copy'), () => copyText(e.text)),
          ),
        )
      : [aside('info', t('dictate.recentEmpty'))]),
  ]
}

/** "12:41" today, "yesterday 18:02", else "26 Oct 18:02". */
function whenSaid(iso: string, now: number): string {
  const at = new Date(iso)
  const time = formatDate(at, { hour: '2-digit', minute: '2-digit' })
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const days = Math.round((day(new Date(now)) - day(at)) / 86_400_000)
  if (days === 0) return time
  if (days === 1) return t('dictate.yesterdayAt', { time })
  return `${formatDate(at, { day: 'numeric', month: 'short' })} ${time}`
}

const copyText = (text: string) => void window.tutorHost.call({ call: 'copy', text }).then(() => toast(t('dictate.copiedText', { text })), fault)

/** "just now", "4 min ago", "2 h ago", "yesterday", "26 Oct": a moment, as of now. */
function ago(epochSeconds: number): string {
  const s = Math.max(0, Date.now() / 1000 - epochSeconds)
  if (s < 90) return t('dictate.justNow')
  if (s < 3600) return t('dictate.minAgo', { n: Math.round(s / 60) })
  if (s < 86_400) return t('dictate.hAgo', { n: Math.round(s / 3600) })
  if (s < 2 * 86_400) return t('dictate.yesterday')
  return formatDate(new Date(epochSeconds * 1000), { day: 'numeric', month: 'short' })
}

/**
 * Chrome's own page: Krya opens a new Chrome window and types the address into it. When the window did not
 * come to the front, or there is no Chrome, the address is copied for the person to paste.
 */
function openChrome(url: string): void {
  void window.tutorHost.call({ call: 'openChrome', url }).then(opened => {
    if (opened === 'typed') return
    const say = opened === 'opened' ? t('meet.chromeOpen') : t('meet.noChrome')
    void window.tutorHost.call({ call: 'copy', text: url }).then(() => toast(say), fault)
  }, fault)
}

/** The extension as the engine last saw it: it says hello when Chrome starts it, and every quarter of an hour. */
const extensionSeen = (v: AppView) => v.speech.health?.extension ?? null

/** 0.2.0 before 0.2.1: the version parts compared as numbers. */
function olderVersion(a: string, b: string): boolean {
  const x = a.split('.').map(Number)
  const y = b.split('.').map(Number)
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] || 0) - (y[i] || 0)
    if (d) return d < 0
  }
  return false
}

/** Chrome runs an older copy of the extension than the one in Krya's folder: Reload brings the new one in. */
const extensionStale = (v: AppView) => {
  const ext = extensionSeen(v)
  return !!ext && !!v.speech.extensionShipped && olderVersion(ext.version, v.speech.extensionShipped)
}

/** The first version with a fixed id (the manifest's key, engine/auth.py): an older copy is refused, and Reload cannot help. */
const FIXED_ID_SINCE = '0.4.0'
/** Chrome runs a copy from before the fixed id: it must be removed and loaded again. */
const extensionReload = (v: AppView) => {
  const ext = extensionSeen(v)
  return !!ext && olderVersion(ext.version, FIXED_ID_SINCE)
}

/** The extensions page, at Krya's own card when Chrome has told its id. */
const extensionsPage = (v: AppView) => {
  const id = extensionSeen(v)?.id
  return id && /^[a-p]{32}$/.test(id) ? `chrome://extensions/?id=${id}` : 'chrome://extensions/'
}

/** The card that opens the Google Meet page: whether the extension is in Chrome. */
function meetCard(v: AppView): HTMLElement {
  const ext = extensionSeen(v)
  const stale = extensionStale(v)
  const value = !ext
    ? t('meet.setUp')
    : extensionReload(v)
      ? t('meet.loadAgain', { from: ext.version, to: v.speech.extensionShipped ?? '' })
      : stale
        ? t('meet.reload', { from: ext.version, to: v.speech.extensionShipped ?? '' })
        : t('meet.installed', { version: ext.version })
  return navCard('video', 'Google Meet', t('meet.note'), value, () => openSub('meet'), 'meet', !!ext && !stale)
}

/** How to record a Google Meet call: the Chrome extension, loaded from Krya's folder, and whether it is there. */
function meetPage(v: AppView): HTMLElement[] {
  const dir = v.speech.extensionDir
  const ext = extensionSeen(v)
  const offer = engineRows(v, 'Google Meet')
  const status = !ext
    ? card('video', t('meet.notSetUp'), [running(v) ? t('meet.threeSteps') : t('meet.needsEngine')], null)
    : extensionReload(v)
      ? card(
          'rotate-cw',
          t('meet.oldId', { version: ext.version }),
          [t('meet.oldIdNote')],
          btn(t('meet.openInChrome'), () => openChrome('chrome://extensions/'), 'primary'),
        )
      : extensionStale(v)
      ? card('rotate-cw', t('meet.stale', { from: ext.version, to: v.speech.extensionShipped ?? '' }), [t('meet.staleNote')], btn(t('meet.openInChrome'), () => openChrome(extensionsPage(v)), 'primary'))
      : card('circle-check', t('meet.installedIn', { version: ext.version }), [el('small', { class: 'ok' }, t('meet.seen', { ago: ago(ext.seen) }))], caps(MEET_KEY))
  return [
    ...(offer.length ? [grp(t('dictate.engine')), ...offer] : []),
    grp(t('meet.extension')),
    status,
    grp(t('meet.setItUp')),
    card('external-link', t('meet.step1'), [t('meet.step1Note')], btn(t('meet.openInChrome'), () => openChrome('chrome://extensions/'))),
    card(
      'folder',
      t('meet.step2'),
      [pathNote(dir), t('meet.step2Note')],
      el('span', { class: 'kchg' }, linkBtn(t('meet.showFolder'), () => post({ type: 'showInFolder', path: dir })), btn([lucide('copy', 's'), t('meet.copyPath')], () => copyText(dir), 'primary')),
    ),
    card('mic', t('meet.step3'), [t('meet.step3Note')], caps(MEET_KEY)),
    grp(t('meet.off')),
    card('keyboard', t('meet.keyNothing'), [t('meet.keyNothingNote')], btn(t('meet.openInChrome'), () => openChrome('chrome://extensions/shortcuts'))),
    card('rotate-cw', t('meet.afterUpdate'), [t('meet.afterUpdateNote')], btn(t('meet.openInChrome'), () => openChrome(extensionsPage(v)))),
  ].filter((n): n is HTMLElement => n !== null)
}

/** The card that opens who spoke when: where it runs, whether it is here, its model's state; `quiet` (Models): where it runs, grey like the other actions, a problem still named. */
function speakersCard(v: AppView, open = () => openSub('speakers'), quiet = false): HTMLElement | null {
  if (!installed(v)) return null
  const s = v.speech
  const title = t('transcribe.speakers')
  const note = t('transcribe.speakersNote')
  const work = s.pack.status === 'installing' && s.pack.installing?.includes('speakers')
  if (work) return navCard('users', title, note, t('transcribe.downloading'), open, 'speakers')
  if (!hasPart(v, 'speakers')) {
    const sz = s.speakers.sizes[s.speakers.on]
    return navCard('users', title, note, t('transcribe.notInstalled', { size: speechSize(sz.download) }), open, 'speakers')
  }
  const onCard = (s.pack.speakersOn ?? 'cpu') === 'cuda'
  const onDevice = t(onCard ? 'transcribe.onCard' : 'transcribe.onCpu')
  if (!running(v)) return navCard('users', title, note, onDevice, open, 'speakers')
  const state = diarizationOf(v)
  const STATES: Record<typeof state, [string, boolean]> = {
    ready: [t('transcribe.ready'), true],
    missing: [t('transcribe.keySaved'), true],
    checking: [t('transcribe.checking'), false],
    downloading: [t('transcribe.downloading'), false],
    'needs-token': [t('transcribe.needsKey'), false],
    'bad-token': [t('transcribe.keyFailed'), false],
    'no-access': [t('transcribe.noAccess'), false],
    failed: [t('transcribe.couldNotCheck'), false],
  }
  const [value, ok] = STATES[state]
  if (quiet) return navCard('users', title, note, ok ? onDevice : value, open, 'speakers')
  return navCard('users', title, note, ok ? `${value} · ${t(onCard ? 'busy.card' : 'busy.processor')}` : value, open, 'speakers', ok)
}

function transcribePage(v: AppView): HTMLElement[] {
  const offer = engineRows(v, 'Transcribe')
  const dataDir = v.speech.health?.dataDir
  return [
    ...(offer.length ? [grp(t('dictate.engine')), ...offer] : []),
    testOffer(v),
    ...(running(v) ? [grp(t('transcribe.new')), ...newRows(v)] : []),
    grp(t('transcribe.setup')),
    speakersCard(v),
    vocabularyCard(v),
    meetCard(v),
    modelCard(v, 'transcripts'),
    dataDir ? card('folder', t('transcribe.keptIn'), [pathNote(dataDir)], linkBtn(t('tray.open'), () => post({ type: 'openPath', path: dataDir }))) : null,
    grp(t('transcribe.library')),
    navCard('file-text', t('tray.transcripts'), t('transcribe.allNote'), null, () => go('transcripts')),
  ].filter((n): n is HTMLElement => n !== null)
}

/** Windows' layouts in the order the keys go through them: each moved earlier or later, left out, another added. */
function layoutsPage(v: AppView): HTMLElement[] {
  const cycle = cycleOf(v)
  const ids = cycle.map(l => l.id)
  const rest = v.layouts.filter(l => !ids.includes(l.id))
  const own = v.settings.layouts.length > 0
  const move = (id: string, to: number) => {
    const next = ids.filter(x => x !== id)
    next.splice(to, 0, id)
    save({ layouts: next })
  }
  return [
    grp(t('kb.inOrder'), cycle.length),
    ...cycle.map((l, i) =>
      card(
        'keyboard',
        `${i + 1} · ${l.name}`,
        [l.short],
        el(
          'span',
          { class: 'kchg' },
          ib('arrow-up', t('kb.earlier'), () => move(l.id, i - 1), i === 0),
          ib('arrow-down', t('kb.later'), () => move(l.id, i + 1), i === ids.length - 1),
          // The last one left cannot go: the keys need a layout to go to.
          linkBtn(t('kb.leaveOut'), () => save({ layouts: ids.filter(id => id !== l.id) }), ids.length === 1),
        ),
      ),
    ),
    rest.length
      ? card(
          'plus',
          t('kb.addLayout'),
          [t('kb.addLayoutNote')],
          select<string>('', [['', t('kb.pickLayout')], ...rest.map((l): [string, string] => [l.id, l.name])], id => id && save({ layouts: [...ids, id] })),
        )
      : null,
    aside('info', own ? t('kb.ownOrder') : t('kb.orderFromLanguages')),
    grp(t('kb.ownKey')),
    ...cycle.map(l => layoutKeyRow(l, l.name, [t('kb.straight')])),
  ].filter((n): n is HTMLElement => n !== null)
}

/** A switch's sound, heard here: English's note, then another layout's (the keyboard thread plays them as you switch). */
function hearSwitch(name: string): void {
  for (const [note, at] of [[1, 0], [2, 320]] as const) {
    setTimeout(() => void new Audio(`switch/${name}-${note}.wav`).play().catch(() => undefined), at)
  }
}

/** What fixing as one types also sets right, and how. */
function fixingPage(v: AppView): HTMLElement[] {
  const s = v.settings
  return [
    grp(t('kb.capitals')),
    toggleCard('type', t('kb.twoCaps'), s.fixTwoCaps, fixTwoCaps => save({ fixTwoCaps }), t('kb.twoCapsNote')),
    toggleCard('type', t('kb.capsLock'), s.fixCapsLock, fixCapsLock => save({ fixCapsLock }), t('kb.capsLockNote')),
    toggleCard('lock', t('kb.keepCaps'), s.keepCaps, keepCaps => save({ keepCaps }), t('kb.keepCapsNote')),
    grp(t('kb.when')),
    toggleCard('clock', t('kb.onPause'), s.fixOnPause, fixOnPause => save({ fixOnPause }), t('kb.onPauseNote')),
    toggleCard('volume-2', t('kb.sound'), s.fixSound, fixSound => save({ fixSound })),
    aside('info', t('kb.shortWords')),
  ]
}

/** The programs with parts of the keyboard helper left out, or a layout of their own: one card each, opening its page. */
function programsPage(v: AppView): HTMLElement[] {
  const s = v.settings
  const apps = () => view?.settings.apps ?? s.apps
  const add = (exe: string) => {
    if (!apps().some(a => a.exe === exe)) save({ apps: [...apps(), { exe, off: ['fix'], layout: '' }] })
  }
  const known = new Set(s.apps.map(a => a.exe))
  const running = runningApps.filter(exe => !known.has(exe))
  const suggest = v.lastApp && !known.has(v.lastApp) ? v.lastApp : ''
  const addTyped = (field: HTMLInputElement) => {
    const name = field.value.trim().toLowerCase()
    field.value = ''
    if (name) add(/\.exe$/.test(name) ? name : `${name}.exe`)
  }
  const field = liveField('add', 'program.exe', t('kb.addProgram'), (key, f) => (key === 'Enter' ? addTyped(f) : ((f.value = ''), f.blur())))
  return [
    grp(t('kb.addProgram')),
    el(
      'div',
      { class: 'row add' },
      el('div', { class: 'fields' }, field, btn([lucide('plus', 's'), t('vocab.add')], () => addTyped(field), 'primary')),
      el('small', {}, t('kb.addProgramNote')),
    ),
    suggest ? card('plus', t('kb.addThis', { exe: suggest }), [t('kb.addThisNote')], btn(t('vocab.add'), () => add(suggest))) : null,
    running.length
      ? card(
          'plus',
          t('kb.addRunning'),
          [t('kb.addRunningNote')],
          select<string>('', [['', t('kb.pickProgram')], ...running.map((exe): [string, string] => [exe, exe])], exe => exe && add(exe)),
        )
      : null,
    grp(t('kb.programs'), s.apps.length || undefined),
    ...(s.apps.length
      ? s.apps.map(a =>
          navCard(
            'monitor',
            a.exe,
            programNote(v, a),
            null,
            () => {
              programOpen = a.exe
              go('programs', 'program')
            },
            `program-${a.exe}`,
          ),
        )
      : [aside('info', t('kb.programsEmpty'))]),
  ].filter((n): n is HTMLElement => n !== null)
}

const APP_PART_NAMES: Record<AppPart, string> = { fix: t('kb.partFix'), switch: t('kb.partSwitch'), badge: t('kb.partBadge'), keys: t('kb.partKeys') }

/** What a program's rule does, in a few words. */
function programNote(v: AppView, a: AppRule): string {
  const off = a.off.length ? t('kb.leftOut', { parts: a.off.map(p => APP_PART_NAMES[p]).join(', ') }) : ''
  const layout = a.layout ? t('kb.startsIn', { layout: v.layouts.find(l => l.id === a.layout)?.name ?? a.layout }) : ''
  return [off, layout].filter(Boolean).join(' · ') || t('kb.nothingLeftOut')
}

/** One program: the parts left out there, its own layout, or out of the list. */
function programPage(v: AppView): HTMLElement[] {
  const rule = v.settings.apps.find(a => a.exe === programOpen)
  if (!rule) return [aside('info', t('kb.noLonger'))]
  const apps = () => view?.settings.apps ?? v.settings.apps
  const change = (next: Partial<AppRule>) => save({ apps: apps().map(a => (a.exe === rule.exe ? { ...a, ...next } : a)) })
  const part = (p: AppPart, iconName: LucideName, label: string, note: string) =>
    toggleCard(iconName, label, !rule.off.includes(p), on => change({ off: on ? rule.off.filter(x => x !== p) : [...rule.off, p] }), note)
  return [
    grp(t('kb.hereKrya')),
    part('fix', 'spell-check', t('kb.fixes'), t('kb.fixesNote')),
    part('switch', 'keyboard', t('kb.switches'), t('kb.switchesNote')),
    part('badge', 'type', t('kb.shows'), t('kb.partBadge')),
    part('keys', 'circle-alert', t('kb.hears'), t('kb.hearsNote')),
    grp(t('kb.layout')),
    card(
      'globe',
      t('kb.startsInTitle'),
      [t('kb.startsInNote')],
      select<string>(rule.layout, [['', t('kb.asItWas')], ...v.layouts.map((l): [string, string] => [l.id, l.name])], layout => change({ layout })),
    ),
    card(
      'trash-2',
      t('kb.outOfList'),
      [t('kb.outOfListNote')],
      linkBtn(t('kb.remove'), () => {
        save({ apps: apps().filter(a => a.exe !== rule.exe) })
        back()
      }),
    ),
  ]
}

/** What Krya learned from the person's typing: words it fixes always, words of theirs; each can go, or everything. */
function learnedPage(v: AppView): HTMLElement[] {
  const { alwaysFix, myWords } = v.learned
  const name = (code: string) => languageName(code)
  const item = (list: 'alwaysFix' | 'myWords', w: { word: string; lang: string }, note: string) =>
    card(list === 'alwaysFix' ? 'wand-sparkles' : 'book-open', w.word, [note], ib('x', t('kb.forget', { word: w.word }), () => post({ type: 'unlearn', list, word: w.word })))
  return [
    toggleCard('sparkles', t('kb.learn'), v.settings.learn, learn => save({ learn }), t('kb.learnNote')),
    grp(t('kb.fixedAlways'), alwaysFix.length || undefined),
    ...(alwaysFix.length ? alwaysFix.map(w => item('alwaysFix', w, t('kb.into', { lang: name(w.lang) }))) : [aside('info', t('kb.fixedAlwaysEmpty'))]),
    grp(t('tray.yourWords'), myWords.length || undefined),
    ...(myWords.length ? myWords.map(w => item('myWords', w, t('kb.myWordNote', { lang: name(w.lang) }))) : [aside('info', t('kb.myWordsEmpty'))]),
    grp(t('kb.neverFixed')),
    navCard('lock', t('kb.kept'), t('kb.keptNote'), String(v.settings.keepWords.length || t('kb.none')), () => go('kept'), 'kept'),
    alwaysFix.length || myWords.length
      ? card('trash-2', t('kb.forgetAll'), [t('kb.forgetAllNote')], linkBtn(t('kb.forgetBtn'), () => post({ type: 'forgetLearned' })))
      : null,
  ].filter((n): n is HTMLElement => n !== null)
}

/** Words never fixed by themselves: the fix key right after a fix adds one, and so can the person, before the fix ever happens. */
function keptPage(v: AppView): HTMLElement[] {
  const s = v.settings
  const words = () => view?.settings.keepWords ?? s.keepWords
  return listPage({
    label: t('vocab.addGroup'),
    placeholder: t('kb.keptPlaceholder'),
    note: t('kb.keptAddNote'),
    items: s.keepWords,
    count: t('vocab.words'),
    empty: t('kb.keptEmpty'),
    normalize: keptForm,
    add: word => save({ keepWords: [...words(), word] }),
    remove: word => save({ keepWords: words().filter(w => w !== word) }),
  })
}

/** Other programs at the keyboard, named calmly: no harm, so the person knows who else is there. */
function othersLine(v: AppView): HTMLElement | null {
  const text = v.keyboardApps.length
    ? [t('kb.alsoUsing', { apps: v.keyboardApps.join(', ') }), v.foreignKeys ? t('kb.oneOfThem') : ''].filter(Boolean).join(' ')
    : v.foreignKeys
      ? t('kb.aProgram')
      : ''
  return text ? aside('info', text) : null
}

/** The programs with a window open now, asked of main for the Programs page; it is drawn again with them. */
function askRunningApps(): void {
  void window.tutorHost.call({ call: 'runningApps' }).then(list => {
    runningApps = Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : []
    if (open?.name === 'programs' && !open.sub) renderBody()
  }, fault)
}

function keyboardPage(v: AppView): HTMLElement[] {
  const s = v.settings
  const sample = sampleOf(s.native)
  const [typed = '', fixed = ''] = [sample.typed.split(' ')[0], sample.fixed.split(' ')[0]]
  const ownKeys = Object.keys(s.layoutKeys).length
  const learnedCount = v.learned.alwaysFix.length + v.learned.myWords.length
  const onOff = (on: boolean, key: 'switchOn' | 'fixKeyOn', label: string, has: boolean) => (has ? el('span', { class: 'tgwrap' }, toggleKnob(on, next => save({ [key]: next }), label)) : null)
  return [
    grp(t('talkPage.keys')),
    keyRow(
      'switchKey',
      t('kb.switchKey'),
      s.switchKey && isTap(s.switchKey) ? t('kb.switchTap') : t('kb.switchNote'),
      false,
      'keyboard',
      onOff(s.switchOn, 'switchOn', t('kb.switchingByKeys'), !!s.switchKey || ownKeys > 0),
    ),
    keyRow('fixKey', t('kb.fixKey'), t('kb.fixKeyNote'), false, 'rotate-cw', onOff(s.fixKeyOn, 'fixKeyOn', t('kb.theFixKey'), !!s.fixKey)),
    grp(t('kb.asYouType')),
    toggleCard('spell-check', t('kb.autoFix'), s.autoFix, autoFix => save({ autoFix }), t('kb.autoFixNote', { typed, fixed })),
    s.autoFix ? navCard('type', t('kb.fixing'), t('kb.fixingNote'), null, () => openSub('fixing'), 'fixing') : null,
    toggleCard('type', t('tray.layoutBadge'), s.layoutBadge, layoutBadge => save({ layoutBadge }), t('kb.badgeNote')),
    toggleCard('keyboard', t('tray.trayLayout'), s.trayLayout, trayLayout => save({ trayLayout }), t('kb.trayNote')),
    toggleCard('volume-2', t('kb.chime'), s.switchSound, switchSound => (switchSound && hearSwitch(s.switchSoundName), save({ switchSound })), t('kb.chimeNote')),
    s.switchSound
      ? card(
          'volume-2',
          t('kb.chimeName'),
          [t('kb.chimePick')],
          seg(
            s.switchSoundName,
            SWITCH_SOUNDS.map(n => [n, t(`kb.chime.${n}`)]),
            switchSoundName => (hearSwitch(switchSoundName), save({ switchSoundName })),
          ),
        )
      : null,
    toggleCard('monitor', t('kb.fullScreen'), s.quietFullScreen, quietFullScreen => save({ quietFullScreen }), t('kb.fullScreenNote')),
    grp(t('kb.lists')),
    navCard('keyboard', t('kb.layouts'), ownKeys ? t('kb.layoutsOwn', { n: ownKeys }) : t('kb.layoutsNote'), cycleOf(v).map(l => l.short).join(' · '), () => go('layouts'), 'layouts'),
    navCard('monitor', t('kb.programs'), t('kb.programsNote'), s.apps.length ? t('kb.programCount', { n: s.apps.length }) : t('kb.none'), () => go('programs'), 'programs'),
    navCard('sparkles', t('kb.learned'), s.learn ? t('kb.learnedNote') : t('kb.learnedOff'), learnedCount ? t('backup.words', { n: learnedCount }) : t('kb.none'), () => go('learned'), 'learned'),
    navCard('lock', t('kb.kept'), t('kb.keptNever'), s.keepWords.length ? t('backup.words', { n: s.keepWords.length }) : t('kb.none'), () => go('kept'), 'kept'),
    v.rivals.length ? warn(t('kb.rivals', { n: v.rivals.length, names: v.rivals.join(` ${t('common.and')} `) })) : null,
    v.elevatedApp ? warn(t('kb.elevated', { app: v.elevatedApp })) : null,
    v.keyboardTrouble ? warn(t('kb.trouble', { trouble: v.keyboardTrouble })) : null,
    othersLine(v),
    el('p', { class: 'privacy' }, lucide('lock', 's'), t('kb.privacy')),
  ].filter((n): n is HTMLElement => n !== null)
}

// ---------------------------------------------------------------- words

const matches = (w: SavedWord, q: string) => `${w.word} ${w.base} ${w.sentence} ${w.senses.map(s => s[1]).join(' ')}`.toLowerCase().includes(q)

function dateOf(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const now = new Date()
  if (d.toDateString() === now.toDateString()) return t('words.today')
  return d.toLocaleDateString(uiLanguage() === 'en' ? 'en-US' : uiLanguage(), d.getFullYear() === now.getFullYear() ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' })
}

/** The sentence, with the word as it was met in it marked. */
function sentenceOf(w: SavedWord): HTMLElement {
  const at = w.word ? w.sentence.toLowerCase().indexOf(w.word.toLowerCase()) : -1
  if (at < 0) return el('div', { class: 'ws' }, w.sentence)
  return el('div', { class: 'ws' }, w.sentence.slice(0, at), el('mark', {}, w.sentence.slice(at, at + w.word.length)), w.sentence.slice(at + w.word.length))
}

function wordRow(w: SavedWord): HTMLElement {
  const senses = w.senses.map(([, s]) => s).join('; ')
  const full = w.senses.map(([pos, s]) => (pos ? `${pos}: ${s}` : s)).join('\n')
  return el(
    'li',
    { class: 'wi' },
    el(
      'div',
      { class: 'wh' },
      el('b', {}, w.base),
      w.word.toLowerCase() !== w.base.toLowerCase() ? el('span', { class: 'form' }, t('word.from', { word: w.word })) : null,
      el('span', { class: 'tr', title: full }, senses),
    ),
    w.sentence ? sentenceOf(w) : null,
    el(
      'div',
      { class: 'wr' },
      el('button', { class: 'star', title: t('word.remove'), 'aria-label': t('words.removeAria', { word: w.base }), onclick: () => post({ type: 'removeWord', id: w.id }) }, icon('star-full')),
      el('span', { class: 'd' }, dateOf(w.addedAt)),
    ),
  )
}

function wordsPage(v: AppView): HTMLElement[] {
  const list = el('ul', { class: 'wl' })
  const fill = () => {
    // The newest words: this list may outlive the message it was drawn from.
    const words = view?.words ?? v.words
    const q = search.trim().toLowerCase()
    const shown = q ? words.filter(w => matches(w, q)) : words
    list.replaceChildren(
      ...(shown.length ? shown.map(wordRow) : [el('li', { class: 'empty' }, words.length ? t('words.noSuch') : t('words.empty'))]),
    )
  }
  fill()
  const none = v.words.length === 0
  return [
    el(
      'div',
      { class: 'tools' },
      el(
        'label',
        { class: 'search' },
        icon('search'),
        el('input', {
          type: 'search',
          placeholder: t('words.search'),
          value: search,
          oninput: event => {
            search = (event.target as HTMLInputElement).value
            fill()
          },
        }),
      ),
      el('button', { class: 'btn', disabled: none, onclick: () => post({ type: 'exportWords' }) }, icon('export'), t('words.export')),
      el('button', { class: 'btn', disabled: none, onclick: () => post({ type: 'copyWords' }) }, icon('copy'), t('common.copy')),
    ),
    list,
  ]
}

// ---------------------------------------------------------------- settings

function voiceOptions(v: AppView): [string, string][] {
  const options: [string, string][] = [['', t('settings.automatic')]]
  if (v.natural.status === 'ready') for (const voice of NATURAL_VOICES) options.push([NATURAL_PREFIX + voice.id, naturalLabel(voice)])
  for (const h of v.hostVoices) if (/^en\b/i.test(h.lang)) options.push([h.name, h.name])
  return options
}

/** The natural voice when it is not here yet: its download, its progress, or why it failed. */
function naturalRow(v: AppView): HTMLElement | null {
  const n = v.natural
  const download = (text: string) => linkBtn(text, () => post({ type: 'downloadNatural' }))
  switch (n.status) {
    case 'absent':
      return row(t('settings.natural'), [t('settings.naturalNote', { size: n.size })], download(t('settings.download')))
    case 'failed':
      return row(t('settings.natural'), [bad(t('settings.downloadFailed'))], download(t('common.tryAgain')))
    case 'downloading': {
      const bar = el('i', { class: 'fill' })
      bar.style.width = `${Math.round(n.progress * 100)}%`
      return row(t('settings.natural'), [el('span', { class: 'bar' }, bar)], el('span', { class: 'pct' }, `${Math.round(n.progress * 100)}%`))
    }
    default:
      return null
  }
}

/** Each part of the Storage page in plain words, the program's name in brackets at the end. */
const STORED: Record<StorageId, { title: string; note: string }> = {
  fast: { title: t('storage.fast'), note: t('storage.fastNote') },
  dict: { title: t('storage.dict'), note: t('storage.dictNote') },
  voice: { title: t('settings.natural'), note: t('storage.voiceNote') },
  accurate: { title: levelName('accurate'), note: t('storage.llmNote', { model: 'Gemma 4 E4B' }) },
  most: { title: levelName('most'), note: t('storage.llmNote', { model: 'Gemma 4 12B' }) },
  unused: { title: t('storage.unused'), note: t('storage.unusedNote') },
  llama: { title: t('storage.llama'), note: t('storage.llamaNote', { a: levelName('accurate'), b: levelName('most') }) },
  speechModel: { title: t('dictate.speechModel'), note: t('storage.speechModelNote') },
  speech: { title: t('storage.speech'), note: t('storage.speechNote') },
  gpu: { title: t('storage.gpu'), note: t('storage.gpuNote') },
  speakers: { title: t('transcribe.speakers'), note: t('storage.speakersNote') },
  yours: { title: t('storage.yours'), note: t('storage.yoursNote') },
  transcripts: { title: t('tray.transcripts'), note: t('storage.transcriptsNote') },
}

/** The models and voices, and the programs that run them: everything Krya downloads, in its one folder. */
const MODEL_PARTS: readonly StorageId[] = ['fast', 'dict', 'voice', 'accurate', 'most', 'unused', 'speechModel']
const PROGRAM_PARTS: readonly StorageId[] = ['llama', 'speech', 'gpu', 'speakers']
const DOWNLOADED: readonly StorageId[] = [...MODEL_PARTS, ...PROGRAM_PARTS]
const downloadsMb = (s: StorageView) => s.parts.filter(p => DOWNLOADED.includes(p.id)).reduce((mb, p) => mb + p.bytes / 1e6, 0)

/** A speech model's own name and what it is like, from the plan. */
const speechChoice = (v: AppView, name: string) => [...v.speech.plan.dictation.choices, ...v.speech.plan.transcripts.choices].find(c => c.model === name)

/** A part by name: a language's or a model's own. */
function storedName(v: AppView, p: StoragePart): string {
  const title = STORED[p.id].title
  if ((p.id === 'fast' || p.id === 'dict') && p.item) return `${title} · ${languageName(p.item)}`
  if (p.id === 'speechModel') return speechChoice(v, p.item ?? '')?.label ?? p.item ?? title
  if (p.id === 'llama' && p.item === 'cuda') return `${title} · NVIDIA`
  return title
}

/** What a part is, on its line. */
function storedNote(v: AppView, p: StoragePart): string {
  if (p.id === 'speechModel') {
    const choice = speechChoice(v, p.item ?? '')
    return t('storage.speechToText', { about: choice ? aboutOf(choice) : STORED.speechModel.note })
  }
  if (p.id === 'llama' && p.item === 'cuda') return t('storage.cudaNote')
  return STORED[p.id].note
}

/** What goes when a part something uses is removed, said on its line before it is. */
function lossOf(p: StoragePart): string {
  switch (p.id) {
    case 'accurate':
    case 'most':
      return p.users?.includes('Translate') ? t('storage.lossTranslate') : t('storage.lossCheck')
    case 'speech':
      return t('storage.lossSpeech')
    case 'gpu':
      return t('storage.lossGpu')
    case 'speakers':
      return t('storage.lossSpeakers')
    default:
      return t('storage.lossDefault')
  }
}

/** A part that can go now: none while it downloads or the engine installs; never a speech model the engine plans (it refuses those). */
function removable(v: AppView, p: StoragePart): boolean {
  const pack = v.speech.pack.status === 'installing' || v.speech.pack.status === 'removing'
  const live = (name?: string) => [v.speech.health?.models.dictation, v.speech.health?.models.transcripts].some(m => !!m && m.name === name && m.state === 'downloading')
  switch (p.id) {
    case 'fast':
      return v.translation.fast.status !== 'downloading'
    case 'dict':
      return v.dictionary.status !== 'downloading'
    case 'voice':
      return v.natural.status !== 'downloading'
    case 'accurate':
    case 'most':
      return v.models[p.id].status !== 'downloading'
    case 'unused':
      return true
    case 'llama':
      return v.models.accurate.status !== 'downloading' && v.models.most.status !== 'downloading'
    case 'speechModel':
      return !p.users?.length && !p.reserve && running(v) && !live(p.item)
    case 'speech':
    case 'gpu':
    case 'speakers':
      return !pack && installed(v)
    default:
      return false
  }
}

/** An action a part serves (storage.ts names them in English, as data), as the page writes it. */
const USER_NAMES: Record<string, string> = { Translate: t('storage.userTranslate'), Listen: t('storage.userListen'), Check: t('storage.userCheck'), Dictate: t('storage.userDictate'), Transcribe: t('storage.userTranscribe') }
const usersText = (names: readonly string[]) => names.map(n => USER_NAMES[n] ?? n).join(` ${t('common.and')} `)

/** A removal tapped once on a part something uses: that part's key, while its line asks. */
let asking = ''

/** One part: what it is, who uses it or "Not used", its size, and × (a part in use asks first). */
function storedLine(v: AppView, p: StoragePart): HTMLElement {
  const key = `${p.id}:${p.item ?? ''}`
  const label = el('span', {}, storedName(v, p), p.unused ? el('span', { class: 'chip unused' }, t('storage.notUsed')) : null)
  const size = el('span', { class: 'v num' }, speechSize(p.bytes / 1e6))
  // A part still outside Krya's folder says where it is.
  const where = p.away ? pathNote(p.path) : null
  if (p.id === 'yours' || p.id === 'transcripts') return row(label, [storedNote(v, p), where], el('span', { class: 'kchg' }, size, linkBtn(t('tray.open'), () => post({ type: 'openPath', path: p.path }))))
  const remove = () => {
    asking = ''
    post({ type: 'removeStored', id: p.id, item: p.item })
  }
  if (asking === key) return row(label, [storedNote(v, p), bad(t('storage.removeAsk', { loss: lossOf(p) }))], el('span', { class: 'kchg' }, size, linkBtn(t('storage.keep'), () => ((asking = ''), renderBody())), btn(t('kb.remove'), remove, 'danger')))
  const used = p.users?.length ? t('storage.usedBy', { users: usersText(p.users) }) : p.reserve ? t('storage.reserve', { reserve: usersText(p.reserve.split(' and ')) }) : null
  // Files the engine shares with a developer's own uv (hard links): there, and not freed by removing it.
  const shared = p.shared / 1e6
  const freed = p.id === 'speech' && shared >= 100 ? t('storage.frees', { free: speechSize(p.bytes / 1e6 - shared), shared: speechSize(shared) }) : null
  const ask = !!p.users?.length || p.id === 'speech'
  const x = removable(v, p) ? ib('x', ask ? t('storage.removeAskTitle') : t('storage.removeTitle'), () => (ask ? ((asking = key), renderBody()) : remove())) : null
  return row(label, [storedNote(v, p), used, freed, where, refusedNote(v, p)], el('span', { class: 'kchg' }, size, x))
}

/** What Krya keeps and how big it is: what nothing uses first, then the models, the programs that run them, and the person's own things. */
function storagePage(v: AppView): HTMLElement[] {
  const s = v.storage
  if (!s?.parts.length) return [aside('loader', t('storage.measuring'))]
  // The biggest first: what takes the space.
  const of = (ids: readonly StorageId[]) => s.parts.filter(p => ids.includes(p.id) && p.bytes > 0).sort((a, b) => b.bytes - a.bytes)
  const models = of(MODEL_PARTS)
  const programs = of(PROGRAM_PARTS)
  const own = s.parts.filter(p => p.id === 'yours' || p.id === 'transcripts')
  const away = [...models, ...programs].some(p => p.away)
  return [
    oldNotice(v, s),
    unusedNotice(v),
    grp(t('storage.downloads')),
    row(
      t('storage.everything', { size: speechSize(downloadsMb(s)) }),
      [t(away ? 'storage.inFolderAway' : 'storage.inFolder', { free: speechSize(s.freeMb), drive: s.drive }), pathNote(s.root)],
      linkBtn(t('storage.openFolder'), () => post({ type: 'openPath', path: s.root })),
    ),
    grp(t('storage.models')),
    ...(models.length ? models.map(p => storedLine(v, p)) : [aside('info', t('storage.nothing'))]),
    ...(programs.length ? [grp(t('storage.programs')), ...programs.map(p => storedLine(v, p))] : []),
    grp(t('storage.yoursGroup')),
    ...own.map(p => storedLine(v, p)),
  ].filter((n): n is HTMLElement => n !== null)
}

/**
 * Parts Krya still uses from outside its folder (the old Altype one, mostly): how much, which, why the last
 * move left them, and Move to Krya, which stops what uses them, moves them and starts Krya again.
 */
function oldNotice(v: AppView, s: StorageView): HTMLElement | null {
  const away = s.parts.filter(p => p.away)
  if (!s.old || !away.length) return null
  const total = speechSize(away.reduce((sum, p) => sum + p.bytes / 1e6, 0))
  const inOld = away.every(p => p.path.toLowerCase().startsWith(s.old!.dir.toLowerCase()))
  const names = away.map(p => storedName(v, p)).join(', ')
  return el(
    'div',
    { class: 'row notice old' },
    lucide('folder'),
    el(
      'div',
      { class: 'l' },
      t(inOld ? 'storage.inOld' : 'storage.outside', { size: total }),
      el('small', {}, t('storage.usesThere', { names })),
      s.old.why ? el('small', { class: 'bad' }, t('storage.notMoved', { why: s.old.why })) : null,
    ),
    s.old.moving ? el('span', { class: 'v' }, t('storage.moving')) : btn(t('storage.move'), () => post({ type: 'moveToKrya' }), 'primary'),
  )
}

/** A language's name in the interface's language, by its code or English name. */
const languageName = (code: string) => langName(code)

/** The card that opens the languages the person uses: their names. */
function languagesCard(v: AppView): HTMLElement {
  return navCard('globe', t('settings.languages'), t('settings.languagesNote'), myLanguages(v.settings).map(languageName).join(', '), () => go('settings', 'languages'), 'languages')
}

/** The languages the person uses: their own and English always, others added; what dictation, the translator and the screen's text are read as. */
function languagesPage(v: AppView): HTMLElement[] {
  const s = v.settings
  const used = myLanguages(s)
  const rest = LANGUAGES.filter(l => !used.includes(l.code))
  const mine = () => view?.settings.languages ?? s.languages
  return [
    grp(t('settings.addLanguage')),
    card(
      'plus',
      t('settings.addLanguage'),
      [t('settings.addLanguageNote')],
      select<string>('', [['', t('settings.pickLanguage')], ...rest.map((l): [string, string] => [l.code, `${languageName(l.code)} · ${l.native}`])], code => code && save({ languages: [...mine(), code] })),
    ),
    grp(t('settings.languagesGroup'), used.length),
    card('globe', languageName(used[0] ?? ''), [t('settings.yourLangNote')], null),
    card('globe', languageName('en'), [t('settings.englishNote')], null),
    ...s.languages.map(code => card('globe', languageName(code), [], ib('x', t('vocab.remove', { word: languageName(code) }), () => save({ languages: mine().filter(c => c !== code) })))),
  ]
}

/** How fast Listen reads. */
function speedCard(v: AppView): HTMLElement {
  const s = v.settings
  return card(
    'play',
    t('settings.speed'),
    [t('settings.speedNote')],
    seg(
      s.rate,
      RATES.map(r => [r, String(r)]),
      rate => save({ rate }),
      true,
    ),
  )
}

/** The voice in a few words, for Listen's line to the Models page. */
function voiceValue(v: AppView): string {
  const n = v.natural
  if (n.status === 'downloading') return t('settings.naturalDownloading', { pct: Math.round(n.progress * 100) })
  if (v.settings.voice === '') return t(naturalOn(v) ? 'settings.autoNatural' : 'settings.autoWindows')
  return voiceOptions(v).find(([value]) => value === v.settings.voice)?.[1] ?? t('settings.automatic')
}

function settingsPage(v: AppView): HTMLElement[] {
  const s = v.settings
  return [
    grp(t('settings.language')),
    uiLanguageCard(s.uiLanguage, uiLanguage => save({ uiLanguage })),
    card(
      'languages',
      t('settings.yourLanguage'),
      [t('settings.yourLanguageNote')],
      select(
        s.native,
        v.languages.map(l => [l.name, `${l.native} · ${languageName(l.name)}`]),
        native => save({ native }),
      ),
    ),
    languagesCard(v),
    grp('Krya'),
    card(
      'monitor',
      t('settings.theme'),
      [],
      seg<ThemeMode>(
        s.theme,
        [
          ['system', t('settings.themeSystem')],
          ['light', t('settings.themeLight')],
          ['dark', t('settings.themeDark')],
        ],
        theme => save({ theme }),
      ),
    ),
    toggleCard('power', t('settings.startWithWindows'), s.startWithWindows, startWithWindows => save({ startWithWindows })),
    toggleCard('pause', t('settings.pause'), s.paused, paused => save({ paused }), t('settings.pauseNote')),
    keyRow('pauseKey', t('settings.pauseKey'), t('settings.pauseKeyNote'), !v.keysOk.pause, 'pause'),
    keyRow('windowKey', t('settings.windowKey'), t('settings.windowKeyNote'), !v.keysOk.window, 'house'),
    card('rotate-ccw', t('settings.resetKeys'), [t('settings.resetKeysNote')], linkBtn(t('main.resetKeys'), () => post({ type: 'resetKeys' }))),
    // New versions are downloaded by hand from GitHub (the owner, 2026-10-30): nothing installs itself.
    card(
      'rotate-cw',
      t(v.dev ? 'settings.versionDev' : 'settings.version', { version: v.version }),
      [v.dev ? t('settings.built', { build: v.build }) : t('settings.versionNote')],
      linkBtn(t('settings.newVersions'), () => post({ type: 'openLink', url: RELEASES })),
    ),
    grp(t('settings.backup')),
    card(
      'file-text',
      t('settings.backupTitle'),
      [t('settings.backupNote')],
      el('span', { class: 'kchg' }, linkBtn(t('settings.export'), () => post({ type: 'exportBackup' })), linkBtn(t('main.import'), () => post({ type: 'importBackup' }))),
    ),
    aside('info', t('settings.importNote')),
    card('rotate-ccw', t('settings.resetAll'), [t('settings.resetAllNote')], linkBtn(t('main.reset'), () => post({ type: 'resetSettings' }))),
  ].filter((n): n is HTMLElement => n !== null)
}

// ---------------------------------------------------------------- about

function aboutPage(v: AppView): HTMLElement[] {
  const fact = (term: string, ...detail: (HTMLElement | string)[]) => [el('dt', {}, term), el('dd', {}, ...detail)]
  return [
    el(
      'div',
      { class: 'about' },
      el('div', { class: 'mk' }, tile(88), logo()),
      el('p', { class: 'tag' }, 'Talk to the duck.'),
      // A run from source says when it was built, so it is never taken for the last release.
      el('p', { class: 'ver' }, v.dev ? t('about.versionDev', { version: v.version, build: v.build }) : t('about.version', { version: v.version })),
      el(
        'dl',
        { class: 'facts' },
        ...fact(t('about.madeBy'), t('about.author'), el('br'), link('https://ikstro.com', 'ikstro.com')),
        ...fact(
          t('about.runsOffline'),
          t('about.credits'),
          el('span', { class: 'q' }, t('about.neverSent')),
        ),
        ...fact(t('about.madeWith'), t('about.madeWithList')),
        ...fact(t('about.online'), t('about.onlineList', { size: v.natural.size })),
        ...fact(
          t('about.links'),
          link(RELEASES, t('about.newVersions')),
          ' · ',
          link('https://github.com/ikstro/krya', t('about.source')),
          ' · ',
          link('https://github.com/ikstro/krya/blob/main/NOTICE', t('about.licenses')),
          ' · ',
          linkBtn(t('report.title'), () => go('report')),
        ),
      ),
    ),
  ]
}

// ---------------------------------------------------------------- report a problem
// The person writes what happened; Krya saves a zip of its logs (report.ts)
// and opens an email or a GitHub issue with the text in it. Nothing is sent
// until they send it.

/** The last report made (its file), or why it could not be, for the line under the buttons. */
let reported: { file?: string; error?: string } | undefined

/** What the person wrote, from the field on the page (a redraw may have carried it over). */
const reportText = () => pBody.querySelector<HTMLTextAreaElement>('textarea[data-live="report"]')?.value ?? ''

function reportPage(v: AppView): HTMLElement[] {
  const send = (via: 'email' | 'github') => {
    reported = undefined
    post({ type: 'reportProblem', via, text: reportText() })
  }
  const field = el('textarea', {
    class: 'field report',
    rows: 6,
    placeholder: t('report.placeholder'),
    'aria-label': t('report.what'),
    'data-live': 'report',
  })
  const file = reported?.file
  return [
    grp(t('report.what')),
    el('div', { class: 'row add' }, field, el('small', {}, t('report.anyLanguage'))),
    grp(t('report.send')),
    row(t('report.email'), [t('report.emailNote', { email: REPORT_EMAIL })], btn([lucide('mail', 's'), t('report.emailBtn')], () => send('email'), 'primary')),
    row(t('report.issue'), [t('report.issueNote')], btn([lucide('external-link', 's'), t('report.issueBtn')], () => send('github'))),
    file ? aside('circle-check', t('report.saved', { file: file.split('\\').pop() ?? file }), linkBtn(t('report.showInFolder'), () => post({ type: 'showInFolder', path: file }))) : null,
    reported?.error ? warn(t('report.failed', { error: reported.error })) : null,
    grp(t('report.holds')),
    row(t('report.log'), [t('report.logNote')]),
    row(t('report.otherLogs'), [t('report.otherLogsNote')]),
    row(t('report.computer'), [t('report.computerNote')]),
    row(t('report.settings'), [t('report.settingsNote')]),
    aside('shield-check', t('report.never')),
    row(t('report.folder'), [t('report.folderNote')], linkBtn(t('tray.open'), () => post({ type: 'openLogs' }))),
    ...(installed(v) ? [grp(t('report.stopped')), restartRow(v)] : []),
  ].filter((n): n is HTMLElement => n !== null)
}

/** The speech engine's restart, for Dictate or Transcribe that stopped answering: its state, why it stopped. */
function restartRow(v: AppView): HTMLElement {
  const sp = v.speech
  const state = { off: t('report.stateOff'), starting: t('report.stateStarting'), ready: t(sp.health?.busy ? 'report.stateBusy' : 'report.stateRunning'), down: t('report.stateDown') }[sp.service]
  return row(t('report.restart'), [t('report.restartNote', { state }), sp.trouble ? bad(sp.trouble) : null], linkBtn(t('report.restartBtn'), () => post({ type: 'restartSpeech' }), sp.pack.status !== 'ready'))
}

// ---------------------------------------------------------------- messages

/** A place asked for by the tray or a second start; Home is a fresh opening, with no way back. */
function showTab(tab: AppTab): void {
  // The talk window's model: the choice of the model Check my English and the duck use.
  if (tab === 'checkModel') return go('models', 'forCheck')
  if (tab !== 'home' && tab !== 'howto') {
    go(tab)
    // From the tray's Your words: the word is typed at once.
    if (tab === 'vocabulary' || tab === 'kept') pBody.querySelector<HTMLInputElement>('input[data-live]')?.focus()
    return
  }
  visited.length = 0
  closePage()
  fillHeader()
}

/** The first `app` message: Home, the moment if it has not played yet, or the place asked for. */
function start(v: AppView): void {
  // The setup comes first; the moment plays after it.
  if (!v.settings.setupDone) return
  const asked = askedTab && askedTab !== 'home' && askedTab !== 'howto' ? askedTab : undefined
  // A place asked for wins; the moment waits for an opening that starts at Home.
  if (askedTranscript) return openTranscript(askedTranscript)
  if (asked) return showTab(asked)
  if (FROZEN_T !== undefined) return playMoment(false, FROZEN_T)
  if (v.settings.introSeen) return
  if (reduced.matches) return save({ introSeen: true })
  playMoment(true)
}

window.addEventListener('message', (event: MessageEvent<ToView>) => {
  if (event.source !== window) return
  const m = event.data
  if (m.type === 'appTab') {
    if (view) showTab(m.tab)
    else askedTab = m.tab
    return
  }
  if (m.type === 'openTranscript') {
    if (view) openTranscript(m.id)
    else (askedTranscript = m.id), (askedTab = 'transcripts')
    return
  }
  if (m.type === 'appWindow') return windowState(m.maximized)
  if (m.type === 'reported') {
    reported = { file: m.file, error: m.error }
    if (open?.name === 'report') renderBody()
    return
  }
  if (m.type !== 'app') return
  const first = view === undefined
  view = m.view
  // Clean up goes on until the storage measured again comes in.
  if (cleaning === 'asked' && m.view.storage?.measuring) cleaning = 'measuring'
  else if (cleaning === 'measuring' && !m.view.storage?.measuring) cleaning = undefined
  if (m.view.speech.service !== 'ready') forgetEngine()
  updateNav()
  // A fresh install: the setup takes Home's place until it is finished or skipped.
  if (!m.view.settings.setupDone) {
    closePage()
    if (moment) finishMoment()
    root.classList.add('setup')
    home.classList.add('setup')
    renderSetup()
    return
  }
  if (root.classList.contains('setup')) {
    root.classList.remove('setup')
    home.classList.remove('setup')
    resetSetup()
    renderHome(true)
    // The opening moment plays once the setup is over, as it would on a first opening.
    if (!m.view.settings.introSeen) {
      if (reduced.matches) save({ introSeen: true })
      else playMoment(true)
    }
    return
  }
  renderHome()
  fillHeader()
  renderBody()
  if (first) start(m.view)
})

/** The setup's steps in Home's place, drawn again on every snapshot and on every change made in it. */
function renderSetup(): void {
  if (!view) return
  home.replaceChildren(...setupNodes(view, { save, post, redraw: renderSetup }))
}

// A click or a key during the moment takes it to its end.
window.addEventListener('pointerdown', () => moment && moment.raf && finishMoment(), true)
window.addEventListener('keydown', event => {
  if (moment?.raf) return finishMoment()
  if (event.defaultPrevented) return
  if (event.key === 'Escape' && open) {
    event.preventDefault()
    back()
  }
  // Ctrl+F: the search, unless a key is being recorded.
  if (event.ctrlKey && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'f' && !document.querySelector('.recording') && !root.classList.contains('setup')) {
    event.preventDefault()
    findField.focus()
    findField.select()
  }
})

onRedraw(() => {
  fillHeader()
  renderBody()
})
setTranscriptHooks({
  view: () => view,
  shown: () => open?.name === 'transcripts',
  show: () => go('transcripts'),
  setup: () => go('transcribe', 'speakers'),
})

post({ type: 'appReady' })
