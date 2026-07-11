// The 🧸 trigger button. Position/visibility are managed by the content
// entrypoint; this only builds the element.
export function createIcon(onActivate: () => void): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'tm-icon';
  btn.title = "Explain like I'm a toddler";
  btn.setAttribute('aria-label', "Explain like I'm a toddler");
  btn.textContent = '🧸';
  // Keep the page selection alive when the icon is pressed.
  btn.addEventListener('mousedown', (e) => e.preventDefault());
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    onActivate();
  });
  return btn;
}
