import { csvCell } from './csv.mjs';
import { capitalProjects, capitalSource } from './capital-project-data.mjs';

export function filterCapital({ phase = '', district = '' } = {}) {
  return capitalProjects.filter((project) => (!phase || project.phases.includes(phase)) &&
    (!district || project.district === district));
}

export function capitalCsv(projects) {
  const fields = ['id', 'name', 'district', 'phases', 'budget', 'fiscalYear', 'start', 'end',
    'scheduleBasis', 'actualCost', 'completed', 'data_origin', 'source', 'pages'];
  return [fields.map(csvCell).join(','), ...projects.map((project) => fields.map((field) =>
    csvCell(Array.isArray(project[field]) ? project[field].join('; ') : project[field])).join(','))].join('\r\n');
}

export function capitalAnswer(projects) {
  if (!projects.length) return 'Demo answer: no projects match these filters. No overrun or delay assessment is available.';
  return `Demo answer: ${projects.map((project) => project.id).join(', ')} are the ${projects.length} visible projects. ` +
    'Cannot determine which are over budget or late: these planning records do not include actual costs or completion status. ' +
    'Planned dates alone are not evidence of delay.';
}

export function capitalGeometry({ projects, land, roads }) {
  return { type: 'FeatureCollection', features: projects.flatMap((project) => {
    const references = project.district === 'Countywide' ? land.features : roads.features.filter((feature) =>
      Object.values(feature.properties || {}).some((value) => /waiale/i.test(String(value))));
    return references.map((feature) => ({ type: 'Feature', geometry: feature.geometry,
      properties: { projectId: project.id, locationBasis: project.district === 'Countywide' ?
        'Countywide coverage; not individual worksites' : 'Existing Waiale road reference; not extension alignment' } }));
  }) };
}

const money = (value) => value.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const element = (id) => document.getElementById(id);

function renderProjects(projects) {
  element('capitalRows').replaceChildren(...projects.map((project) => {
    const row = document.createElement('tr');
    row.dataset.projectId = project.id;
    for (const value of [project.id, project.name, project.district, project.phases.join(', '),
      money(project.budget), project.start && project.end ? `${project.start} – ${project.end}` : 'Not available in funding snapshot']) {
      const cell = document.createElement('td');
      cell.textContent = value;
      row.append(cell);
    }
    return row;
  }));
  element('capitalTotal').textContent = money(projects.reduce((sum, project) => sum + project.budget, 0));
  element('capitalCount').textContent = `${projects.length} projects`;
  element('capitalAnswer').textContent = capitalAnswer(projects);
  element('capitalEmpty').hidden = projects.length > 0;
}

function updateCapitalMap({ map, projects, active }) {
  const geometry = capitalGeometry({ projects, land: HM.get('land'), roads: HM.get('roads') });
  if (!map.getSource('capital-projects')) {
    map.addSource('capital-projects', { type: 'geojson', data: geometry });
    map.addLayer({ id: 'capital-coverage', type: 'fill', source: 'capital-projects',
      filter: ['==', ['geometry-type'], 'Polygon'], paint: { 'fill-color': '#7356bf', 'fill-opacity': 0.18 } });
    map.addLayer({ id: 'capital-road', type: 'line', source: 'capital-projects',
      filter: ['==', ['geometry-type'], 'LineString'], paint: { 'line-color': '#7356bf', 'line-width': 6 } });
  }
  map.getSource('capital-projects').setData(geometry);
  for (const id of ['capital-coverage', 'capital-road']) map.setLayoutProperty(id, 'visibility', active ? 'visible' : 'none');
  const located = new Set(geometry.features.map((feature) => feature.properties.projectId));
  element('capitalLocations').textContent = `${located.size} projects have coverage or road references; ${projects.length - located.size} have no mapped reference. ` +
    'Countywide shading and the existing Waiale road are references, not construction sites or extension boundaries.';
  element('capitalLocations').dataset.mappedIds = [...located].join(',');
}

function downloadCapital(projects) {
  const url = URL.createObjectURL(new Blob([capitalCsv(projects)], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'maui-capital-projects-filtered.csv';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function mountCapital() {
  let active = false;
  let projects = filterCapital();
  const refresh = () => {
    projects = filterCapital({ phase: element('capitalPhase').value, district: element('capitalDistrict').value });
    renderProjects(projects);
    if (window.publicWorksMap) updateCapitalMap({ map: window.publicWorksMap, projects, active });
  };
  const switchView = (view) => {
    const capital = view === 'capital';
    active = capital;
    element('capitalView').hidden = !capital;
    element('inspectionView').hidden = capital;
    element('capitalButton').setAttribute('aria-pressed', String(capital));
    element('inspectionButton').setAttribute('aria-pressed', String(!capital));
    element('map').setAttribute('aria-label', capital ? 'Capital project coverage and road references' : 'Asset map');
    window.dispatchEvent(new CustomEvent('publicworksview', { detail: { capital } }));
    refresh();
  };
  for (const link of document.querySelectorAll('[data-publicworks-view]')) {
    link.addEventListener('click', () => switchView(link.dataset.publicworksView));
  }
  element('capitalSource').href = capitalSource;
  element('capitalPhase').addEventListener('change', refresh);
  element('capitalDistrict').addEventListener('change', refresh);
  element('capitalExport').addEventListener('click', () => downloadCapital(projects));
  element('capitalButton').addEventListener('click', () => switchView('capital'));
  element('inspectionButton').addEventListener('click', () => switchView('inspections'));
  window.addEventListener('publicworksmapready', () => switchView(active ? 'capital' : 'inspections'));
  refresh();
}
