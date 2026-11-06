import { describe, expect, test } from 'vitest'

import { changed, frameHash, hamming, SHOT_SIDE, shownShots } from './shots'

/** A SHOT_SIDE² RGBA picture whose pixel i has the brightness `at(i)`. */
const picture = (at: (i: number) => number) => {
  const out = new Uint8ClampedArray(SHOT_SIDE * SHOT_SIDE * 4)
  for (let i = 0; i < SHOT_SIDE * SHOT_SIDE; i++) out.set([at(i), at(i), at(i), 255], i * 4)
  return out
}

describe('a call screenshot', () => {
  const left = picture(i => (i % SHOT_SIDE < 8 ? 250 : 10))
  test('the same frame, or one a little brighter, is not new', () => {
    expect(changed(frameHash(left), frameHash(left))).toBe(false)
    expect(changed(frameHash(left), frameHash(picture(i => (i % SHOT_SIDE < 8 ? 255 : 30))))).toBe(false)
  })
  test('a new slide is', () => {
    const top = frameHash(picture(i => (i < 128 ? 250 : 10)))
    expect(hamming(frameHash(left), top)).toBe(128)
    expect(changed(frameHash(left), top)).toBe(true)
  })
  test('the first frame is always kept', () => {
    expect(changed(undefined, frameHash(left))).toBe(true)
  })
  test('the transcript shows the person’s and the key ones, by time', () => {
    const shots = [
      { at: 9, file: '9000.jpg', key: true },
      { at: 4, file: '4000.jpg' },
      { at: 2, file: '2000-m.jpg', manual: true },
    ]
    expect(shownShots(shots).map(s => s.file)).toEqual(['2000-m.jpg', '9000.jpg'])
    expect(shownShots(undefined)).toEqual([])
  })
})
