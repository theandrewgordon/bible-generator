// Keep request ownership separate from the editable service state.
export function createServiceSaver({ fetcher, notify }) {
  let pending = false;
  return async function save(request) {
    if (pending) return false;
    pending = true;
    const revision = request.readRevision();
    const context = request.readContext();
    notify({kind: 'pending', message: 'Saving service…'});
    request.setPending(true);
    try {
      const response = await fetcher('/worship/setlist/save', {method: 'POST', body: request.payload, credentials: 'same-origin'});
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Could not save the service. Please try again.');
      const sameContext = context === request.readContext();
      const unchanged = revision === request.readRevision();
      request.onSaved(data, {sameContext, unchanged});
      notify({kind: 'success', message: !sameContext ? 'Previous service saved. Your current service was left unchanged.' : !unchanged ? 'Earlier changes saved. Your newer edits are still unsaved.' : 'Service saved. All current changes are saved.'});
      return true;
    } catch (error) {
      notify({kind: 'error', message: error instanceof SyntaxError || error instanceof TypeError ? 'Could not save. Check your connection and sign-in, then try again. Your edits are still here.' : error.message});
      return false;
    } finally {
      pending = false;
      request.setPending(false);
    }
  };
}
