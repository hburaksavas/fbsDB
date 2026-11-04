// A placeholder only helps when the wait is noticeable: a quick load must not flash grey bars.
export const skeletonDelayMs = 300;
export const shouldShowSkeleton = ({ loading, hasItems, waitedMs }) => Boolean(loading) && !hasItems && waitedMs >= skeletonDelayMs;
export const skeletonWidths = count => Array.from({ length: count }, (_, index) => 55 + ((index * 37) % 40));
