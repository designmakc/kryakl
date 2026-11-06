import { describe, expect, it } from 'vitest'

import { autoSummaryWanted, secondsLeft, summaryInput, topicIn } from './summaryflow'

describe('summaryInput', () => {
  it('names the speakers, drops empty lines and keeps lost', () => {
    const input = summaryInput({
      title: 'Call',
      duration: 90,
      language: 'ru',
      lost: 2,
      speakers: { me: { name: 'Me' }, s1: { name: 'Anna' } },
      utterances: [
        { speaker: 'me', start: 1, text: ' Hello ' },
        { speaker: 's1', start: 5, text: '   ' },
        { speaker: 's2', start: 9, text: 'Bye' },
      ],
    })
    expect(input.lines).toEqual([
      { speaker: 'Me', start: 1, text: 'Hello' },
      { speaker: 's2', start: 9, text: 'Bye' },
    ])
    expect(input.language).toBe('ru')
    expect(input.lost).toBe(2)
  })
})

describe('secondsLeft', () => {
  it('is unknown before the first part and while joining', () => {
    expect(secondsLeft(0, 5, 0, 10_000)).toBeNull()
    expect(secondsLeft(6, 5, 0, 10_000)).toBeNull()
  })
  it('uses the average of the parts done', () => {
    // 2 of 5 done in 40 s: 20 s each, 3 left
    expect(secondsLeft(2, 5, 0, 40_000)).toBe(60)
    expect(secondsLeft(5, 5, 0, 40_000)).toBe(0)
  })
})

describe('autoSummaryWanted', () => {
  it('needs the wish and the model', () => {
    expect(autoSummaryWanted(true, true)).toBe(true)
    expect(autoSummaryWanted(true, false)).toBe(false)
    expect(autoSummaryWanted(false, true)).toBe(false)
  })
})

describe('topicIn', () => {
  it('finds a time in minutes and in hours', () => {
    expect(topicIn('- [12:34] Budget')).toEqual({ before: '- ', stamp: '12:34', at: 754, after: ' Budget' })
    expect(topicIn('- [1:02:03] End')?.at).toBe(3723)
  })
  it('is null without a time', () => {
    expect(topicIn('Decided to ship')).toBeNull()
  })
})
