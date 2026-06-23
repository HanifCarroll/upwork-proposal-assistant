(() => {
  function createDicePostingPicker({ els, activeTab, injectContentScripts, setStatus, sleep }) {
    let postings = [];

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

    function clear() {
      postings = [];
      els.dicePostingPicker.hidden = true;
      els.dicePostingList.textContent = "";
      els.dicePostingSummary.textContent = "0 Easy Apply";
      els.dicePostingStatus.textContent = "";
      els.dicePostingOpenSelected.disabled = true;
      els.dicePostingNextPage.disabled = true;
      els.dicePostingSelectAll.disabled = true;
      els.dicePostingSelectAll.textContent = "Select all";
    }

    function selectedIndexes() {
      return Array.from(els.dicePostingList.querySelectorAll('input[type="checkbox"]:checked'))
        .map((input) => Number(input.value))
        .filter((index) => Number.isInteger(index) && index >= 0 && index < postings.length);
    }

    function updateControls() {
      const selectedCount = selectedIndexes().length;
      const totalCount = postings.length;
      els.dicePostingOpenSelected.disabled = selectedCount === 0;
      els.dicePostingSelectAll.disabled = totalCount === 0;
      els.dicePostingSelectAll.textContent = selectedCount === totalCount && totalCount > 0 ? "Clear" : "Select all";
      if (selectedCount) {
        els.dicePostingStatus.textContent = `${selectedCount} selected`;
      } else if (/^\d+ selected$/.test(els.dicePostingStatus.textContent)) {
        els.dicePostingStatus.textContent = "";
      }
    }

    function render(nextPostings, { showEmpty = false } = {}) {
      postings = nextPostings.filter((posting) => posting?.title && posting?.url);
      if (!postings.length) {
        if (!showEmpty) {
          clear();
          return;
        }
        els.dicePostingList.textContent = "";
        els.dicePostingSummary.textContent = "0 Easy Apply";
        els.dicePostingPicker.hidden = false;
        els.dicePostingNextPage.disabled = false;
        updateControls();
        return;
      }

      els.dicePostingList.textContent = "";
      postings.forEach((posting, index) => {
        const row = document.createElement("label");
        row.className = "posting-row";

        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.value = String(index);

        const title = document.createElement("span");
        title.textContent = posting.title;

        row.append(checkbox, title);
        els.dicePostingList.append(row);
      });

      els.dicePostingSummary.textContent = `${postings.length} Easy Apply`;
      els.dicePostingPicker.hidden = false;
      els.dicePostingNextPage.disabled = false;
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

    async function reloadDiceTab(tabId) {
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

    async function refresh() {
      const tab = await activeTab();
      if (!nextDiceResultsUrl(tab.url || "")) {
        clear();
        return;
      }
      const visiblePostings = await listPostingsFromTab(tab.id);
      render(visiblePostings, { showEmpty: true });
    }

    async function advanceActivePage() {
      const tab = await activeTab();
      if (!tab.id) throw new Error("No active Dice results tab found.");
      const nextUrl = nextDiceResultsUrl(tab.url || "");
      if (!nextUrl) throw new Error("The active tab is not a Dice results page.");
      await chrome.tabs.update(tab.id, { url: nextUrl });
      await waitForTabComplete(tab.id);
      await reloadDiceTab(tab.id);
      await refresh();
    }

    async function sendClickDiceEasyApplyMessage(tabId) {
      const response = await chrome.tabs.sendMessage(tabId, { type: "APPLICATION_DRAFT_CLICK_DICE_EASY_APPLY" });
      if (!response?.ok) throw new Error(response?.error || "Could not click Dice Easy Apply.");
      if (!response.clicked) throw new Error(response.error || "Dice Easy Apply control was not found.");
      if (response.next_url) {
        await chrome.tabs.update(tabId, { url: response.next_url });
        await waitForTabComplete(tabId);
        await reloadDiceTab(tabId);
      }
      return response;
    }

    async function clickDiceEasyApplyInTab(tabId) {
      try {
        return await sendClickDiceEasyApplyMessage(tabId);
      } catch (_err) {
        await injectContentScripts(tabId);
        return await sendClickDiceEasyApplyMessage(tabId);
      }
    }

    async function openPostingTab(posting) {
      const tab = await chrome.tabs.create({ url: posting.easy_apply_url || posting.url, active: false });
      if (!tab?.id) throw new Error("Could not open Dice posting tab.");
      return { posting, tabId: tab.id };
    }

    async function clickEasyApplyInOpenedTab({ tabId }) {
      await waitForTabComplete(tabId);
      await reloadDiceTab(tabId);
      const currentTab = await chrome.tabs.get(tabId);
      if (isDiceApplicationWizardUrl(currentTab?.url || "")) {
        return { clicked: true, next_url: currentTab.url };
      }
      return clickDiceEasyApplyInTab(tabId);
    }

    function startEasyApplyFlow(openedTab) {
      clickEasyApplyInOpenedTab(openedTab).catch((error) => {
        setStatus(`${openedTab.posting.title}: ${error.message || "Easy Apply was not clicked."}`, "error");
      });
    }

    function attachEvents() {
      els.dicePostingList.addEventListener("change", updateControls);

      els.dicePostingSelectAll.addEventListener("click", () => {
        const selectedCount = selectedIndexes().length;
        const shouldSelect = selectedCount !== postings.length;
        els.dicePostingList.querySelectorAll('input[type="checkbox"]').forEach((input) => {
          input.checked = shouldSelect;
        });
        updateControls();
      });

      els.dicePostingNextPage.addEventListener("click", async () => {
        try {
          els.dicePostingNextPage.disabled = true;
          els.dicePostingStatus.textContent = "Loading next page...";
          await advanceActivePage();
          els.dicePostingStatus.textContent = `${postings.length} Easy Apply on this page.`;
          setStatus("Loaded next Dice results page.");
        } catch (error) {
          els.dicePostingStatus.textContent = error.message || "Could not load the next page.";
          setStatus(error.message, "error");
        } finally {
          if (!els.dicePostingPicker.hidden) {
            els.dicePostingNextPage.disabled = false;
          }
          updateControls();
        }
      });

      els.dicePostingOpenSelected.addEventListener("click", async () => {
        const selectedPostings = selectedIndexes().map((index) => postings[index]);
        if (!selectedPostings.length) return;
        const failures = [];
        try {
          els.dicePostingOpenSelected.disabled = true;
          els.dicePostingStatus.textContent = `Opening ${selectedPostings.length} tab${selectedPostings.length === 1 ? "" : "s"}...`;
          const results = await Promise.all(selectedPostings.map(async (posting) => {
            try {
              return { opened: await openPostingTab(posting), error: "" };
            } catch (error) {
              return { opened: null, error: `${posting.title}: ${error.message || "Tab was not opened."}` };
            }
          }));
          const openedTabs = results.map((result) => result.opened).filter(Boolean);
          failures.push(...results.map((result) => result.error).filter(Boolean));
          openedTabs.forEach(startEasyApplyFlow);
          const openedCount = openedTabs.length;
          if (openedCount > 0) {
            els.dicePostingStatus.textContent = "Loading next page...";
            await advanceActivePage();
          }
          if (failures.length) {
            const nextPageText = openedCount > 0 ? " Next page loaded." : "";
            els.dicePostingStatus.textContent = `Opened ${openedCount}; ${failures.length} failed.${nextPageText}`;
            setStatus(failures[0], "error");
          } else {
            els.dicePostingStatus.textContent = `Opened ${openedCount} Easy Apply tab${openedCount === 1 ? "" : "s"}. Next page loaded.`;
            setStatus(`Opened ${openedCount} Dice Easy Apply tab${openedCount === 1 ? "" : "s"} and loaded the next page.`);
          }
        } catch (error) {
          els.dicePostingStatus.textContent = error.message || "Could not open selected postings.";
          setStatus(error.message, "error");
        } finally {
          updateControls();
        }
      });
    }

    return {
      clear,
      count: () => postings.length,
      refresh,
      attachEvents,
      nextDiceResultsUrl,
    };
  }

  globalThis.JobApplicationDicePostingPicker = { create: createDicePostingPicker };
})();
