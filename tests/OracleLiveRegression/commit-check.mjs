// Prepares a pre-commit check and judges Oracle's reply with the grid's own code. Reads a request as JSON on stdin.
import { evaluateCheck, prepareCheck } from '../../src/commitChecks.js';

let input = '';
for await (const chunk of process.stdin) input += chunk;
const { check, reply } = JSON.parse(input);
const prepared = prepareCheck(check);
process.stdout.write(JSON.stringify(reply ? { ...prepared, outcome: evaluateCheck(prepared.check, reply) } : prepared));
