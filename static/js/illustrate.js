const form            = document.getElementById('illustrateForm');
const verseInput      = document.getElementById('illustrateVerse');
const customText      = document.getElementById('customText');
const titleOverride   = document.getElementById('titleOverride');
const ageBracket      = document.getElementById('ageBracket');
const includeRef      = document.getElementById('includeReference');
const symbolsOnly     = document.getElementById('symbolsOnly');
const historicalProps = document.getElementById('historicalProps');
const toastEl         = document.getElementById('illustrateToast');
const charCountEl     = document.getElementById('charCount');
const resultPanel     = document.getElementById('resultPanel');
const resultSummary   = document.querySelector('.result-summary');
const resultRefs      = document.getElementById('resultReferences');
const resultMode      = document.getElementById('resultMode');
const downloadPdf     = document.getElementById('downloadPdf');
const downloadPng     = document.getElementById('downloadPng');

const MAX_CHARS = Number(form?.dataset?.maxChars || 500);

const showToast = (msg) => {
  if (!toastEl) return;
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  setTimeout(() => toastEl.classList.remove('show'), 2600);
};

const tagify = verseInput
  ? new Tagify(verseInput, {
      enforceWhitelist: false,
      trim: true,
      duplicates: false,
      pasteAsTags: true,
      delimiters: ',|;|\n',
      dropdown: { enabled: 0 },
    })
  : null;

const prefill = verseInput?.dataset?.prefill;
if (tagify && prefill) {
  const refs = prefill.split(/[,;\n]+/).map((v) => v.trim()).filter(Boolean);
  tagify.addTags(refs);
}

const updateCharCount = () => {
  if (!charCountEl) return;
  const len = (customText.value || '').length;
  charCountEl.textContent = `${len} / ${MAX_CHARS} characters`;
};

customText?.addEventListener('input', updateCharCount);
updateCharCount();

form?.addEventListener('reset', () => {
  tagify?.removeAllTags();
  setTimeout(() => {
    verseInput.value = '';
    customText.value = '';
    titleOverride.value = '';
    updateCharCount();
    resultPanel?.setAttribute('hidden', 'hidden');
  }, 0);
});

form?.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!form) return;

  const verses = tagify ? tagify.value.map((t) => t.value.trim()).filter(Boolean) : [];
  const custom = (customText.value || '').trim();

  if (!verses.length && !custom) {
    alert('Please add at least one verse or custom text.');
    return;
  }
  if (custom.length > MAX_CHARS) {
    alert(`Custom text must stay under ${MAX_CHARS} characters.`);
    return;
  }

  const payload = {
    verse_input: verses.join(', '),
    custom_text: custom,
    title_override: (titleOverride.value || '').trim(),
    age_bracket: ageBracket.value,
    include_reference: includeRef.checked,
    symbols_only: symbolsOnly.checked,
    historical_props: historicalProps.checked,
  };

  try {
    form.setAttribute('aria-busy', 'true');
    showToast('✨ Illustrating…');
    window.showOverlay?.();

    const resp = await fetch(form.action, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
      credentials: 'same-origin',
    });

    if (!resp.ok) {
      let msg = 'Unable to illustrate right now.';
      try {
        const err = await resp.json();
        if (err?.error) msg = err.error;
      } catch (_) {}
      showToast(`❌ ${msg}`);
      return;
    }

    const data = await resp.json();
    if (resultSummary) resultSummary.textContent = data.summary || 'Illustration ready.';
    const refs = (data.references || []).join(', ') || '—';
    if (resultRefs) resultRefs.textContent = refs;

    const forced = Boolean(data.forced_symbols_only);
    if (forced && !symbolsOnly.checked) symbolsOnly.checked = true;
    const modeText = forced
      ? 'Symbols-only (auto)'
      : symbolsOnly.checked
      ? 'Symbols-only'
      : 'Scenes + characters';
    if (resultMode) resultMode.textContent = modeText;

    const pdfHref = data.pdf?.signed_url || data.pdf?.download_url;
    const pngHref = data.png?.signed_url || data.png?.download_url;
    if (pdfHref) downloadPdf.href = pdfHref;
    if (pngHref) downloadPng.href = pngHref;

    resultPanel?.removeAttribute('hidden');
    showToast('✅ Coloring sheet ready!');
  } catch (error) {
    console.error(error);
    showToast('❌ Network hiccup. Try again.');
  } finally {
    form.removeAttribute('aria-busy');
    window.hideOverlay?.();
  }
});
