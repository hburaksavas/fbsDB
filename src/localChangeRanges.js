// Line-level LCS is bounded; large unrelated spans use an explicitly coarse range.
export function localChangeRanges(before,after){
 if(before===after)return {ranges:[],coarse:false};
 const a=before.split(/\r?\n/),b=after.split(/\r?\n/);let first=0,endA=a.length,endB=b.length;
 while(first<endA&&first<endB&&a[first]===b[first])first++;
 while(endA>first&&endB>first&&a[endA-1]===b[endB-1]){endA--;endB--}
 const n=endA-first,m=endB-first,mark=(start,end)=>({start:Math.min(b.length,start+1),end:Math.min(b.length,Math.max(start+1,end))});
 if((n+1)*(m+1)>1000000)return {ranges:[mark(first,endB)],coarse:true};
 const width=m+1,dp=new Uint32Array((n+1)*width);
 for(let i=n-1;i>=0;i--)for(let j=m-1;j>=0;j--)dp[i*width+j]=a[first+i]===b[first+j]?dp[(i+1)*width+j+1]+1:Math.max(dp[(i+1)*width+j],dp[i*width+j+1]);
 const ranges=[];let i=0,j=0;
 const add=line=>{line=Math.min(b.length,line+1);const last=ranges.at(-1);if(last&&line<=last.end+1)last.end=Math.max(last.end,line);else ranges.push({start:line,end:line})};
 while(i<n||j<m){if(i<n&&j<m&&a[first+i]===b[first+j]){i++;j++}else if(i<n&&(j===m||dp[(i+1)*width+j]>=dp[i*width+j+1])){add(first+j);i++}else{add(first+j);j++}}
 return {ranges:ranges.slice(0,500),coarse:ranges.length>500};
}
