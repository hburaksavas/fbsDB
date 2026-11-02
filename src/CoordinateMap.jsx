import {useMemo,useState} from 'react';
import {isNativeHost,sendNativeCommand} from './nativeBridge';
import {coordinateConvention,formatCoordinate,mapUrl,parseCoordinates,plotBounds,projectPoint} from './geoCoordinates';

const width = 420, height = 220;

// Offline coordinate plot: nothing is fetched. The optional website link sends the coordinates out, so it asks first.
export function CoordinateMap({value}) {
  const [order,setOrder]=useState('latlon'),[asking,setAsking]=useState(false);
  const parsed=useMemo(()=>parseCoordinates(value,{order}),[value,order]);
  const bounds=useMemo(()=>parsed.points.length?plotBounds(parsed.points):null,[parsed]);
  if(!parsed.points.length)return <div className="coordinate-map" role="status"><p>{parsed.error}</p>{<label>Pair order<select aria-label="Coordinate pair order" value={order} onChange={event=>setOrder(event.target.value)}><option value="latlon">Latitude, longitude</option><option value="lonlat">Longitude, latitude</option></select></label>}</div>;
  const projected=parsed.points.map(point=>projectPoint(point,bounds,width,height));
  const lines=[];
  for(let lon=Math.ceil(bounds.west/10)*10;lon<=bounds.east;lon+=Math.max(10,Math.round((bounds.east-bounds.west)/6/10)*10))lines.push(<line key={`x${lon}`} x1={projectPoint({lat:0,lon},bounds,width,height).x} x2={projectPoint({lat:0,lon},bounds,width,height).x} y1="0" y2={height} className="map-grid"/>);
  for(let lat=Math.ceil(bounds.south/10)*10;lat<=bounds.north;lat+=Math.max(10,Math.round((bounds.north-bounds.south)/4/10)*10))lines.push(<line key={`y${lat}`} y1={projectPoint({lat,lon:0},bounds,width,height).y} y2={projectPoint({lat,lon:0},bounds,width,height).y} x1="0" x2={width} className="map-grid"/>);
  const first=parsed.points[0];
  return <div className="coordinate-map">
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Coordinate plot of ${parsed.points.length} point${parsed.points.length===1?'':'s'}`}>
      <rect width={width} height={height} className="map-surface"/>{lines}
      {parsed.line&&<polyline className="map-line" fill="none" points={projected.map(point=>`${point.x},${point.y}`).join(' ')}/>}
      {projected.map((point,index)=><circle key={index} className="map-point" cx={point.x} cy={point.y} r="4"><title>{formatCoordinate(parsed.points[index])}</title></circle>)}
    </svg>
    <p className="map-convention">{parsed.kind}: {coordinateConvention}{parsed.truncated?' Only the first points are plotted.':''}</p>
    {parsed.ambiguous&&<label>Pair order<select aria-label="Coordinate pair order" value={order} onChange={event=>setOrder(event.target.value)}><option value="latlon">Latitude, longitude</option><option value="lonlat">Longitude, latitude</option></select></label>}
    <ul className="map-points" aria-label="Plotted coordinates">{parsed.points.slice(0,20).map((point,index)=><li key={index}>lat {point.lat.toFixed(6)}, lon {point.lon.toFixed(6)}</li>)}</ul>
    <div className="map-actions">
      <button type="button" onClick={()=>navigator.clipboard?.writeText(parsed.points.map(formatCoordinate).join('\n')).catch(()=>{})}>Copy coordinates</button>
      {!asking?<button type="button" onClick={()=>setAsking(true)}>Open in OpenStreetMap…</button>
      :<span role="alert" className="map-consent">This opens openstreetmap.org in your browser and sends {formatCoordinate(first)} to it. <button type="button" onClick={()=>{setAsking(false);if(isNativeHost)sendNativeCommand('result.openUrl',{url:mapUrl(first)});else window.open(mapUrl(first),'_blank','noopener,noreferrer')}}>Send and open</button><button type="button" onClick={()=>setAsking(false)}>Cancel</button></span>}
    </div>
  </div>;
}
