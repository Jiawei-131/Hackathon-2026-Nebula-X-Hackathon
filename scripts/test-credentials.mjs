try { process.loadEnvFile(); } catch (error) {
  if (error.code !== 'ENOENT') throw error;
}

const {createLtaAdapter} = await import('../lib/api/lta.mjs');

const orsKey = process.env.OPENROUTESERVICE_API_KEY || '';
console.log(JSON.stringify({
  orsKeyConfigured: Boolean(orsKey),
  orsKeyLength: orsKey.length,
  orsKeyHasWhitespace: /\s/.test(orsKey),
  orsKeyHasWrappingQuotes: /^["']|["']$/.test(orsKey)
}));
if (orsKey) {
  try {
    const response = await fetch('https://api.openrouteservice.org/v2/directions/foot-walking/geojson', {
      method: 'POST',
      headers: {Authorization: orsKey, 'Content-Type': 'application/json'},
      body: JSON.stringify({coordinates: [[103.851463, 1.283933], [103.853283, 1.284335]]}),
      signal: AbortSignal.timeout(15000)
    });
    let data = {};
    try { data = await response.json(); } catch {}
    const feature = data.features?.[0];
    console.log(JSON.stringify({
      provider: 'openrouteservice',
      status: response.status,
      ok: response.ok,
      errorCode: data.error?.code ?? null,
      errorMessage: data.error?.message ?? null,
      distanceMetres: feature?.properties?.summary?.distance ?? null,
      durationSeconds: feature?.properties?.summary?.duration ?? null,
      geometryType: feature?.geometry?.type ?? null,
      coordinateCount: feature?.geometry?.coordinates?.length ?? null
    }));
  } catch (error) {
    console.log(JSON.stringify({provider: 'openrouteservice', networkError: error.name, message: error.message}));
  }
}

const token = process.env.ONEMAP_API_TOKEN || '';
console.log(JSON.stringify({
  tokenConfigured: Boolean(token),
  tokenLength: token.length,
  hasWhitespace: /\s/.test(token),
  hasWrappingQuotes: /^["']|["']$/.test(token),
  jwtParts: token.split('.').length
}));

const url = 'https://www.onemap.gov.sg/api/common/elastic/search?searchVal=One%20Raffles%20Place&returnGeom=Y&getAddrDetails=Y&pageNum=1';
try {
  const response = await fetch(url, {headers: {Authorization: token}, signal: AbortSignal.timeout(15000)});
  let data = {};
  try { data = await response.json(); } catch {}
  console.log(JSON.stringify({
    status: response.status,
    ok: response.ok,
    error: data.error || null,
    found: data.found ?? null,
    resultCount: Array.isArray(data.results) ? data.results.length : null
  }));
  if (!data.error && data.results?.[0]) {
    const result = data.results[0];
    const walkUrl = new URL('https://www.onemap.gov.sg/api/public/routingsvc/route');
    walkUrl.searchParams.set('start', '1.283933,103.851463');
    walkUrl.searchParams.set('end', `${result.LATITUDE},${result.LONGITUDE}`);
    walkUrl.searchParams.set('routeType', 'walk');
    const walkResponse = await fetch(walkUrl, {headers: {Authorization: token}, signal: AbortSignal.timeout(15000)});
    const walk = await walkResponse.json();
    console.log(JSON.stringify({
      walkingStatus: walkResponse.status,
      walkingFound: walk.status === 0,
      walkingMetres: walk.route_summary?.total_distance ?? null,
      walkingSeconds: walk.route_summary?.total_time ?? null,
      walkingGeometry: typeof walk.route_geometry === 'string' && walk.route_geometry.length > 0
    }));
  }
} catch (error) {
  console.log(JSON.stringify({networkError: error.name, message: error.message}));
}

const ltaKey = process.env.LTA_DATAMALL_ACCOUNT_KEY || '';
console.log(JSON.stringify({ltaKeyConfigured: Boolean(ltaKey), ltaKeyLength: ltaKey.length}));
if (ltaKey) {
  for (const [name,path] of [['alerts','TrainServiceAlerts'],['crowding','PCDRealTime?TrainLine=EWL'],['forecast','PCDForecast?TrainLine=EWL']]) {
    try {
      const response = await fetch(`https://datamall2.mytransport.sg/ltaodataservice/${path}`, {headers: {AccountKey: ltaKey, Accept: 'application/json'}, signal: AbortSignal.timeout(15000)});
      let data = {};
      try { data = await response.json(); } catch {}
      console.log(JSON.stringify({name,status:response.status,ok:response.ok,valueIsArray:Array.isArray(data.value),valueCount:Array.isArray(data.value)?data.value.length:null,firstKeys:data.value?.[0]?Object.keys(data.value[0]):null,nestedKeys:data.value?.[0]?.Stations?.[0]?Object.keys(data.value[0].Stations[0]):null,intervalKeys:data.value?.[0]?.Stations?.[0]?.Interval?.[0]?Object.keys(data.value[0].Stations[0].Interval[0]):null}));
    } catch (error) {
      console.log(JSON.stringify({name,networkError:error.name,message:error.message}));
    }
  }
  const adapter = createLtaAdapter({key:ltaKey});
  const alerts = await adapter.alerts();
  const crowd = await adapter.crowd('EWL');
  console.log(JSON.stringify({adapter:'alerts',source:alerts.source,status:alerts.status||null,segmentCount:alerts.segments?.length??null,messageCount:alerts.messages?.length??null,reason:alerts.reason||null}));
  console.log(JSON.stringify({adapter:'crowding',source:crowd.source,stationCount:crowd.stations?.length??null,reason:crowd.reason||null}));
}
