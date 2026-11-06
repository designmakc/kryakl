// The call recording's panel: one hidden window that records and shows it. All
// of the computer's sound (getDisplayMedia, which main answers with the screen's
// loopback sound, its picture dropped here at once) and the microphone, each a
// MediaRecorder of 10 s chunks sent to the speech engine as a meeting's are
// (tracks `system` and `mic`); a chunk that never goes is counted as `lost`.
// The panel: a red dot, "Call", the time, Pause, Stop and a chevron that hides
// it, the recording going on; under them the source, or what is wrong.

import { t } from '../i18n'
import { onMac } from '../hotkey'
import type { CallState, SpeechResult, ToHost, ToView, TutorHost } from '../protocol'
import { TrackSender } from '../capturesend'
import { el } from './dom'
import { lucide } from './lucide'
import { micTrouble } from './recorder'

declare global {
  interface Window {
    tutorHost: TutorHost
  }
}

const host = window.tutorHost
const post = (message: ToHost) => host.post(message)
const root = document.getElementById('panel')!

const SLICE = 10_000
/** No sound from the computer for this long at the start: the panel asks the person to check the source. */
const SILENT_MS = 60_000
/** Louder than this, the computer's sound is there (RMS, 0…1). */
const HEARD = 0.005

type Track = { name: 'mic' | 'system'; stream: MediaStream; recorder: MediaRecorder; sender: TrackSender }

let state: CallState = 'idle'
let id: string | undefined
let tracks: Track[] = []
let micMissing = false
let silent = false
let heard = false
let error = ''
/** Seconds recorded before the last pause, and since when the time runs again. */
let before = 0
let since = 0
let started = 0
let listening: number | undefined
let ticking: number | undefined
let meter: { context: AudioContext; analyser: AnalyserNode; samples: Float32Array<ArrayBuffer> } | undefined

const speech = <T>(method: string, route: string, body?: unknown) => host.call({ call: 'speech', method, route, body }) as Promise<SpeechResult<T>>

function seconds(): number {
  return before + (state === 'recording' && since ? (Date.now() - since) / 1000 : 0)
}

function clock(s: number): string {
  const n = Math.floor(s)
  const h = Math.floor(n / 3600)
  const mm = String(Math.floor((n % 3600) / 60)).padStart(h ? 2 : 1, '0')
  const ss = String(n % 60).padStart(2, '0')
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

function tell(): void {
  post({ type: 'captureState', state, ...(id ? { id } : {}), seconds: Math.round(seconds()), silent, micMissing, ...(error ? { error } : {}) })
}

function set(next: CallState): void {
  state = next
  tell()
  draw()
}

function button(icon: Parameters<typeof lucide>[0], label: string, onclick: () => void, cls = ''): HTMLElement {
  return el('button', { class: `pb ${cls}`, title: label, 'aria-label': label, onclick }, lucide(icon, 's'))
}

function draw(): void {
  const busy = state === 'starting' || state === 'stopping'
  const head = el(
    'div',
    { class: 'line' },
    el('i', { class: `dot ${state === 'recording' ? '' : 'still'}` }),
    el('span', { class: 'what' }, t('call.panel')),
    el('span', { class: 'time' }, state === 'starting' ? t('call.starting') : state === 'stopping' ? t('call.saving') : state === 'paused' ? `${clock(seconds())} · ${t('call.paused')}` : clock(seconds())),
    el('span', { class: 'gap' }),
    ...(state === 'recording' || state === 'paused'
      ? [
          state === 'paused' ? button('play', t('call.resume'), resume) : button('pause', t('call.pause'), pause),
          button('square', t('call.stopShort'), () => void stop(), 'stop'),
        ]
      : []),
    button('chevron-down', t('call.hide'), () => post({ type: 'captureHide' }), 'tuck'),
  )
  const note = error
    ? el('div', { class: 'note error' }, el('span', {}, error), onMac ? el('button', { class: 'link', onclick: () => post({ type: 'captureOpenSettings' }) }, t('call.openSettings')) : null)
    : silent
      ? el('div', { class: 'note warn' }, t('call.silent'))
      : micMissing
        ? el('div', { class: 'note warn' }, t('call.noMic'))
        : el('div', { class: 'note' }, busy ? '' : t('call.allSound'))
  root.className = `panel ${state}`
  root.replaceChildren(head, note)
}

/** The computer's sound: main answers with the screen's loopback sound; the picture goes at once. */
async function computerSound(): Promise<MediaStream> {
  const display = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })
  for (const v of display.getVideoTracks()) v.stop()
  const audio = display.getAudioTracks()
  if (audio.length === 0) throw new Error(t('call.noSound'))
  return new MediaStream(audio)
}

