import test from 'node:test';
import assert from 'node:assert/strict';
import { capitalProjects } from '../../shared/state-local/capital-project-data.mjs';
import { filterCapital, capitalCsv, capitalAnswer, capitalGeometry } from '../../shared/state-local/capital-projects.mjs';

test('published project funding is counted once across multiple planned phases', () => {
  assert.equal(filterCapital().reduce((sum, project) => sum + project.budget, 0), 102875000);
  assert.deepEqual(filterCapital({ phase: 'Design' }).map((project) => project.id), ['CBS-6069', 'CBS-7232']);
  assert.deepEqual(filterCapital({ district: 'Wailuku-Kahului' }).map((project) => project.id), ['CBS-1069']);
  assert.deepEqual(filterCapital({ phase: 'Design', district: 'Wailuku-Kahului' }), []);
});

test('filtered CSV preserves provenance and explicitly unavailable actuals', () => {
  const csv = capitalCsv(filterCapital({ district: 'Wailuku-Kahului' }));
  assert.equal(csv.split('\r\n').length, 2);
  assert.match(csv, /CBS-1069/);
  assert.doesNotMatch(csv, /CBS-6069/);
  assert.match(csv, /county_published/);
  assert.match(csv, /155200/);
  assert.match(csv, /actualCost.*completed/);
  assert.ok(capitalProjects.every(({ start, end }) => start === null && end === null));
  assert.match(csv, /Schedule unavailable in this funding snapshot/);
  assert.match(capitalCsv([{ ...capitalProjects[0], name: '=SUM(A1),"quoted"' }]), /'=SUM\(A1\),""quoted""/);
});

test('planning data never turns a passed date or missing cost into a late or over-budget claim', () => {
  const answer = capitalAnswer([capitalProjects[2]]);
  assert.match(answer, /Demo answer: CBS-1069/);
  assert.doesNotMatch(answer, /CBS-6069/);
  assert.match(answer, /Cannot determine/);
  assert.match(answer, /do not include actual costs or completion status/);
  assert.match(capitalAnswer([]), /no projects match/);
});

test('map references preserve real geometry and do not invent missing project locations', () => {
  const polygon = { type: 'Polygon', coordinates: [] };
  const line = { type: 'LineString', coordinates: [] };
  const land = { features: [{ properties: {}, geometry: polygon }] };
  const roads = { features: [{ properties: { name: 'Waiale Road' }, geometry: line },
    { properties: { name: 'Other road' }, geometry: line }] };
  const geometry = capitalGeometry({ projects: capitalProjects, land, roads });
  assert.equal(geometry.features.length, 3);
  assert.deepEqual(geometry.features.map((feature) => feature.geometry), [polygon, polygon, line]);
  assert.match(geometry.features[2].properties.locationBasis, /not extension alignment/);
  assert.equal(capitalGeometry({ projects: [capitalProjects[2]], land, roads: { features: [] } }).features.length, 0);
  assert.equal(capitalGeometry({ projects: [], land, roads }).features.length, 0);
});
