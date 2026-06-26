(() => {
  const RUNS_KEY = "jobApplicationCoverLetterRuns";
  const LEGACY_RUNS_KEY = "jobApplicationDiceCoverLetterRuns";
  let migratedLegacyRuns = false;

  async function runMap() {
    const stored = await chrome.storage.local.get([RUNS_KEY, LEGACY_RUNS_KEY]);
    let value = stored[RUNS_KEY];
    if (!migratedLegacyRuns && (!value || typeof value !== "object" || Array.isArray(value))) {
      const legacy = stored[LEGACY_RUNS_KEY];
      if (legacy && typeof legacy === "object" && !Array.isArray(legacy)) {
        value = legacy;
        await chrome.storage.local.set({ [RUNS_KEY]: legacy });
      }
    }
    migratedLegacyRuns = true;
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function runOrderKey(run) {
    return String(run?.started_at || run?.updated_at || "");
  }

  function compareRunsByStart(left, right) {
    const ordered = runOrderKey(left).localeCompare(runOrderKey(right));
    if (ordered !== 0) return ordered;
    return String(left?.job_id || "").localeCompare(String(right?.job_id || ""));
  }

  async function list() {
    const runs = Object.values(await runMap()).filter((run) => run?.job_id);
    return runs.sort(compareRunsByStart);
  }

  async function upsert(jobId, patch) {
    if (!jobId) return null;
    const runs = await runMap();
    const previous = runs[jobId] || {};
    const next = {
      ...previous,
      ...patch,
      job_id: jobId,
      updated_at: nowIso(),
    };
    if (!next.started_at) next.started_at = next.updated_at;
    runs[jobId] = next;
    await chrome.storage.local.set({ [RUNS_KEY]: runs });
    return next;
  }

  async function remove(jobId) {
    const runs = await runMap();
    delete runs[jobId];
    await chrome.storage.local.set({ [RUNS_KEY]: runs });
  }

  globalThis.JobApplicationCoverLetterRuns = {
    legacyKey: LEGACY_RUNS_KEY,
    key: RUNS_KEY,
    list,
    remove,
    upsert,
  };
})();
