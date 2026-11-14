export const capitalSource = 'https://www.mauicounty.gov/DocumentCenter/View/155200/000-FY-2026-Program-Budget-Combined';
export const capitalProjects = [
  { id: 'CBS-6069', name: 'Countywide Bridge and Drainage Program', district: 'Countywide',
    budget: 8900000, phases: ['Planning', 'Design', 'New construction', 'Other'],
    start: null, end: null, pages: '1031–1032' },
  { id: 'CBS-7232', name: 'Countywide DPW Baseyard Facilities Program', district: 'Countywide',
    budget: 6975000, phases: ['Planning', 'Design', 'New construction'],
    start: null, end: null, pages: '1037–1038' },
  { id: 'CBS-1069', name: 'Waiale Road Extension', district: 'Wailuku-Kahului',
    budget: 87000000, phases: ['New construction', 'Other'],
    start: null, end: null, pages: '1047–1048' },
].map((project) => ({ ...project, fiscalYear: 2026, source: capitalSource,
  data_origin: 'county_published', actualCost: null, completed: null,
  scheduleBasis: 'Schedule unavailable in this funding snapshot' }));
