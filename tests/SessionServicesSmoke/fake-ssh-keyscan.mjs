// Stands in for ssh-keyscan.exe: prints the host keys a server would offer.
const args = process.argv.slice(2);
const host = args.at(-1), port = args[args.indexOf('-p') + 1];
const name = port === '22' ? host : `[${host}]:${port}`;
process.stdout.write(`# ${host}:${port} SSH-2.0-OpenSSH_9.6\n`);
process.stdout.write(`${name} ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAAAgQC7\n`);
process.stdout.write(`${name} ssh-ed25519 ${process.env.FAKE_HOST_KEY}\n`);
