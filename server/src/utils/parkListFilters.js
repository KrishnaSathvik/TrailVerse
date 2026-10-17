function filterParksByState(parks, stateQuery) {
  if (!stateQuery || !Array.isArray(parks)) return parks || [];
  const code = String(stateQuery).trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return parks;
  return parks.filter((park) => {
    const states = String(park?.states || '').toUpperCase();
    if (!states) return false;
    return states.split(/[,\s]+/).filter(Boolean).includes(code);
  });
}

module.exports = { filterParksByState };
