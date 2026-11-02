const driveOrUnc = /(?:^|[\s'"(=@])((?:[A-Za-z]:[\\/]|\\\\[^\\/\s]+[\\/])[^\s'"<>|?*\r\n)]*)/g;
const unixHome = /(?:^|[\s'"(=@])(\/(?:home|Users|opt|usr\/local)\/[^\s'"<>|?*\r\n)]+)/g;
const localTools = /\b(sqlplus|sqlcl|sql\.exe|sqlldr|impdp|expdp|exp|imp|rman|tnsping|powershell|cmd\.exe|bash|python)\b/i;
const hostCommand = /^\s*(HOST|!|\$)\s+(.+)$/im;
export const portabilityLimits = { findings: 300, excerpt: 120 };

function lineOf(text, index) { return text.slice(0, index).split('\n').length; }
const excerpt = text => text.trim().slice(0, portabilityLimits.excerpt);

// Scans one source text. Paths inside the workspace root are portable relative candidates; others tie the project to this machine.
export function scanSourceFile(file, root) {
  const text = String(file.content || ''), findings = [], normalizedRoot = String(root || '').replace(/\\/g, '/').toLowerCase().replace(/\/$/, '');
  for (const pattern of [driveOrUnc, unixHome]) {
    pattern.lastIndex = 0;
    for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
      const path = match[1].replace(/[;,.]+$/, ''), normalized = path.replace(/\\/g, '/').toLowerCase();
      const inside = normalizedRoot && normalized.startsWith(normalizedRoot + '/');
      findings.push({ kind: inside ? 'workspace-absolute-path' : 'machine-path', file: file.path, line: lineOf(text, match.index + match[0].length - path.length), detail: path, advice: inside ? 'Use a path relative to the workspace.' : 'This location exists only on this computer; use a relative path, a bind or a documented variable.' });
    }
  }
  const host = hostCommand.exec(text);
  if (host) findings.push({ kind: 'local-tool', file: file.path, line: lineOf(text, host.index), detail: excerpt(host[0]), advice: 'HOST commands run on the machine where the script is executed; document the tool or avoid it.' });
  else { const tool = localTools.exec(text.replace(/--[^\n]*/g, '').replace(/'(?:[^']|'')*'/g, "''")); if (tool && /^\s*(@|!|host\b)/im.test(text)) findings.push({ kind: 'local-tool', file: file.path, line: 1, detail: tool[0], advice: 'Make sure this tool is installed on every machine that runs the script.' }); }
  return findings;
}

// Profiles referenced by workspace files and rules: TNS aliases depend on an alias source file local to this computer.
export function scanProfiles(profiles, referencedIds, root) {
  const findings = [], normalizedRoot = String(root || '').replace(/\\/g, '/').toLowerCase().replace(/\/$/, '');
  for (const profile of profiles || []) {
    if (!referencedIds.has(profile.id)) continue;
    if (profile.method === 'tns' || profile.alias) {
      const source = String(profile.source || ''), normalized = source.replace(/\\/g, '/').toLowerCase();
      const inside = normalizedRoot && normalized.startsWith(normalizedRoot + '/');
      findings.push({ kind: 'tns-dependency', file: profile.name || profile.id, line: 0, detail: `${profile.alias || profile.id}${source ? ` from ${source}` : ''}`, advice: inside ? 'The alias file is inside the workspace; teammates still need the same alias name.' : 'The alias comes from a tnsnames.ora outside the workspace. Share the alias definition or switch to a Basic profile.' });
    }
  }
  return findings;
}

export function projectRuleFindings(rules, root) {
  const findings = [];
  const check = (label, value) => { const text = String(value || ''); if (/^(?:[A-Za-z]:[\\/]|\\\\|\/)/.test(text)) findings.push({ kind: 'machine-path', file: '.fbsdb/workspace.json', line: 0, detail: `${label}: ${text}`, advice: 'Project rules should use workspace-relative folders.' }); };
  for (const [area, folder] of Object.entries(rules?.project?.areas || {})) check(`area ${area}`, folder);
  for (const pair of rules?.packagePairs || []) { check('package spec', pair.specification || pair.spec); check('package body', pair.body); }
  for (const pattern of rules?.testPatterns || []) check('test pattern', pattern);
  return findings;
}

export function summarizeFindings(findings) {
  const limited = findings.slice(0, portabilityLimits.findings), counts = {};
  for (const finding of findings) counts[finding.kind] = (counts[finding.kind] || 0) + 1;
  return { findings: limited, truncated: findings.length > limited.length, counts, total: findings.length };
}
