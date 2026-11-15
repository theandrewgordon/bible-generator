import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { defaults, readFilters, selectBundles } from './library.js';
import './browse.css';

const mount = document.getElementById('bundle-controls');
const grid = document.getElementById('bundle-grid');
if (mount && grid) {
  // Keep trusted, server-rendered links and access decisions intact.
  const bundles = Array.from(grid.querySelectorAll('.bundle-card'), (node, index) => ({
    node, index, title: node.dataset.title || '',
    search: `${node.dataset.title || ''} ${node.dataset.search || ''}`.toLocaleLowerCase(),
    free: node.dataset.free === 'true', entitled: node.dataset.entitled === 'true',
    member: node.dataset.member === 'true', count: Number(node.dataset.count) || 0,
  }));
  function LibraryControls() {
    const [filters, setFilters] = useState(() => readFilters(location.search));
    const shown = useMemo(() => selectBundles(bundles, filters), [filters]);
    const update = (key, value) => setFilters(current => ({ ...current, [key]: value }));
    useEffect(() => {
      const onPop = () => setFilters(readFilters(location.search));
      window.addEventListener('popstate', onPop);
      return () => window.removeEventListener('popstate', onPop);
    }, []);
    useEffect(() => {
      const visible = new Set(shown);
      bundles.forEach(bundle => { bundle.node.hidden = !visible.has(bundle); });
      shown.forEach(bundle => grid.appendChild(bundle.node));
      const url = new URL(location.href);
      Object.entries(filters).forEach(([key, value]) => {
        if (value && value !== defaults[key]) url.searchParams.set(key, value);
        else url.searchParams.delete(key);
      });
      if (url.href !== location.href) history.replaceState(null, '', url);
    }, [filters, shown]);
    const active = filters.q || filters.access || filters.sort !== 'order';
    return <>
      <div className="library-controls" role="search" aria-label="Find a bundle">
        <label className="library-search">Search bundles
          <input id="bundle-search" type="search" value={filters.q} onChange={event => update('q', event.target.value)} placeholder="Try kindness, prayer, or memory…" aria-controls="bundle-grid" />
        </label>
        <label>Access
          <select id="bundle-access" value={filters.access} onChange={event => update('access', event.target.value)} aria-controls="bundle-grid">
            <option value="">All bundles</option><option value="free">Free</option><option value="included">Available to me</option><option value="membership">Membership bundles</option>
          </select>
        </label>
        <label>Sort by
          <select id="bundle-sort" value={filters.sort} onChange={event => update('sort', event.target.value)} aria-controls="bundle-grid">
            <option value="order">Featured first</option><option value="alpha">A to Z</option><option value="count">Most verses</option>
          </select>
        </label>
      </div>
      <div className="library-results">
        <span id="bundle-count" role="status" aria-live="polite" aria-atomic="true">{shown.length} of {bundles.length} bundles</span>
        {active && <button type="button" className="button ghost small" onClick={() => setFilters({ ...defaults })}>Reset filters</button>}
      </div>
      {shown.length === 0 && <div className="bundle-empty">
        <h2>No bundles found</h2><p>Try fewer words or choose a different access option.</p>
        <button type="button" className="button" onClick={() => { setFilters({ ...defaults }); document.getElementById('bundle-search')?.focus(); }}>Show all bundles</button>
      </div>}
    </>;
  }
  createRoot(mount).render(<LibraryControls />);
}
