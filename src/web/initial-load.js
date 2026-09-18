// Read only the datasets required by the selected page. Failed reads remain retryable.
(function (root) {
  function createLoader(read, apply) {
    const pending = new Map(), loaded = new Set();
    const limits = {'profiles':262144, 'session-tokens':262144, 'song-catalog':16777216, 'analysis-data':64*1024*1024};
    function ensure(id) {
      if (loaded.has(id)) return Promise.resolve();
      if (!pending.has(id)) pending.set(id, Promise.resolve().then(() => read(id, limits[id]))
        .then(value => apply(id, value)).then(() => { loaded.add(id); })
        .finally(() => pending.delete(id)));
      return pending.get(id);
    }
    return {ensure, has:id=>loaded.has(id), page:page=>ensure(page==='定数表'?'song-catalog':'analysis-data')};
  }
  root.phigrosInitialLoad = {createLoader};
})(globalThis);
