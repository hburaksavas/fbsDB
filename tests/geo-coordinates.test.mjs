import test from 'node:test';
import assert from 'node:assert/strict';
import {formatCoordinate,looksGeographic,mapUrl,parseCoordinates,plotBounds,projectPoint} from '../src/geoCoordinates.js';
test('GeoJSON, WKT and SDO values are read longitude first',()=>{
 assert.deepEqual(parseCoordinates('{"type":"Point","coordinates":[28.9784,41.0082]}').points,[{lat:41.0082,lon:28.9784}]);
 assert.deepEqual(parseCoordinates('POINT(28.9784 41.0082)').points,[{lat:41.0082,lon:28.9784}]);
 assert.deepEqual(parseCoordinates('SRID=4326;LINESTRING(0 0, 10 20)').points,[{lat:0,lon:0},{lat:20,lon:10}]);
 assert.equal(parseCoordinates('SDO_GEOMETRY(2001,4326,SDO_POINT_TYPE(28.9,41.0,NULL),NULL,NULL)').points[0].lat,41);
 assert.equal(parseCoordinates('{"type":"Feature","geometry":{"type":"MultiPoint","coordinates":[[1,2],[3,4]]}}').points.length,2);
});
test('plain pairs follow the chosen order and are marked ambiguous',()=>{
 const latlon=parseCoordinates('41.0082, 28.9784'),lonlat=parseCoordinates('28.9784, 41.0082',{order:'lonlat'});
 assert.deepEqual(latlon.points,lonlat.points);assert.equal(latlon.ambiguous,true);
 assert.match(parseCoordinates('200, 10').error,/outside/);
});
test('other reference systems, bad ranges and unknown text are explained instead of guessed',()=>{
 assert.match(parseCoordinates('SRID=3857;POINT(100 200)').error,/SRID 3857/);
 assert.match(parseCoordinates('SDO_GEOMETRY(2001,8307,SDO_POINT_TYPE(1,2,NULL),NULL,NULL)').points.length?'':parseCoordinates('SDO_GEOMETRY(2001,2056,SDO_POINT_TYPE(1,2,NULL),NULL,NULL)').error,/2056/);
 assert.match(parseCoordinates('hello').error,/not GeoJSON/);assert.match(parseCoordinates('').error,/No value/);
 assert.match(parseCoordinates('POINT(500 10)').error,/outside/);
});
test('geographic detection ignores arbitrary text and non-WGS84 values',()=>{
 assert.equal(looksGeographic({},'POINT(1 2)'),true);assert.equal(looksGeographic({},'1, 2'),false);assert.equal(looksGeographic({},'SRID=3857;POINT(1 2)'),false);assert.equal(looksGeographic({},'{"a":1}'),false);
});
test('projection stays inside the plot and map links use rounded coordinates',()=>{
 const points=[{lat:41,lon:29},{lat:41.2,lon:29.4}],bounds=plotBounds(points);
 for(const point of points){const at=projectPoint(point,bounds,400,200);assert.ok(at.x>=0&&at.x<=400&&at.y>=0&&at.y<=200)}
 assert.ok(projectPoint({lat:90,lon:-180},{south:-90,north:90,west:-180,east:180},360,180).y===0);
 assert.equal(formatCoordinate({lat:1.5,lon:-2}),'1.500000, -2.000000');assert.match(mapUrl({lat:1.5,lon:-2}),/^https:\/\/www\.openstreetmap\.org\/\?mlat=1\.500000&mlon=-2\.000000/);
});
