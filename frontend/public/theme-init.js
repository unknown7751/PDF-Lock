// Apply the saved theme before first paint (default: dark) to avoid a flash.
// Kept as a separate same-origin file so a strict Content-Security-Policy (script-src 'self') works.
(function () {
  try {
    var t = localStorage.getItem("pdflock-theme");
    var root = document.documentElement;
    root.classList.toggle("dark", t !== "light");
    root.classList.toggle("light", t === "light");
  } catch (e) {}
})();
