// Add display aliases without discarding the source attributes or provenance.
const title = (value) => String(value ?? '').trim().toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
const aliases = {
  slr32: () => ({ scenario: '3.2 ft' }),
  council: (p) => ({ num: p.districtnumber, name: p.district }),
  streams: (p) => ({ name: p.stream_nam }),
  waterbodies: (p) => ({ name: p.gnis_name }),
  fire: (p) => ({ name: p.alt_name || p.name }),
  police: (p) => ({ name: p.station_name, addr: p.full_address }),
  schools: (p) => ({ name: p.sch_name, addr: p.address }),
  hospitals: (p) => ({ addr: p.address_addressline1 }),
  places: (p) => ({ name: p.feature_name, cls: p.feature_class }),
  bridges: (p) => ({ id: String(p.structure_number_008 ?? '').trim(), carries: title(p.facility_carried_007),
    over: title(p.features_desc_006a), loc: title(p.location_009), built: p.year_built_027, adt: p.adt_029,
    deck: p.deck_cond_058, sup: p.superstructure_cond_059, sub: p.substructure_cond_060,
    culv: p.culvert_cond_062, cond: p.bridge_condition, low: p.lowest_rating,
    insp: p.date_of_inspect_090, len: p.structure_len_mt_049 }),
  slud: (p) => ({ lud: p.ludcode }),
  sma: () => ({ sma: 1 }),
};

export function islandDisplay(name, collection) {
  return { ...collection, features: collection.features.map((feature) => ({ ...feature,
    id: feature.properties.objectid, properties: { ...feature.properties,
      ...aliases[name]?.(feature.properties), data_origin: 'real' } })) };
}
