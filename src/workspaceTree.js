export const pathKey = path => (path || '').replace(/\\/g, '/').replace(/\/$/, '').toLowerCase();
export function remapWorkspacePath(path, source, destination) {
  if (!path) return path;
  const key = pathKey(path), from = pathKey(source);
  return key === from || key.startsWith(`${from}/`) ? destination + path.slice(source.length) : path;
}

export function filteredWorkspaceTree(files, query) {
  const nodes = new Map();
  for (const file of files) {
    if (!file.relativePath.toLowerCase().includes(query.toLowerCase())) continue;
    const parts = file.relativePath.replace(/\\/g, '/').split('/');
    const root = file.path.slice(0, file.path.length - file.relativePath.length);
    for (let index = 0; index < parts.length; index++) {
      const relativePath = parts.slice(0, index + 1).join('/');
      const path = root + relativePath.replace(/\//g, file.path.includes('\\') ? '\\' : '/');
      nodes.set(pathKey(path), { path, relativePath, name: parts[index], isDirectory: index < parts.length - 1 });
    }
  }
  return [...nodes.values()];
}
