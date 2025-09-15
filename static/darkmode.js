// static/darkmode.js
(function () {
  const STORAGE_KEY = "theme"; // 'dark' | 'light' | 'system' (or null = system)
  const body = document.documentElement || document.body;

  function systemPrefersDark() {
    return (
      window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: dark)").matches
    );
  }

  function getStored() {
    return localStorage.getItem(STORAGE_KEY); // may be null
  }

  function effectiveTheme() {
    const stored = getStored();
    if (stored === "dark" || stored === "light") return stored;
    return systemPrefersDark() ? "dark" : "light";
  }

  function apply(theme) {
    // Toggle class for CSS tokens
    if (theme === "dark") {
      body.classList.add("dark");
    } else {
      body.classList.remove("dark");
    }
    // Update toggle button UI if present
    const btn = document.getElementById("themeToggle");
    if (btn) {
      const isDark = theme === "dark";
      btn.setAttribute("aria-pressed", String(isDark));
      btn.textContent = isDark ? "☀️" : "🌙";
      btn.title = isDark ? "Toggle light mode" : "Toggle dark mode";
      btn.setAttribute("aria-label", btn.title);
    }
  }

  // Initialize from stored/system preference
  function init() {
    apply(effectiveTheme());
  }

  // Click handler: cycle dark <-> light (you can add 'system' if you want)
  function onClick() {
    const current = effectiveTheme();
    const next = current === "dark" ? "light" : "dark";
    localStorage.setItem(STORAGE_KEY, next);
    apply(next);
  }

  // Keep in sync if system preference changes while set to 'system' or unset
  function onSystemChange() {
    const stored = getStored();
    if (!stored || stored === "system") apply(effectiveTheme());
  }

  // Wire up once DOM is ready
  document.addEventListener("DOMContentLoaded", () => {
    init();
    const btn = document.getElementById("themeToggle");
    if (btn) btn.addEventListener("click", onClick);
  });

  if (window.matchMedia) {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    if (mq.addEventListener) mq.addEventListener("change", onSystemChange);
    else if (mq.addListener) mq.addListener(onSystemChange); // Safari < 14
  }

  // Expose tiny API (optional)
  window.setTheme = function (mode /* 'dark'|'light'|'system' */) {
    if (mode === "system") localStorage.setItem(STORAGE_KEY, "system");
    else localStorage.setItem(STORAGE_KEY, mode);
    apply(effectiveTheme());
  };
})();
