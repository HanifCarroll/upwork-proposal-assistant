const POSTING_SIDE_PANEL_PATH = "sidepanel.html";
const DRAFT_SIDE_PANEL_PATH = "draft_sidepanel.html";

function isDiceUrl(value) {
  try {
    const url = new URL(value || "");
    return url.hostname === "dice.com" || url.hostname.endsWith(".dice.com");
  } catch (_error) {
    return false;
  }
}

function isIndeedResultsUrl(value) {
  try {
    const url = new URL(value || "");
    return url.hostname === "www.indeed.com" && url.pathname === "/jobs";
  } catch (_error) {
    return false;
  }
}

function isLinkedInResultsUrl(value) {
  try {
    const url = new URL(value || "");
    return url.hostname.includes("linkedin.com") && url.pathname === "/jobs/search/";
  } catch (_error) {
    return false;
  }
}

function isPostingPickerUrl(value) {
  return isDiceUrl(value) || isIndeedResultsUrl(value) || isLinkedInResultsUrl(value);
}

function sidePanelPathForUrl(url) {
  return isPostingPickerUrl(url) ? POSTING_SIDE_PANEL_PATH : DRAFT_SIDE_PANEL_PATH;
}

async function redirectPopupToSidePanel() {
  const extensionApi = globalThis.chrome;
  if (!extensionApi?.tabs?.query || !extensionApi.sidePanel?.open) return;

  const tabs = await extensionApi.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  if (!tab?.id) return;

  const path = sidePanelPathForUrl(tab.url);
  if (extensionApi.action?.setPopup) {
    await extensionApi.action.setPopup({ tabId: tab.id, popup: "" });
  }
  if (extensionApi.sidePanel?.setOptions) {
    await extensionApi.sidePanel.setOptions({ tabId: tab.id, path, enabled: true });
  }
  await extensionApi.sidePanel.open({ tabId: tab.id });
  window.close();
}

redirectPopupToSidePanel().catch(() => {});
