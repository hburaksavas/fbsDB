export const LEARNING_KEY = 'fbsdb.suggestionLearning.v1';
const DAY = 86400000;
export const learningContext = context => context.relation ? 'relation' : context.qualifier ? 'member' : context.clause || (context.plsql ? 'PLSQL' : 'statement');
export const learningScope = (workspace, profile) => JSON.stringify([workspace || '', profile || 'offline']);
export class SuggestionLearning {
  constructor(storage, now = () => Date.now()) {
    this.storage = storage; this.now = now; this.seen = new Set();
    try { const data = JSON.parse(storage.getItem(LEARNING_KEY) || '{}'); this.entries = data.version === 1 && Array.isArray(data.entries) ? data.entries.filter(e => typeof e.scope === 'string' && typeof e.context === 'string' && typeof e.key === 'string' && Number.isFinite(e.count) && e.count > 0 && Number.isFinite(e.last)) : []; } catch { this.entries = []; }
    this.prune();
  }
  prune() { this.entries = this.entries.filter(e => this.now() - e.last < 90 * DAY).sort((a,b) => b.last-a.last).slice(0, 2000); }
  record(scope, context, key, weight = 1) {
    if (!key || key.length > 1024) return;
    let entry = this.entries.find(e => e.scope === scope && e.context === context && e.key === key);
    if (!entry) { entry = { scope, context, key, count: 0, last: this.now() }; this.entries.push(entry); }
    entry.count = Math.max(0, entry.count * Math.pow(0.5, (this.now()-entry.last)/(30*DAY)) + weight); entry.last = this.now();
    this.prune(); try { this.storage.setItem(LEARNING_KEY, JSON.stringify({ version: 1, entries: this.entries })); } catch {}
  }
  observe(scope, observations) {
    // Only resolved identities reach this boundary; raw SQL is never retained.
    for (const item of observations) { const id = JSON.stringify([scope,item.context,item.key]); if (this.seen.has(id)) continue; this.seen.add(id); this.record(scope,item.context,item.key,0.25); }
    if (this.seen.size > 4000) this.seen.clear();
  }
  snapshot(scope) { this.prune(); return this.entries.filter(e => e.scope === scope).map(({context,key,count,last}) => ({context,key,count,last})); }
  clear() { this.entries = []; this.seen.clear(); this.storage.removeItem(LEARNING_KEY); }
}
export function rankLearnedCandidates(candidates, context, entries = [], now = Date.now()) {
  const bucket = learningContext(context);
  const score = candidate => { const e = entries.find(e => e.context === bucket && e.key === candidate.key); return e ? Math.min(0.75, Math.log1p(e.count) / 5) * Math.pow(0.5, Math.max(0,now-e.last)/(30*DAY)) : 0; };
  // A bounded boost never crosses the existing grammar/scope rank tier.
  return candidates.map((candidate,index) => ({candidate,index,score: score(candidate)})).sort((a,b) => Math.floor(a.candidate.rank)-Math.floor(b.candidate.rank) || (a.candidate.rank-a.score)-(b.candidate.rank-b.score) || a.index-b.index).map(item => item.candidate);
}
