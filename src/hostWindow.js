// Which application window this page runs in. The desktop host sets
// window.__fbsdbWindow before the page starts for windows opened by moving a
// tab; the main window has none.
const boot = typeof window !== 'undefined' ? window.__fbsdbWindow : null;

export const hostWindow = Object.freeze({
  id: typeof boot?.id === 'string' ? boot.id : 'main',
  label: typeof boot?.label === 'string' ? boot.label : 'Main Window',
  secondary: typeof boot?.id === 'string' && boot.id !== 'main',
  initialTransfer: typeof boot?.transfer === 'string' ? boot.transfer : null,
});
