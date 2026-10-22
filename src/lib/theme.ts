/** Applies the light or dark theme, and gives the mobile browser bar the same color. */
export function applyTheme(dark: boolean) {
  document.documentElement.classList.toggle('dark', dark);
  // The --sidebar colors in styles.css. Fixed here, since this can run before the CSS loads.
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', dark ? '#191f2b' : '#f8f9fc');
}
