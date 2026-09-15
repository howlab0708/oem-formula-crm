const { test } = require('node:test')
const assert = require('node:assert/strict')
const load = require('./helpers/loadTs.cjs')()
const { createWorkspaceNavigation, SEARCH_VIEW, WORKSPACE_HISTORY_KEY } = load('src/lib/workspaceNavigation.ts')

function setup() {
  const stack = [{ nextRouter: 'preserved' }]
  let position = 0
  let view = SEARCH_VIEW
  let requestedBack = 0
  const history = {
    get state() { return stack[position] },
    pushState(state) { stack.splice(position + 1); stack.push(state); position++ },
    replaceState(state) { stack[position] = state },
    back() { requestedBack++ },
  }
  const nav = createWorkspaceNavigation(history, 'session-a', next => { view = next })
  const move = delta => {
    assert.ok(position + delta >= 0 && position + delta < stack.length)
    position += delta
    nav.pop()
  }
  return { nav, history, stack, move, get view() { return view }, get requestedBack() { return requestedBack } }
}

test('browser Back returns design → product detail → list; Forward restores design', () => {
  const app = setup()
  app.nav.selectProduct('product-a')
  app.nav.setTab('design')
  app.move(-1)
  assert.deepEqual(app.view, { tab: 'consulting', selectedId: 'product-a' })
  app.move(-1)
  assert.deepEqual(app.view, SEARCH_VIEW)
  app.move(1)
  app.move(1)
  assert.deepEqual(app.view, { tab: 'design', selectedId: 'product-a' })
  assert.equal(app.stack.length, 3)
})

test('on-screen Back consumes history and repeated clicks do not skip screens', () => {
  const app = setup()
  app.nav.selectProduct('product-a')
  app.nav.setTab('design')
  app.nav.back()
  app.nav.back()
  assert.equal(app.requestedBack, 1)
  app.move(-1)
  app.nav.selectProduct(null)
  assert.equal(app.requestedBack, 2)
  app.move(-1)
  assert.deepEqual(app.view, SEARCH_VIEW)
})

test('stepping across products replaces detail and close returns to the list', () => {
  const app = setup()
  app.nav.selectProduct('product-a')
  app.nav.selectProduct('product-b')
  app.nav.selectProduct('product-c')
  assert.equal(app.stack.length, 2)
  app.nav.setTab('design')
  app.move(-1)
  assert.equal(app.view.selectedId, 'product-c')
  app.nav.selectProduct(null)
  app.move(-1)
  assert.deepEqual(app.view, SEARCH_VIEW)
})

test('sidebar tabs are navigable, repeated selection adds no duplicate entries', () => {
  const app = setup()
  app.nav.setTab('notes')
  app.nav.setTab('design')
  app.nav.setTab('design')
  assert.equal(app.stack.length, 3)
  app.move(-1)
  assert.equal(app.view.tab, 'notes')
})

test('navigation after Back discards obsolete Forward screens', () => {
  const app = setup()
  app.nav.selectProduct('product-a')
  app.nav.setTab('design')
  app.move(-1)
  app.nav.setTab('ingredients')
  assert.equal(app.stack.length, 3)
  assert.equal(app.stack[2][WORKSPACE_HISTORY_KEY].view.tab, 'ingredients')
})

test('saved-search history and framework state remain intact', () => {
  const app = setup()
  assert.equal(app.history.state.nextRouter, 'preserved')
  app.history.pushState({ nextRouter: 'saved-link' })
  app.nav.resetSearch()
  app.nav.selectProduct('product-a')
  app.nav.setTab('design')
  app.move(-1)
  assert.equal(app.view.selectedId, 'product-a')
  app.move(-1)
  assert.deepEqual(app.view, SEARCH_VIEW)
  assert.equal(app.history.state.nextRouter, 'saved-link')
})

test('stale history after a reload falls back to search; app Back never exits the site', () => {
  const app = setup()
  app.nav.back()
  assert.equal(app.requestedBack, 0)
  app.history.pushState({ [WORKSPACE_HISTORY_KEY]: { session: 'old-session', index: 99, view: { tab: 'design', selectedId: 'old' } } })
  app.nav.pop()
  assert.deepEqual(app.view, SEARCH_VIEW)
  app.nav.back()
  assert.equal(app.requestedBack, 0)
})
