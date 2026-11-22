// Recover even if the catalogue module fails to load.
window.setTimeout(() => {
  if (!document.getElementById('intro').open) {
    document.documentElement.classList.remove('opening');
  }
}, 4500);
