// Contoh fungsi utilitas
function addSmoothScrollBehavior() {
  document.documentElement.style.scrollBehavior = "smooth";
}

// Tambahkan CSS untuk mode fullscreen
function addFullscreenCSS() {
  const style = document.createElement("style");
  style.textContent = `
      .character-section.fullscreen-mode {
          position: fixed;
          top: 0;
          left: 0;
          width: 100vw;
          height: 100vh;
          z-index: 1000;
          background: linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%);
      }
    `;
  document.head.appendChild(style);
}
