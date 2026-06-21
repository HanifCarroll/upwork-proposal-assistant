const els = {
  status: document.querySelector("#status"),
  refresh: document.querySelector("#refresh"),
  dicePostingPicker: document.querySelector("#dice-posting-picker"),
  dicePostingSummary: document.querySelector("#dice-posting-summary"),
  dicePostingNextPage: document.querySelector("#dice-posting-next-page"),
  dicePostingSelectAll: document.querySelector("#dice-posting-select-all"),
  dicePostingList: document.querySelector("#dice-posting-list"),
  dicePostingOpenSelected: document.querySelector("#dice-posting-open-selected"),
  dicePostingStatus: document.querySelector("#dice-posting-status"),
};

let dicePostings = [];
let diceResultsTabId = null;
let controlsBusy = false;

function setStatus(text, state = "idle") {
  els.status.textContent = text;
  els.status.dataset.state = state;
}

function sleep(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function isDiceResultsUrl(value) {
  try {
    const url = new URL(value || "");
    return url.hostname.includes("dice.com") && url.pathname === "/jobs";
  } catch (_error) {
    return false;
  }
}

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

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error("No active tab found.");
  return tab;
}

async function diceResultsTab() {
  if (diceResultsTabId) {
    try {
      const tab = await chrome.tabs.get(diceResultsTabId);
      if (tab?.id && isDiceResultsUrl(tab.url || "")) return tab;
    } catch (_error) {
      diceResultsTabId = null;
    }
  }

  const tab = await activeTab();
  if (!isDiceResultsUrl(tab.url || "")) {
    throw new Error("Open a Dice results page to use this panel.");
  }
  diceResultsTabId = tab.id;
  return tab;
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
    await chrome.scripting.executeScript({ target: { tabId }, files: ["content_script.js"] });
    return await sendPostingListMessage(tabId);
  }
}

function selectedDicePostingIndexes() {
  return Array.from(els.dicePostingList.querySelectorAll('input[type="checkbox"]:checked'))
    .map((input) => Number(input.value))
    .filter((index) => Number.isInteger(index) && index >= 0 && index < dicePostings.length);
}

function updateDicePostingControls() {
  const selectedCount = selectedDicePostingIndexes().length;
  const totalCount = dicePostings.length;
  els.refresh.disabled = controlsBusy;
  els.dicePostingNextPage.disabled = controlsBusy || !diceResultsTabId;
  els.dicePostingOpenSelected.disabled = controlsBusy || selectedCount === 0;
  els.dicePostingSelectAll.disabled = controlsBusy || totalCount === 0;
  els.dicePostingSelectAll.textContent = selectedCount === totalCount && totalCount > 0 ? "Clear" : "Select all";
  if (selectedCount) {
    els.dicePostingStatus.textContent = `${selectedCount} selected`;
  } else if (/^\d+ selected$/.test(els.dicePostingStatus.textContent)) {
    els.dicePostingStatus.textContent = "";
  }
}

function setBusy(isBusy) {
  controlsBusy = isBusy;
  updateDicePostingControls();
}

