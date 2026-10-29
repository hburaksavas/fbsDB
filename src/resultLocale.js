import { compareExact } from './exactDecimal.js';

export function foldResultText(value,locale,caseSensitive=false){
  const text=String(value);if(caseSensitive)return text;
  try{return text.toLocaleLowerCase(locale||undefined)}catch{return text.toLowerCase()}
}
export function compareResultNumbers(left,right){try{return compareExact(left,right)}catch{return null}}
