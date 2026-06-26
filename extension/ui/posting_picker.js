(() => {
  function createPostingPicker({ els, activeTab, injectContentScripts, setStatus, sleep }) {
    let postings = [];
    let activePlatform = null;

    const PLATFORMS = {
      dice: {
        source: "dice",
        name: "Dice",
        postingNoun: "Easy Apply",
        buttonLabel: "Open Easy Apply",
        resultsReady: "Dice results ready.",
      },
      indeed: {
        source: "indeed",
        name: "Indeed",
        postingNoun: "Apply with Indeed",
        buttonLabel: "Open Apply with Indeed",
        resultsReady: "Indeed results ready.",
      },
      linkedin: {
        source: "linkedin",
        name: "LinkedIn",
        postingNoun: "Easy Apply",
        buttonLabel: "Open Easy Apply",
        resultsReady: "LinkedIn results ready.",
      },
    };

    function nextDiceResultsUrl(value) {
      try {
        const url = new URL(value);
        if (!url.hostname.includes("dice.com") || url.pathname !== "/jobs") return "";
        const currentPage = Number.parseInt(url.searchParams.get("page") || "1", 10);
        url.searchParams.set("page", String(Number.isFinite(currentPage) && currentPage > 0 ? currentPage + 1 : 2));
        return url.href;
      } catch (_error) {
        return "";
      }
    }

    function nextIndeedResultsUrl(value) {
      try {
        const url = new URL(value);
        if (url.hostname !== "www.indeed.com" || url.pathname !== "/jobs") return "";
        const currentStart = Number.parseInt(url.searchParams.get("start") || "0", 10);
        url.searchParams.set("start", String(Number.isFinite(currentStart) && currentStart >= 0 ? currentStart + 10 : 10));
        url.searchParams.delete("vjk");
        return url.href;
      } catch (_error) {
        return "";
      }
    }

    function nextLinkedInResultsUrl(value) {
      try {
        const url = new URL(value);
        if (!url.hostname.includes("linkedin.com") || url.pathname !== "/jobs/search/") return "";
        const currentStart = Number.parseInt(url.searchParams.get("start") || "0", 10);
        url.searchParams.set("start", String(Number.isFinite(currentStart) && currentStart >= 0 ? currentStart + 25 : 25));
        url.searchParams.delete("currentJobId");
        return url.href;
      } catch (_error) {
        return "";
      }
    }

    function platformForUrl(value) {
      if (nextDiceResultsUrl(value)) return PLATFORMS.dice;
      if (nextIndeedResultsUrl(value)) return PLATFORMS.indeed;
      if (nextLinkedInResultsUrl(value)) return PLATFORMS.linkedin;
      return null;
    }

    function nextResultsUrl(value) {
      const platform = platformForUrl(value);
      if (platform?.source === "dice") return nextDiceResultsUrl(value);
      if (platform?.source === "indeed") return nextIndeedResultsUrl(value);
      if (platform?.source === "linkedin") return nextLinkedInResultsUrl(value);
      return "";
    }

    function postingNoun() {
      return activePlatform?.postingNoun || "apply-enabled posting";
    }

    function platformName() {
      return activePlatform?.name || "Job board";
    }

    function updatePlatformLabels() {
      if (els.postingPickerTitle) {
        els.postingPickerTitle.textContent = activePlatform ? `${platformName()} postings` : "Apply-enabled postings";
      }
      if (els.postingOpenSelected) {
        els.postingOpenSelected.textContent = activePlatform?.buttonLabel || "Open selected";
      }
    }

    function clear() {
      postings = [];
      activePlatform = null;
      updatePlatformLabels();
      els.postingPicker.hidden = true;
      els.postingList.textContent = "";
      els.postingSummary.textContent = `0 ${postingNoun()}`;
      els.postingStatus.textContent = "";
      els.postingOpenSelected.disabled = true;
      els.postingNextPage.disabled = true;
      els.postingSelectAll.disabled = true;
      els.postingSelectAll.textContent = "Select all";
    }

    function selectedIndexes() {
      return Array.from(els.postingList.querySelectorAll('input[type="checkbox"]:checked'))
        .map((input) => Number(input.value))
        .filter((index) => Number.isInteger(index) && index >= 0 && index < postings.length);
    }

    function updateControls() {
      const selectedCount = selectedIndexes().length;
      const totalCount = postings.length;
      els.postingOpenSelected.disabled = selectedCount === 0;
      els.postingSelectAll.disabled = totalCount === 0;
      els.postingSelectAll.textContent = selectedCount === totalCount && totalCount > 0 ? "Clear" : "Select all";
      if (selectedCount) {
        els.postingStatus.textContent = `${selectedCount} selected`;
      } else if (/^\d+ selected$/.test(els.postingStatus.textContent)) {
        els.postingStatus.textContent = "";
      }
    }

    function render(nextPostings, { showEmpty = false, platform = activePlatform } = {}) {
      activePlatform = platform;
      updatePlatformLabels();
      postings = nextPostings.filter((posting) => posting?.title && posting?.url);
      if (!postings.length) {
        if (!showEmpty) {
          clear();
          return;
        }
        els.postingList.textContent = "";
        els.postingSummary.textContent = `0 ${postingNoun()}`;
        els.postingPicker.hidden = false;
        els.postingNextPage.disabled = false;
        updateControls();
        return;
      }

      els.postingList.textContent = "";
      postings.forEach((posting, index) => {
        const row = document.createElement("label");
        row.className = "posting-row";

        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.value = String(index);

        const title = document.createElement("span");
        title.textContent = posting.company ? `${posting.title} - ${posting.company}` : posting.title;

        row.append(checkbox, title);
        els.postingList.append(row);
      });

      els.postingSummary.textContent = `${postings.length} ${postingNoun()}`;
      els.postingPicker.hidden = false;
      els.postingNextPage.disabled = false;
      updateControls();
    }

    async function sendPostingListMessage(tabId) {
      const response = await chrome.tabs.sendMessage(tabId, { type: "APPLICATION_DRAFT_LIST_POSTINGS" });
      if (!response?.ok) throw new Error(response?.error || "Could not list job postings.");
      return Array.isArray(response.postings) ? response.postings : [];
    }

    async function listPostingsFromTab(tabId) {
      try {
        return await sendPostingListMessage(tabId);
      } catch (_err) {
        await injectContentScripts(tabId);
        return await sendPostingListMessage(tabId);
      }
    }

    async function waitForTabComplete(tabId, timeoutMs = 15000) {
      const startedAt = Date.now();
      while (Date.now() - startedAt < timeoutMs) {
        const tab = await chrome.tabs.get(tabId);
        if (tab?.status === "complete") return;
        await sleep(250);
      }
      throw new Error("Opened tab did not finish loading.");
    }

    async function reloadTab(tabId) {
      await chrome.tabs.reload(tabId);
      await sleep(250);
      await waitForTabComplete(tabId);
    }

    function isDiceApplicationWizardUrl(value) {
      try {
        const url = new URL(value || "");
        return url.hostname.includes("dice.com") && /^\/job-applications\/[^/]+\/wizard(?:\/|$)/.test(url.pathname);
      } catch (_error) {
        return false;
      }
    }

    function isIndeedSmartApplyUrl(value) {
      try {
        const url = new URL(value || "");
        return url.hostname === "smartapply.indeed.com" && url.pathname.includes("/indeedapply/form/");
      } catch (_error) {
        return false;
      }
    }

    function isApplicationWizardUrl(value) {
      return isDiceApplicationWizardUrl(value) || isIndeedSmartApplyUrl(value);
    }

    async function ensurePostApplyAutomation(tabId, response) {
      const contentScripts = globalThis.JobApplicationContentScripts;
      if (response?.auto_run_key && typeof contentScripts?.setSessionStorage === "function") {
        await contentScripts.setSessionStorage(tabId, response.auto_run_key, "true");
      }
      if (response?.source === "linkedin" && typeof contentScripts?.injectLinkedInEasyApply === "function") {
        await contentScripts.injectLinkedInEasyApply(tabId);
      }
      if (response?.activate_after_navigation) {
        await chrome.tabs.update(tabId, { active: true });
        await sleep(500);
      }
    }

    async function refresh() {
      const tab = await activeTab();
      const platform = platformForUrl(tab.url || "");
      if (!platform) {
        clear();
        return;
      }
      activePlatform = platform;
      const visiblePostings = await listPostingsFromTab(tab.id);
      render(visiblePostings, { showEmpty: true, platform });
    }

    async function advanceActivePage() {
      const tab = await activeTab();
      if (!tab.id) throw new Error(`No active ${platformName()} results tab found.`);
      const nextUrl = nextResultsUrl(tab.url || "");
      if (!nextUrl) throw new Error(`The active tab is not a ${platformName()} results page.`);
      await chrome.tabs.update(tab.id, { url: nextUrl });
      await waitForTabComplete(tab.id);
      await reloadTab(tab.id);
      await refresh();
    }

    async function sendClickApplyControlMessage(tabId) {
      const response = await chrome.tabs.sendMessage(tabId, { type: "APPLICATION_DRAFT_CLICK_APPLY_CONTROL" });
      if (!response?.ok) throw new Error(response?.error || `Could not click ${postingNoun()}.`);
      if (!response.clicked) throw new Error(response.error || `${postingNoun()} control was not found.`);
      if (response.next_url) {
        await chrome.tabs.update(tabId, { url: response.next_url });
        await waitForTabComplete(tabId);
        if (response.reload_after_navigation !== false) {
          await reloadTab(tabId);
        }
      }
      await ensurePostApplyAutomation(tabId, response);
      return response;
    }

    async function clickApplyControlInTab(tabId) {
      try {
        return await sendClickApplyControlMessage(tabId);
      } catch (_err) {
        await injectContentScripts(tabId);
        return await sendClickApplyControlMessage(tabId);
      }
    }

    async function openPostingTab(posting) {
      const tab = await chrome.tabs.create({ url: posting.easy_apply_url || posting.url, active: false });
      if (!tab?.id) throw new Error(`Could not open ${platformName()} posting tab.`);
      return { posting, tabId: tab.id };
    }

    async function clickApplyControlInOpenedTab({ tabId }) {
      await waitForTabComplete(tabId);
      await reloadTab(tabId);
      const currentTab = await chrome.tabs.get(tabId);
      if (isApplicationWizardUrl(currentTab?.url || "")) {
        return { clicked: true, next_url: currentTab.url };
      }
      return clickApplyControlInTab(tabId);
    }

    async function openPostingTabResult(posting) {
      try {
        return { opened: await openPostingTab(posting), error: "" };
      } catch (error) {
        return { opened: null, error: `${posting.title}: ${error.message || `${postingNoun()} tab was not opened.`}` };
      }
    }

    async function startApplyControlFlowResult(opened) {
      try {
        await clickApplyControlInOpenedTab(opened);
        return { opened, error: "" };
      } catch (error) {
        return { opened, error: `${opened.posting.title}: ${error.message || `${postingNoun()} was not started.`}` };
      }
    }

    async function openSelectedPostings(selectedPostings) {
      const openedResults = await Promise.all(selectedPostings.map(openPostingTabResult));
      const openedPostings = openedResults.map((result) => result.opened).filter(Boolean);
      const flowResults = await Promise.all(openedPostings.map(startApplyControlFlowResult));
      return [
        ...openedResults.filter((result) => result.error),
        ...flowResults,
      ];
    }

    function attachEvents() {
      els.postingList.addEventListener("change", updateControls);

      els.postingSelectAll.addEventListener("click", () => {
        const selectedCount = selectedIndexes().length;
        const shouldSelect = selectedCount !== postings.length;
        els.postingList.querySelectorAll('input[type="checkbox"]').forEach((input) => {
          input.checked = shouldSelect;
        });
        updateControls();
      });

      els.postingNextPage.addEventListener("click", async () => {
        try {
          els.postingNextPage.disabled = true;
          els.postingStatus.textContent = "Loading next page...";
          await advanceActivePage();
          els.postingStatus.textContent = `${postings.length} ${postingNoun()} on this page.`;
          setStatus(`Loaded next ${platformName()} results page.`);
        } catch (error) {
          els.postingStatus.textContent = error.message || "Could not load the next page.";
          setStatus(error.message, "error");
        } finally {
          if (!els.postingPicker.hidden) {
            els.postingNextPage.disabled = false;
          }
          updateControls();
        }
      });

      els.postingOpenSelected.addEventListener("click", async () => {
        const selectedPostings = selectedIndexes().map((index) => postings[index]);
        if (!selectedPostings.length) return;
        const failures = [];
        try {
          els.postingOpenSelected.disabled = true;
          els.postingStatus.textContent = `Opening ${selectedPostings.length} tab${selectedPostings.length === 1 ? "" : "s"}...`;
          const results = await openSelectedPostings(selectedPostings);
          const openedTabs = results.map((result) => result.opened).filter(Boolean);
          failures.push(...results.map((result) => result.error).filter(Boolean));
          const openedCount = openedTabs.length;
          if (openedCount > 0) {
            els.postingStatus.textContent = "Loading next page...";
            await advanceActivePage();
          }
          if (failures.length) {
            const nextPageText = openedCount > 0 ? " Next page loaded." : "";
            els.postingStatus.textContent = `Opened ${openedCount}; ${failures.length} failed.${nextPageText}`;
            setStatus(failures[0], "error");
          } else {
            els.postingStatus.textContent = `Started ${openedCount} ${postingNoun()} tab${openedCount === 1 ? "" : "s"}. Next page loaded.`;
            setStatus(`Started ${openedCount} ${platformName()} ${postingNoun()} tab${openedCount === 1 ? "" : "s"} and loaded the next page.`);
          }
        } catch (error) {
          els.postingStatus.textContent = error.message || "Could not open selected postings.";
          setStatus(error.message, "error");
        } finally {
          updateControls();
        }
      });
    }

    return {
      clear,
      count: () => postings.length,
      nextDiceResultsUrl,
      nextIndeedResultsUrl,
      nextLinkedInResultsUrl,
      refresh,
      render,
      attachEvents,
    };
  }

  globalThis.JobApplicationPostingPicker = { create: createPostingPicker };
})();
