// Stands in for ssh.exe in the session services smoke test. The SSH host
// name picks the behaviour; "ok.test" forwards the -L port like a real tunnel.
import net from 'node:net';
import { existsSync, readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const host = args.at(-1);
const forward = args[args.indexOf('-L') + 1];
const port = args[args.indexOf('-p') + 1];
const knownHosts = args.find(arg => arg.startsWith('UserKnownHostsFile='))?.slice('UserKnownHostsFile='.length);
// Like real ssh, a host becomes usable once its key is in known_hosts.
const known = knownHosts && existsSync(knownHosts) && readFileSync(knownHosts, 'utf8').split(/\r?\n/).some(line => line.startsWith(port === '22' ? `${host} ` : `[${host}]:${port} `));
if (host === 'unknown.test' && !known) {
  process.stderr.write(`No ED25519 host key is known for ${host} and you have requested strict checking.\r\nHost key verification failed.\r\n`);
  process.exit(255);
}
if (host === 'changed.test') {
  process.stderr.write('@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@\r\n@    WARNING: REMOTE HOST IDENTIFICATION HAS CHANGED!     @\r\nHost key verification failed.\r\n');
  process.exit(255);
}
if (host === 'denied.test') { process.stderr.write('dev@denied.test: Permission denied (publickey).\r\n'); process.exit(255); }
if (!(host === 'ok.test' || host === 'unknown.test' && known) || !forward) { process.stderr.write(`ssh: connect to host ${host} port 22: Connection refused\r\n`); process.exit(255); }
const [, localPort, targetHost, targetPort] = forward.split(':');
net.createServer(client => {
  const target = net.connect(Number(targetPort), targetHost);
  client.pipe(target).pipe(client);
  client.on('error', () => target.destroy()); target.on('error', () => client.destroy());
}).listen(Number(localPort), '127.0.0.1');
