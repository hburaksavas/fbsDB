import { lexOracle } from './oracleLexer.js';
export function isDdl(sql) { return ['CREATE','ALTER','DROP','TRUNCATE','RENAME','COMMENT','GRANT','REVOKE','AUDIT','NOAUDIT'].includes(lexOracle(sql).find(token=>token.kind!=='comment')?.value.toUpperCase()); }
