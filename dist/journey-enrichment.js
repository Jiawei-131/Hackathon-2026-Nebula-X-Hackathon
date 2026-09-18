export function applyAccessLegs(plan, access = {}) {
  const verified = leg => ['onemap','openrouteservice'].includes(leg?.source) ? leg : null;
  const origin = verified(access.origin);
  const destination = verified(access.destination);
  if (!origin && !destination) return plan;
  const routes = plan.routes.map(route => {
    const result = structuredClone(route);
    let delta = 0;
    if (origin) {
      delta += origin.minutes - result.steps[0].minutes;
      result.steps[0] = {
        title: `Walk ${origin.metres} m to ${access.originStationName}`,
        detail: origin.instructions.map(x => x.text).filter(Boolean).join(' · ') || `Follow the verified ${origin.source==='onemap'?'OneMap':'openrouteservice'} walking path.`,
        minutes: origin.minutes,
        type: 'walk',
        source: origin.source==='onemap'?'OneMap':'openrouteservice'
      };
      result.geometry = [...origin.geometry, ...result.geometry.slice(1)];
    }
    if (destination) {
      const last = result.steps.length - 1;
      delta += destination.minutes - result.steps[last].minutes;
      result.steps[last] = {
        title: `Walk ${destination.metres} m to ${access.destinationLabel}`,
        detail: destination.instructions.map(x => x.text).filter(Boolean).join(' · ') || `Follow the verified ${destination.source==='onemap'?'OneMap':'openrouteservice'} walking path.`,
        minutes: destination.minutes,
        type: 'walk',
        source: destination.source==='onemap'?'OneMap':'openrouteservice'
      };
      result.geometry = [...result.geometry.slice(0, -1), ...destination.geometry];
    }
    result.min += delta;
    result.max += delta;
    result.arrival += delta;
    result.buffer -= delta;
    result.walk += delta;
    result.score += delta + Math.max(0, -result.buffer) * 4 - Math.max(0, -route.buffer) * 4;
    result.accessVerified = true;
    return result;
  });
  const byId = new Map(routes.map(route => [route.id, route]));
  const best = byId.get(plan.best.id) || routes[0];
  const usual = byId.get(plan.usual.id) || routes[0];
  return {...plan, routes, best, usual, latestLeave: plan.due - best.max, accessVerified: true};
}

export function annotateCrowding(plan, feeds, stations, departureMs, crowdLookup) {
  const routes = plan.routes.map(route => {
    const groups = [];
    for (const edge of route.edges) {
      if (groups.at(-1)?.line === edge.line) groups.at(-1).edges.push(edge);
      else groups.push({line: edge.line, edges: [edge]});
    }
    let elapsed = route.steps[0]?.minutes || 0;
    const observations = groups.map(group => {
      const station = stations[group.edges[0].from];
      const result = crowdLookup(station, group.line, feeds, departureMs + elapsed * 60000);
      elapsed += group.edges.reduce((sum, edge) => sum + edge.minutes, 0) + 5;
      return {stationId: station.id, stationName: station.name, line: group.line, ...result};
    });
    return {...route, crowdObservations: observations};
  });
  const byId = new Map(routes.map(route => [route.id, route]));
  return {...plan, routes, best: byId.get(plan.best.id), usual: byId.get(plan.usual.id)};
}
