// static/darkmode.js
(function () {
  const KEY = "theme"; // 'dark' | 'light' | 'system' (null => system)
  const body = document.body;

  const prefersDark = () =>
    window.matchMedia &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;

  const getStored = () => localStorage.getItem(KEY);

  const effective = () => {
    const s = getStored();
    if (s === "dark" || s === "light") return s;
    return prefersDark() ? "dark" : "light";
  };

  function apply(theme) {
    if (theme === "dark") body.classList.add("dark");
    else body.classList.remove("dark");

    const btn = document.getElementById("themeToggle");
    if (btn) {
      const isDark = theme === "dark";
      btn.setAttribute("aria-pressed", String(isDark));
      btn.textContent = isDark ? "☀️" : "🌙";
      btn.title = isDark ? "Toggle light mode" : "Toggle dark mode";
      btn.setAttribute("aria-label", btn.title);
    }
  }

  function init() {
    apply(effective());
  }
  function onClick() {
    const next = effective() === "dark" ? "light" : "dark";
    localStorage.setItem(KEY, next);
    apply(next);
  }
  function onSystemChange() {
    const s = getStored();
    if (!s || s === "system") apply(effective());
  }

  document.addEventListener("DOMContentLoaded", () => {
    init();
    const btn = document.getElementById("themeToggle");
    if (btn) btn.addEventListener("click", onClick);
  });

  if (window.matchMedia) {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener?.("change", onSystemChange);
    mq.addListener?.(onSystemChange); // safari <14
  }

  // optional API
  window.setTheme = (mode /* 'dark'|'light'|'system' */) => {
    if (mode === "system") localStorage.setItem(KEY, "system");
    else localStorage.setItem(KEY, mode);
    apply(effective());
  };
})();
