// Turns datetime cells read from real Oracle into the literal and text the interface would use. Reads a JSON array of cells on stdin.
import { oracleTemporalSqlLiteral, reviveOracleTemporal } from '../../src/oracleTemporal.js';

let input = '';
for await (const chunk of process.stdin) input += chunk;
const answers = JSON.parse(input).map(cell => {
  const value = reviveOracleTemporal(cell);
  try { return { text: String(value), literal: oracleTemporalSqlLiteral(value) }; }
  catch (error) { return { text: String(value), refused: error.message }; }
});
process.stdout.write(JSON.stringify(answers));
