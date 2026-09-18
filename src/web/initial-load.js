// Publish the small account summary before requesting the larger optional page datasets.
(function (root) {
  async function loadLocal(read, showProfiles, showDetails) {
    const profiles = await read('profiles', 262144);
    await showProfiles(profiles);
    // Give the first content frame a chance to paint before parsing the full analysis.
    await new Promise(resolve => typeof requestAnimationFrame === 'function' ? requestAnimationFrame(() => setTimeout(resolve, 0)) : setTimeout(resolve, 0));
    const [tokens, catalog, analysis] = await Promise.all([
      read('session-tokens', 262144), read('song-catalog', 16777216), read('analysis-data', 64 * 1024 * 1024)
    ]);
    await showDetails({tokens, catalog, analysis});
  }
  root.phigrosInitialLoad = {loadLocal};
})(globalThis);
