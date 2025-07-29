function toggleDarkMode() {
  document.body.classList.toggle("dark");
  localStorage.setItem("theme", document.body.classList.contains("dark") ? "dark" : "light");
}

if (localStorage.getItem("theme") === "dark") {
  document.addEventListener("DOMContentLoaded", () => {
    document.body.classList.add("dark");
  });
}