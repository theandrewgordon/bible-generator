(function(){
const cookieName = 'faithsparks_labs_owner';

function ownerScope() {
  return globalThis.document?.cookie?.match(/(?:^|;\s*)faithsparks_labs_owner=([a-f0-9]{64})(?:;|$)/)?.[1];
}

const scope = ownerScope();
const prefix = scope ? 'faithsparks.labs.account.' + scope + '.' : '';
const temporary = new Map();
const officialSite = /(^|\.)faithsparksprintables\.com$/i.test(globalThis.location?.hostname || '');

const labsStorageKey = key => prefix + key;
const canUseStorage = () => !officialSite || (scope && ownerScope() === scope);

function storageKeys() {
  if (!canUseStorage()) return [...temporary.keys()];
  return Object.keys(localStorage).filter(key => key.startsWith(prefix)).map(key => key.slice(prefix.length));
}

const labsStorage = {
  get length() { return storageKeys().length; },
  key(index) { return storageKeys()[index] ?? null; },
  getItem(key) {
    return !canUseStorage()
      ? temporary.get(key) ?? null : localStorage.getItem(labsStorageKey(key));
  },
  setItem(key, value) {
    if (!canUseStorage()) temporary.set(key, value);
    else localStorage.setItem(labsStorageKey(key), value);
  },
  removeItem(key) {
    if (!canUseStorage()) temporary.delete(key);
    else localStorage.removeItem(labsStorageKey(key));
  },
};

if (scope) {
  const checkOwner = () => {
    if (ownerScope() !== scope) {
      document.documentElement.hidden = true;
      location.reload();
    }
  };
  globalThis.addEventListener?.('pageshow', checkOwner);
  globalThis.addEventListener?.('focus', checkOwner);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) checkOwner();
  });
  globalThis.cookieStore?.addEventListener('change', event => {
    if ([...event.changed, ...event.deleted].some(cookie => cookie.name === cookieName)) checkOwner();
  });
}

globalThis.FaithSparksLabsStorage = {labsStorage, labsStorageKey};
})();
