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
const illustrateBtn   = document.getElementById('illustrateSubmit');
const guardrailBox    = document.getElementById('resultGuardrails');
const historyLink     = document.getElementById('historyLink');

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
    guardrailBox?.setAttribute('hidden', 'hidden');
  }, 0);
});

const setLoadingState = (loading) => {
  if (loading) {
    illustrateBtn?.classList.add('is-loading');
    if (illustrateBtn && !illustrateBtn.dataset.originalText) {
      illustrateBtn.dataset.originalText = illustrateBtn.innerHTML;
    }
    if (illustrateBtn) illustrateBtn.innerHTML = '⏳ Illustrating…';
  } else {
    illustrateBtn?.classList.remove('is-loading');
    if (illustrateBtn?.dataset.originalText) {
      illustrateBtn.innerHTML = illustrateBtn.dataset.originalText;
    }
  }
  const elements = form ? Array.from(form.elements) : [];
  elements.forEach((el) => {
    if (!el) return;
    if (el.type === 'reset') {
      el.disabled = loading;
      return;
    }
    el.disabled = loading;
  });
  tagify?.setReadonly(loading);
};

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
    setLoadingState(true);
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
      let extra = '';
      try {
        const err = await resp.json();
        if (err?.error) msg = err.error;
        if (Array.isArray(err?.details) && err.details.length) {
          extra = err.details.join(' | ');
        } else if (typeof err?.raw === 'string') {
          extra = err.raw.slice(0, 120);
        }
      } catch (_) {}
      const composed = extra ? `${msg} (${extra})` : msg;
      showToast(`❌ ${composed}`);
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
    if (historyLink && data.history_url) historyLink.href = data.history_url;

    const guardrailMap = {
      symbols_only_forced: 'Sensitive passage detected — switched to symbols-only.',
      historical_props_removed: 'Historical props removed for safety.',
    };
    const guardrails = (data.guardrails || [])
      .map((code) => guardrailMap[code] || code)
      .filter(Boolean);
    if (guardrailBox) {
      if (guardrails.length) {
        guardrailBox.textContent = guardrails.join(' ');
        guardrailBox.removeAttribute('hidden');
      } else {
        guardrailBox.setAttribute('hidden', 'hidden');
      }
    }

    resultPanel?.removeAttribute('hidden');
    showToast('✅ Coloring sheet ready!');
    window.refreshUsageChip?.();
    setTimeout(() => window.refreshUsageChip?.(), 1200);
  } catch (error) {
    console.error(error);
    showToast('❌ Network hiccup. Try again.');
  } finally {
    form.removeAttribute('aria-busy');
    setLoadingState(false);
    window.hideOverlay?.();
  }
});