async function start(title: string, app?: string): Promise<void> {
  if (state !== 'idle') return
  error = ''
  micMissing = false
  silent = false
  heard = false
  before = 0
  since = 0
  set('starting')
  let system: MediaStream
  try {
    system = await computerSound()
  } catch (e) {
    error = t('call.failed', { why: e instanceof Error && e.message ? e.message : String(e) })
    return set('idle')
  }
  let mic: MediaStream | undefined
  try {
    mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
  } catch (e) {
    console.warn(`call: no microphone (${micTrouble(e)})`)
    micMissing = true
  }
  const startedAt = Date.now()
  const opened = await speech<{ id: string }>('POST', '/recordings', {
    source: 'system',
    title,
    ...(app ? { app } : {}),
    tracks: { system: { startedAt }, ...(mic ? { mic: { startedAt } } : {}) },
  })
  if (!opened.ok) {
    for (const s of [system, mic]) for (const track of s?.getTracks() ?? []) track.stop()
    error = t('call.failed', { why: opened.error })
    return set('idle')
  }
  id = opened.data.id
  const call = (method: string, route: string, body?: unknown) => speech(method, route, body)
  tracks = [
    ...(mic ? [{ name: 'mic' as const, stream: mic }] : []),
    { name: 'system' as const, stream: system },
  ].map(({ name, stream }) => {
    const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus', audioBitsPerSecond: 64000 })
    const sender = new TrackSender(call, id!, name)
    recorder.ondataavailable = event => {
      if (event.data.size > 0) sender.send(event.data.arrayBuffer().then(b => new Uint8Array(b)))
    }
    return { name, stream, recorder, sender }
  })
  for (const track of tracks) track.recorder.start(SLICE)
  // The system cut the computer's sound off (another capture took it, the screen went away): what came is saved.
  for (const track of system.getAudioTracks()) track.addEventListener('ended', () => void stop())
  listen(system)
  started = Date.now()
  since = started
  ticking = window.setInterval(draw, 1000)
  set('recording')
}

/** Is the computer's sound there? Asked twice a second; silent through the first minute, the panel says so. */
function listen(stream: MediaStream): void {
  const context = new AudioContext()
  const analyser = context.createAnalyser()
  analyser.fftSize = 1024
  context.createMediaStreamSource(stream).connect(analyser)
  meter = { context, analyser, samples: new Float32Array(analyser.fftSize) }
  listening = window.setInterval(() => {
    if (!meter || state !== 'recording') return
    meter.analyser.getFloatTimeDomainData(meter.samples)
    let sum = 0
    for (const v of meter.samples) sum += v * v
    if (Math.sqrt(sum / meter.samples.length) > HEARD) heard = true
    const next = !heard && Date.now() - started > SILENT_MS
    if (next !== silent) {
      silent = next
      tell()
      draw()
    }
    // Once heard, nothing more to ask.
    if (heard) window.clearInterval(listening)
  }, 500)
}

/**
 * A pause records silence rather than nothing: the chunks go on, so the engine
 * never takes a long pause for a recording cut off, and the tracks stay in step.
 */
function pause(): void {
  if (state !== 'recording') return
  before = seconds()
  since = 0
  for (const track of tracks) for (const s of track.stream.getTracks()) s.enabled = false
  set('paused')
}

function resume(): void {
  if (state !== 'paused') return
  for (const track of tracks) for (const s of track.stream.getTracks()) s.enabled = true
  since = Date.now()
  set('recording')
}

const stopped = (recorder: MediaRecorder) =>
  recorder.state === 'inactive' ? Promise.resolve() : new Promise<void>(resolve => (recorder.addEventListener('stop', () => resolve(), { once: true }), recorder.stop()))

/** Stops both tracks, sends what is left and hands the recording to the engine; says its id and the chunks lost. */
async function stop(): Promise<void> {
  if (state === 'starting') {
    // Started still: it stops as soon as it records.
    const wait = window.setInterval(() => {
      if (state === 'starting') return
      window.clearInterval(wait)
      void stop()
    }, 200)
    return
  }
  if (state !== 'recording' && state !== 'paused') return
  before = seconds()
  since = 0
  set('stopping')
  window.clearInterval(ticking)
  window.clearInterval(listening)
  await Promise.all(tracks.map(track => stopped(track.recorder)))
  await Promise.all(tracks.map(track => track.sender.done()))
  const lost = tracks.reduce((n, track) => n + track.sender.lost, 0)
  for (const track of tracks) for (const s of track.stream.getTracks()) s.stop()
  void meter?.context.close()
  meter = undefined
  tracks = []
  const finished = await speech('POST', `/recordings/${id}/finish`, { lost })
  if (!finished.ok) console.warn(`call: the engine did not take the recording (${finished.status ?? ''})`)
  post({ type: 'captureDone', id: finished.ok ? (id ?? null) : null, lost })
  id = undefined
  set('idle')
}

window.addEventListener('message', event => {
  const message = event.data as ToView
  if (event.source !== window || message?.type !== 'capture') return
  if (message.command === 'start') void start(message.title ?? '', message.app)
  else if (message.command === 'stop') void stop()
  else if (message.command === 'pause') pause()
  else if (message.command === 'resume') resume()
})

draw()
post({ type: 'captureState', state: 'idle' })
