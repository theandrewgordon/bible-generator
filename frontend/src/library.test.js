import test from 'node:test';
import assert from 'node:assert/strict';
import { readFilters, selectBundles, defaults } from './library.js';
const bundles = [
  {index: 0, title: 'Wisdom', search: 'wisdom memory verses', count: 3, member: true},
  {index: 1, title: 'Prayer', search: 'prayer memory verses', count: 9, free: true, entitled: true},
  {index: 2, title: 'Kindness', search: 'kindness for children', count: 9, entitled: true},
];
test('search combines words regardless of order and respects access', () => {
  assert.deepEqual(selectBundles(bundles, {...defaults, q: ' VERSES  prayer ', access: 'free'}).map(b => b.index), [1]);
  assert.equal(selectBundles(bundles, {...defaults, q: 'prayer', access: 'membership'}).length, 0);
  assert.equal(selectBundles(bundles, {...defaults, access: 'included'}).length, 2);
});
test('featured restores source order after other sorts; count ties are stable', () => {
  assert.deepEqual(selectBundles(bundles, {...defaults, sort: 'alpha'}).map(b => b.index), [2, 1, 0]);
  assert.deepEqual(selectBundles(bundles, {...defaults, sort: 'count'}).map(b => b.index), [1, 2, 0]);
  assert.deepEqual(selectBundles(bundles, defaults).map(b => b.index), [0, 1, 2]);
});
test('shared URLs validate filters and decode queries', () => {
  assert.deepEqual(readFilters('?q=memory+verses&access=free&sort=count'), {q: 'memory verses', access: 'free', sort: 'count'});
  assert.deepEqual(readFilters('?access=unknown&sort=unknown'), defaults);
});
