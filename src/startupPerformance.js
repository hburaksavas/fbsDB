// Navigation-relative milestones include downloading and evaluating the entry bundle.
// Read in DevTools with performance.getEntriesByType('measure').
export function recordStartupMilestone(name, timeline = globalThis.performance) {
  if (!timeline?.mark || !timeline?.measure) return;
  const mark = `fbsdb:${name}`;
  if (timeline.getEntriesByName(mark, 'mark').length) return;
  timeline.mark(mark);
  timeline.measure(`fbsdb:startup:${name}`, { start: 0, end: mark });
}