function renderDicePostingPicker(postings) {
  dicePostings = postings.filter((posting) => posting?.title && posting?.url);
  els.dicePostingList.textContent = "";

  dicePostings.forEach((posting, index) => {
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

  els.dicePostingSummary.textContent = `${dicePostings.length} Easy Apply`;
  updateDicePostingControls();
}

async function refreshDicePostingPicker() {
  const tab = await diceResultsTab();
  const postings = await listPostingsFromTab(tab.id);
  renderDicePostingPicker(postings);
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

async function sendClickDiceEasyApplyMessage(tabId) {
  const response = await chrome.tabs.sendMessage(tabId, { type: "APPLICATION_DRAFT_CLICK_DICE_EASY_APPLY" });
  if (!response?.ok) throw new Error(response?.error || "Could not click Dice Easy Apply.");
  if (!response.clicked) throw new Error(response.error || "Dice Easy Apply control was not found.");
  return response;
}

async function clickDiceEasyApplyInTab(tabId) {
  try {
    return await sendClickDiceEasyApplyMessage(tabId);
  } catch (_err) {
    await chrome.scripting.executeScript({ target: { tabId }, files: ["content_script.js"] });
    return await sendClickDiceEasyApplyMessage(tabId);
  }
}

async function openPostingAndClickEasyApply(posting) {
  const tab = await chrome.tabs.create({ url: posting.url, active: false });
  if (!tab?.id) throw new Error("Could not open Dice posting tab.");
  await waitForTabComplete(tab.id);
  return clickDiceEasyApplyInTab(tab.id);
}

async function advanceDiceResultsPage() {
  const tab = await diceResultsTab();
  const nextUrl = nextDiceResultsUrl(tab.url || "");
  if (!nextUrl) throw new Error("The selected tab is not a Dice results page.");
  await chrome.tabs.update(tab.id, { url: nextUrl });
  await waitForTabComplete(tab.id);
  diceResultsTabId = tab.id;
  await refreshDicePostingPicker();
}

els.dicePostingList.addEventListener("change", updateDicePostingControls);

els.dicePostingSelectAll.addEventListener("click", () => {
  const selectedCount = selectedDicePostingIndexes().length;
  const shouldSelect = selectedCount !== dicePostings.length;
  els.dicePostingList.querySelectorAll('input[type="checkbox"]').forEach((input) => {
    input.checked = shouldSelect;
  });
  updateDicePostingControls();
});

els.refresh.addEventListener("click", async () => {
  try {
    setBusy(true);
    els.dicePostingStatus.textContent = "Refreshing...";
    await refreshDicePostingPicker();
    els.dicePostingStatus.textContent = `${dicePostings.length} Easy Apply on this page.`;
    setStatus("Dice results ready.");
  } catch (error) {
    els.dicePostingStatus.textContent = error.message || "Could not refresh Dice postings.";
    setStatus(error.message, "error");
  } finally {
    setBusy(false);
  }
});

els.dicePostingNextPage.addEventListener("click", async () => {
  try {
    setBusy(true);
    els.dicePostingStatus.textContent = "Loading next page...";
    await advanceDiceResultsPage();
    els.dicePostingStatus.textContent = `${dicePostings.length} Easy Apply on this page.`;
    setStatus("Loaded next Dice results page.");
  } catch (error) {
    els.dicePostingStatus.textContent = error.message || "Could not load the next page.";
    setStatus(error.message, "error");
  } finally {
    setBusy(false);
  }
});

els.dicePostingOpenSelected.addEventListener("click", async () => {
  const postings = selectedDicePostingIndexes().map((index) => dicePostings[index]);
  if (!postings.length) return;
  const failures = [];
  try {
    setBusy(true);
    els.dicePostingStatus.textContent = `Opening ${postings.length} tab${postings.length === 1 ? "" : "s"}...`;
    const results = await Promise.all(postings.map(async (posting) => {
      try {
        await openPostingAndClickEasyApply(posting);
        return null;
      } catch (error) {
        return `${posting.title}: ${error.message || "Easy Apply was not clicked."}`;
      }
    }));
    failures.push(...results.filter(Boolean));

    const clickedCount = postings.length - failures.length;
    if (clickedCount > 0) {
      els.dicePostingStatus.textContent = "Loading next page...";
      await advanceDiceResultsPage();
    }

    if (failures.length) {
      const nextPageText = clickedCount > 0 ? " Next page loaded." : "";
      els.dicePostingStatus.textContent = `Started ${clickedCount}; ${failures.length} failed.${nextPageText}`;
      setStatus(failures[0], "error");
    } else {
      els.dicePostingStatus.textContent = `Started ${clickedCount} Easy Apply flow${clickedCount === 1 ? "" : "s"}. Next page loaded.`;
      setStatus(`Started ${clickedCount} Dice Easy Apply flow${clickedCount === 1 ? "" : "s"} and loaded the next page.`);
    }
  } catch (error) {
    els.dicePostingStatus.textContent = error.message || "Could not open selected postings.";
    setStatus(error.message, "error");
  } finally {
    setBusy(false);
  }
});

async function initializeSidePanel() {
  try {
    setBusy(true);
    await refreshDicePostingPicker();
    els.dicePostingStatus.textContent = `${dicePostings.length} Easy Apply on this page.`;
    setStatus("Dice results ready.");
  } catch (error) {
    renderDicePostingPicker([]);
    els.dicePostingStatus.textContent = error.message || "Could not read Dice postings.";
    setStatus(error.message, "error");
  } finally {
    setBusy(false);
  }
}

initializeSidePanel();
