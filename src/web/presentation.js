(() => {
  const levels = ['EZ', 'HD', 'IN', 'AT'];
  function catalog(raw) {
    const songs = new Map();
    for (const line of raw.split(/\r?\n/).slice(1)) {
      const parts = line.split('\t');
      if (parts.length < 9) continue;
      const id = parts[0].trim().replace(/\.0$/, '');
      const constants = levels.map((_, index) => Number(parts[8 + index]) || 0);
      if (id && constants.some(value => value > 0) && !songs.has(id)) songs.set(id, {id, title: parts[1] || id, constants});
    }
    return [...songs.values()];
  }
  function charts(songs, selected, query) {
    const search = query.trim().toLowerCase();
    return songs.filter(song => !search || `${song.id} ${song.title}`.toLowerCase().includes(search))
      .flatMap(song => song.constants.map((constant, index) => ({...song, level: levels[index], constant})))
      .filter(chart => chart.constant > 0 && selected.has(chart.level))
      .sort((a, b) => b.constant - a.constant || a.title.localeCompare(b.title));
  }
  function timeline(events, days, now = Date.now()) {
    return events.filter(event => meaningfulEvent(event) && (!days || Number(event.timestamp) >= now - days * 86400000))
      .slice().sort((a, b) => b.timestamp - a.timestamp);
  }
  function meaningfulEvent(event) {
    return event.oldRks == null || (event.changes || []).length > 0 || Math.abs(Number(event.newRks) - Number(event.oldRks)) > 1e-8 ||
      (event.oldChallengeModeRank != null && event.oldChallengeModeRank !== event.challengeModeRank);
  }
  function appendHistory(events, event) {
    if (!meaningfulEvent(event)) return events;
    const same = events.some(previous => previous.saveTimestamp === event.saveTimestamp &&
      Math.abs(Number(previous.newRks) - Number(event.newRks)) < 1e-8 &&
      previous.challengeModeRank === event.challengeModeRank && JSON.stringify(previous.changes) === JSON.stringify(event.changes));
    return same ? events : [event, ...events].slice(0, 365);
  }
  function historyEvent(previous, next, snapshot) {
    const old = previous ? phigrosRks.calculate(previous.records || []) : null;
    const before = new Map((previous?.records || []).map(item => [phigrosRks.identity(item), item]));
    const oldPhi = new Set((old?.phi || []).map(item => item.identity));
    const oldBest = new Set((old?.best27 || []).map(item => item.identity));
    const phi = new Set(snapshot.phi.map(item => item.identity)), best = new Set(snapshot.best27.map(item => item.identity));
    const changes = (next.records || []).filter(item => {
      const value = before.get(phigrosRks.identity(item));
      return !value || item.score > value.score || item.accuracy > value.accuracy + 1e-5 || (item.fc && !value.fc);
    }).map(item => {
      const id = phigrosRks.identity(item), value = before.get(id), tags = [value ? '成绩提升' : '新成绩'];
      if (phi.has(id) && !oldPhi.has(id)) tags.push('进入 P3');
      if (best.has(id) && !oldBest.has(id)) tags.push('进入 B27');
      return {id: item.id, title: item.title, level: item.level, oldScore: value?.score ?? null, newScore: item.score,
        oldAccuracy: value?.accuracy ?? null, newAccuracy: item.accuracy, tag: tags.join(' · ')};
    });
    return {timestamp: Date.parse(next.profile.saveUpdatedAt) || Date.now(), saveTimestamp: next.profile.saveUpdatedAt,
      oldRks: old?.overall ?? null, newRks: snapshot.overall, oldChallengeModeRank: previous?.profile?.challengeModeRank ?? null,
      challengeModeRank: next.profile.challengeModeRank, changes};
  }
  const grade = record => record.score >= 1000000 ? 'Phi' : record.fc ? 'FC' : record.score >= 960000 ? 'V' : record.score >= 920000 ? 'S' : record.score >= 880000 ? 'A' : record.score >= 820000 ? 'B' : record.score >= 700000 ? 'C' : 'F';
  window.phigrosPresentation = {catalog, charts, timeline, historyEvent, appendHistory, meaningfulEvent, grade};
})();
