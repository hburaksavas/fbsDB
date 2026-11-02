// Pipeline shown to the user; "Oracle service" and "Target" are reported by the database driver after the network probes.
export const diagnosticStages = ['DNS', 'Network', 'Oracle service', 'Authentication'];

const oraAdvice = {
  1017: { meaning: 'The user name or password was rejected.', checks: ['Re-enter the password; passwords are case-sensitive in recent Oracle versions.', 'Confirm the user exists in the target database or pluggable database.'] },
  28000: { meaning: 'The account is locked.', checks: ['Ask a DBA to unlock the account.', 'Repeated failed sign-ins may have locked it.'] },
  28001: { meaning: 'The password has expired.', checks: ['Change the password with a tool that supports expired-password sign-in, or ask a DBA to reset it.'] },
  28002: { meaning: 'The password expires soon (grace period).', checks: ['Change the password before the grace period ends.'] },
  12154: { meaning: 'Oracle could not resolve the connect identifier.', checks: ['Check the TNS alias spelling and that the alias source file is available.', 'For Basic profiles verify host, port and service name.'] },
  12514: { meaning: 'The listener does not know the requested service.', checks: ['Check the service name (not the SID) against `lsnrctl services` on the server.', 'The database may still be registering with the listener.'] },
  12505: { meaning: 'The listener does not know the requested SID.', checks: ['Use a service name instead of a SID, or correct the SID.'] },
  12541: { meaning: 'No listener answered at that host and port.', checks: ['Verify host and port, and that the listener is running.', 'A firewall or VPN may be blocking the port.'] },
  12170: { meaning: 'The connection attempt timed out.', checks: ['Check the VPN, proxy or firewall between this computer and the server.', 'Verify the host name resolves to the intended server.'] },
  12537: { meaning: 'The listener closed the connection.', checks: ['Check listener logs and any connection-rate or allow-list rules.'] },
  12560: { meaning: 'A protocol adapter error occurred.', checks: ['Check the connect descriptor syntax and the protocol (TCP vs TCPS).'] },
};
const stageAdvice = {
  DNS: { meaning: 'The host name could not be resolved by this probe.', checks: ['Check spelling and your DNS or VPN. Oracle may still resolve a configured descriptor itself.'] },
  Network: { meaning: 'The TCP port did not accept a connection in the probe time.', checks: ['Verify host and port, firewall/VPN, and that the listener is running.', 'Descriptors with failover or non-TCP protocols can still connect.'] },
};

// Turns a diagnostic step into a plain-language explanation; the raw message stays visible next to it.
export function stepAdvice(step) {
  if (!step || step.status === 'Succeeded' || step.status === 'Skipped') return null;
  const ora = /ORA-(\d{5})/.exec(step.message || ''), code = ora ? Number(ora[1]) : null;
  const found = (code != null && oraAdvice[code]) || stageAdvice[step.stage] || null;
  return found ? { code, ...found } : code != null ? { code, meaning: 'Oracle reported an error that has no built-in explanation.', checks: ['Search the ORA code in the Oracle error documentation and your DBA runbooks.'] } : null;
}

// Maps the steps to the four user-facing stages: passed, failed/warning, skipped, or not reached.
export function stageOverview(steps = []) {
  const byStage = new Map(), failedStages = new Set();
  for (const step of steps) {
    const stage = step.stage === 'Target' || step.stage === 'Oracle network' ? 'Oracle service' : step.stage === 'Oracle session' ? 'Authentication' : step.stage;
    if (!byStage.has(stage) || step.status === 'Failed') byStage.set(stage, step);
    if (step.status === 'Failed') failedStages.add(stage);
  }
  let stopped = false;
  return diagnosticStages.map(stage => {
    const step = byStage.get(stage);
    if (step) { const state = step.status === 'Failed' ? 'failed' : step.status === 'Warning' ? 'warning' : step.status === 'Skipped' ? 'skipped' : 'passed'; if (state === 'failed') stopped = true; return { stage, state, step }; }
    if (stage === 'Oracle service' && byStage.get('Authentication')?.status === 'Succeeded') return { stage, state: 'passed', step: null, implied: true };
    return { stage, state: stopped ? 'not reached' : 'not run', step: null };
  });
}
