// Conventions used here, stated in the viewer: coordinates are WGS 84 (SRID 4326) degrees. WKT, GeoJSON and SDO_POINT_TYPE
// store longitude first (x y); a plain "a, b" pair has no standard order, so the user picks it and the default is latitude, longitude.
export const coordinateConvention = 'WGS 84 (SRID 4326). WKT, GeoJSON and SDO_GEOMETRY list longitude first; plain pairs use the order you choose.';
export const maxPoints = 500;

const number = '[-+]?\\d+(?:\\.\\d+)?(?:[eE][-+]?\\d+)?';
const inRange = (lat, lon) => Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
const pointsFrom = pairs => pairs.map(([lon, lat]) => ({ lat, lon }));

function fromGeoJson(text) {
  let data;
  try { data = JSON.parse(text); } catch { return null; }
  const geometry = data?.type === 'Feature' ? data.geometry : data;
  const raw = geometry?.type === 'Point' ? [geometry.coordinates] : ['MultiPoint', 'LineString'].includes(geometry?.type) ? geometry.coordinates : null;
  if (!Array.isArray(raw) || !raw.every(pair => Array.isArray(pair) && pair.length >= 2 && pair.slice(0, 2).every(Number.isFinite))) return null;
  return { kind: 'GeoJSON', pairs: raw.map(pair => [pair[0], pair[1]]) };
}

function fromWkt(text) {
  const match = new RegExp(`^\\s*(?:SRID=(\\d+);)?\\s*(POINT|MULTIPOINT|LINESTRING)\\s*(?:Z|M|ZM)?\\s*\\((.*)\\)\\s*$`, 'is').exec(text);
  if (!match) return null;
  const tuples = [...match[3].matchAll(new RegExp(`(${number})\\s+(${number})(?:\\s+${number}){0,2}`, 'g'))].map(item => [Number(item[1]), Number(item[2])]);
  return tuples.length ? { kind: 'WKT', pairs: tuples, srid: match[1] ? Number(match[1]) : null } : null;
}

function fromSdo(text) {
  const match = new RegExp(`SDO_GEOMETRY\\s*\\(\\s*\\d+\\s*,\\s*(NULL|\\d+)\\s*,\\s*SDO_POINT_TYPE\\s*\\(\\s*(${number})\\s*,\\s*(${number})`, 'i').exec(text);
  return match ? { kind: 'SDO_GEOMETRY', pairs: [[Number(match[2]), Number(match[3])]], srid: /null/i.test(match[1]) ? null : Number(match[1]) } : null;
}

function fromPair(text, order) {
  const match = new RegExp(`^\\s*(${number})\\s*[,;\\s]\\s*(${number})\\s*$`).exec(text);
  if (!match) return null;
  const a = Number(match[1]), b = Number(match[2]);
  return { kind: 'coordinate pair', pairs: order === 'lonlat' ? [[a, b]] : [[b, a]], ambiguous: true };
}

// Parses a cell value into plottable points, or explains why it cannot be plotted. Nothing is guessed silently.
export function parseCoordinates(value, { order = 'latlon' } = {}) {
  const text = String(value ?? '').trim();
  if (!text) return { points: [], error: 'No value.' };
  const found = (text.startsWith('{') ? fromGeoJson(text) : null) || fromWkt(text) || fromSdo(text) || fromPair(text, order);
  if (!found) return { points: [], error: 'The value is not GeoJSON, WKT, SDO_GEOMETRY point or a latitude/longitude pair.' };
  if (found.srid != null && found.srid !== 4326) return { points: [], kind: found.kind, error: `SRID ${found.srid} is not WGS 84 (4326); the value is not plotted because converting it would be a guess.` };
  const points = pointsFrom(found.pairs);
  if (!points.length || !points.every(point => inRange(point.lat, point.lon))) return { points: [], kind: found.kind, error: 'The coordinates are outside latitude ±90 / longitude ±180. Check the order.' };
  const limited = points.slice(0, maxPoints);
  return { points: limited, kind: found.kind, ambiguous: Boolean(found.ambiguous), truncated: points.length > limited.length, line: found.kind !== 'coordinate pair' && points.length > 1 };
}

export function looksGeographic(column, value) {
  const text = String(value ?? '').trim();
  if (!text || text.length > 20000) return false;
  const parsed = text.startsWith('{') ? fromGeoJson(text) : fromWkt(text) || fromSdo(text);
  return Boolean(parsed) && !parsed.srid;
}

// Plot window: the whole world for one far-away point set, otherwise the padded bounding box (never smaller than half a degree).
export function plotBounds(points) {
  const lats = points.map(point => point.lat), lons = points.map(point => point.lon);
  let south = Math.min(...lats), north = Math.max(...lats), west = Math.min(...lons), east = Math.max(...lons);
  const padLat = Math.max((north - south) * 0.15, 0.25), padLon = Math.max((east - west) * 0.15, 0.25);
  south = Math.max(-90, south - padLat); north = Math.min(90, north + padLat); west = Math.max(-180, west - padLon); east = Math.min(180, east + padLon);
  return { south, north, west, east };
}

export function projectPoint(point, bounds, width, height) {
  return { x: ((point.lon - bounds.west) / (bounds.east - bounds.west)) * width, y: ((bounds.north - point.lat) / (bounds.north - bounds.south)) * height };
}

export const formatCoordinate = point => `${point.lat.toFixed(6)}, ${point.lon.toFixed(6)}`;
// Opening a map website sends the coordinates to it, so callers must ask the user first.
export const mapUrl = point => `https://www.openstreetmap.org/?mlat=${point.lat.toFixed(6)}&mlon=${point.lon.toFixed(6)}#map=14/${point.lat.toFixed(6)}/${point.lon.toFixed(6)}`;
