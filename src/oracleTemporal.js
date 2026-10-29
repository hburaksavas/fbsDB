const pattern=/^(-?\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}):(\d{2})(\.\d{1,9})?)?(Z|[+-]\d{2}:\d{2})?(?:\[(.+)\])?$/;
export function oracleTemporalText(value){
  if(value?.kind!=='temporal')return String(value??'');
  return value.value+(value.offset||'')+(value.region?`[${value.region}]`:value.sessionTimeZone?`[session:${value.sessionTimeZone}]`:'');
}
class OracleTemporalValue {
  constructor(value){this.kind='temporal';this.oracleType=value.oracleType;this.value=value.value;this.offset=value.offset??null;this.region=value.region??null;this.sessionTimeZone=value.sessionTimeZone??null;Object.freeze(this);}
  toString(){return oracleTemporalText(this)}
}
export function reviveOracleTemporal(value){
  if(value?.kind!=='temporal')return value;
  return value instanceof OracleTemporalValue?value:new OracleTemporalValue(value);
}
export function parseOracleTemporal(value){
  const cell=value?.kind==='temporal'?value:null,match=pattern.exec(cell?cell.value:String(value??''));if(!match)return null;
  const [year,month,day,hour,minute,second]=match.slice(1,7).map(part=>Number(part||0));
  if(year===0||month<1||month>12||day<1||day>31||hour>23||minute>59||second>59)return null;
  const fraction=(match[7]||'').slice(1),offset=cell?.offset||match[8]||null,annotation=match[9];
  const date=new Date(0);date.setUTCFullYear(year<0?year+1:year,month-1,day);date.setUTCHours(hour,minute,second,0);
  if(date.getUTCMonth()!==month-1||date.getUTCDate()!==day)return null;
  let offsetMinutes=0;
  if(offset&&offset!=='Z'){const zone=/^([+-])(\d{2}):(\d{2})$/.exec(offset);if(!zone||Number(zone[3])>59||Number(zone[2])>14)return null;offsetMinutes=(Number(zone[2])*60+Number(zone[3]))*(zone[1]==='-'?-1:1);}
  const base=date.getTime(),nanos=BigInt(fraction.padEnd(9,'0')||0);
  return {cell,year,month,day,hour,minute,second,fraction,offset,region:cell?.region||(!annotation?.startsWith('session:')?annotation:null),sessionTimeZone:cell?.sessionTimeZone||(annotation?.startsWith('session:')?annotation.slice(8):null),base,instantMilliseconds:base-offsetMinutes*60000,wallKey:BigInt(base)*1000000n+nanos,instantKey:BigInt(base-offsetMinutes*60000)*1000000n+nanos};
}
export function compareOracleTemporal(left,right){
  const a=parseOracleTemporal(left),b=parseOracleTemporal(right);if(!a||!b)return null;
  const x=a.offset&&b.offset?a.instantKey:a.wallKey,y=a.offset&&b.offset?b.instantKey:b.wallKey;return x<y?-1:x>y?1:0;
}
export function formatOracleTemporal(value,type,options={}){
  const parsed=parseOracleTemporal(value);if(!parsed)return null;
  const raw=oracleTemporalText(value),oracleType=parsed.cell?.oracleType||type||'TIMESTAMP',zoneAware=/WITH\s+TIME\s+ZONE|TIMESTAMPTZ/i.test(oracleType)&&!/LOCAL/i.test(oracleType);
  if(!options.dateFormat||options.dateFormat==='raw')return raw;
  if(options.dateFormat==='iso'){
    if(zoneAware||parsed.sessionTimeZone)return raw;
    return `${parsed.year<0?'-':''}${String(Math.abs(parsed.year)).padStart(4,'0')}-${String(parsed.month).padStart(2,'0')}-${String(parsed.day).padStart(2,'0')}T${String(parsed.hour).padStart(2,'0')}:${String(parsed.minute).padStart(2,'0')}:${String(parsed.second).padStart(2,'0')}${/^DATE$/i.test(oracleType)||!parsed.fraction?'':'.'+parsed.fraction}`;
  }
  const locale=options.locale||'en-US';let date=new Date(parsed.base),zone='UTC',suffix=zoneAware?parsed.offset||'':'';
  if(zoneAware&&parsed.offset&&options.timeZone){date=new Date(parsed.instantMilliseconds);zone=options.timeZone;suffix=` [${zone}]`;}
  else if(zoneAware&&parsed.region)suffix+=` [${parsed.region}]`;
  else if(parsed.sessionTimeZone)suffix=` [session:${parsed.sessionTimeZone}]`;
  const config={year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23',timeZone:zone,...(parsed.year<0?{era:'short'}:{})};
  try{
    const formatter=new Intl.DateTimeFormat(locale,config),decimal=new Intl.NumberFormat(locale).formatToParts(1.1).find(part=>part.type==='decimal')?.value||'.';
    return formatter.formatToParts(date).map(part=>part.type==='second'&&parsed.fraction&&!/^DATE$/i.test(oracleType)?part.value+decimal+parsed.fraction:part.value).join('')+suffix;
  }catch{return raw;}
}
export function oracleTemporalSqlLiteral(value,type){
  const parsed=parseOracleTemporal(value);if(!parsed)throw new Error('Invalid invariant Oracle datetime.');
  const oracleType=value?.oracleType||type||'TIMESTAMP';
  if(/LOCAL\s+TIME\s+ZONE/i.test(oracleType)&&!parsed.offset)throw new Error('LOCAL TIME ZONE exposes session wall time without an unambiguous offset. Include CAST(column AS TIMESTAMP WITH TIME ZONE) before generating precise SQL.');
  const source=value?.kind==='temporal'?value.value:String(value).replace(/\[.*\]$/,'').replace(/(?:Z|[+-]\d{2}:\d{2})$/,'');
  const wall=source.includes('T')||source.includes(' ')?source.replace('T',' '):source+' 00:00:00';
  let literal=`TIMESTAMP '${wall}${parsed.offset?' '+(parsed.offset==='Z'?'+00:00':parsed.offset):''}'`;
  if(/^DATE$/i.test(oracleType))return `CAST(${literal} AS DATE)`;
  if(parsed.region)literal=`(${literal} AT TIME ZONE '${parsed.region.replaceAll("'","''")}')`;
  return literal;
}
