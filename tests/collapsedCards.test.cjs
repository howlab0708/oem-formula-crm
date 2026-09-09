const { test } = require('node:test')
const assert = require('node:assert/strict')
const createLoader = require('./helpers/loadTs.cjs')

const loadTs = createLoader()
const {
  isCardCollapsed,
  storeCardCollapsed,
  collapsedCards,
  resetCollapsedCardsCache,
} = loadTs('src/lib/collapsedCards.ts')

const KEY = 'oem.dashboard.collapsedCards'

/** 브라우저 저장소 대역. `mode` 로 못 쓰는 환경을 흉내낸다. */
function useStorage(initial = null, mode = 'ok') {
  const store = new Map()
  if (initial !== null) store.set(KEY, initial)
  globalThis.localStorage = {
    getItem(key) {
      if (mode === 'blocked') throw new Error('access denied')
      return store.has(key) ? store.get(key) : null
    },
    setItem(key, value) {
      if (mode !== 'ok') throw new Error('quota exceeded')
      store.set(key, value)
    },
    removeItem(key) {
      if (mode !== 'ok') throw new Error('quota exceeded')
      store.delete(key)
    },
  }
  resetCollapsedCardsCache()
  return store
}

test('접은 카드는 저장소에 남고 다음 방문에 그대로 접혀 있다', () => {
  const store = useStorage()
  assert.equal(isCardCollapsed('다빈도 주원료'), false)

  storeCardCollapsed('다빈도 주원료', true)
  assert.deepEqual(JSON.parse(store.get(KEY)), ['다빈도 주원료'])

  // 새로 켠 화면처럼 캐시를 버리고 다시 읽는다.
  resetCollapsedCardsCache()
  assert.equal(isCardCollapsed('다빈도 주원료'), true)
  assert.equal(isCardCollapsed('시장 다빈도 제형'), false)
})

test('카드마다 따로 접히고, 다 펼치면 저장한 값을 지운다', () => {
  const store = useStorage()
  storeCardCollapsed('시장 다빈도 제형', true)
  storeCardCollapsed('다빈도 부원료', true)
  assert.deepEqual([...collapsedCards()].sort(), ['다빈도 부원료', '시장 다빈도 제형'])

  storeCardCollapsed('시장 다빈도 제형', false)
  assert.deepEqual(JSON.parse(store.get(KEY)), ['다빈도 부원료'])

  // 남는 게 없으면 열쇠 자체를 지운다 - 빈 배열을 남겨 두지 않는다.
  storeCardCollapsed('다빈도 부원료', false)
  assert.equal(store.has(KEY), false)
})

test('저장소를 못 쓰는 환경에서도 화면은 그대로 돈다', () => {
  useStorage(null, 'blocked')
  // 읽기가 던져도 전부 펼침으로 시작한다.
  assert.equal(isCardCollapsed('다빈도 주원료'), false)
  // 쓰기가 던져도 예외가 새 나가지 않고, 이번 화면에서는 접힌 상태가 유지된다.
  assert.doesNotThrow(() => storeCardCollapsed('다빈도 주원료', true))
  assert.equal(isCardCollapsed('다빈도 주원료'), true)
})

test('남아 있는 값이 깨져 있으면 전부 펼침으로 시작한다', () => {
  for (const broken of ['not json', '{"a":1}', '"문자열"', '[1,2,3]', '']) {
    useStorage(broken)
    assert.equal(isCardCollapsed('다빈도 주원료'), false, broken)
  }
  // 문자열이 아닌 항목만 걸러내고 나머지는 살린다.
  useStorage('["다빈도 주원료", 7, null]')
  assert.deepEqual([...collapsedCards()], ['다빈도 주원료'])
})
