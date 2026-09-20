(() => {
  const menus = () => [...document.querySelectorAll(".wf-more-nav")];

  document.addEventListener("click", (event) => {
    menus().forEach((menu) => {
      if (menu.open && !menu.contains(event.target)) menu.open = false;
    });
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    menus().forEach((menu) => {
      if (!menu.open) return;
      menu.open = false;
      menu.querySelector("summary")?.focus();
    });
  });
})();
