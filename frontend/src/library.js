export const defaults = { q: '', access: '', sort: 'order' };
export function readFilters(search) {
  const params = new URLSearchParams(search);
  return {
    q: params.get('q') || '',
    access: ['', 'free', 'included', 'membership'].includes(params.get('access')) ? params.get('access') : '',
    sort: ['order', 'alpha', 'count'].includes(params.get('sort')) ? params.get('sort') : 'order',
  };
}
export function selectBundles(bundles, filters) {
  const words = filters.q.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  return bundles.filter(({ search, free, entitled, member }) =>
    words.every(word => search.includes(word)) &&
    (!filters.access || (filters.access === 'free' && free) ||
      (filters.access === 'included' && entitled) || (filters.access === 'membership' && member))
  ).sort((a, b) => {
    if (filters.sort === 'alpha') return a.title.localeCompare(b.title) || a.index - b.index;
    if (filters.sort === 'count') return b.count - a.count || a.index - b.index;
    return a.index - b.index;
  });
}
