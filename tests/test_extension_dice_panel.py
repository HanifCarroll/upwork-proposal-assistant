from __future__ import annotations

import json
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
EXTENSION = REPO_ROOT / "extension"


def read(path: str) -> str:
    return (EXTENSION / path).read_text(encoding="utf-8")


def test_dice_side_panel_routes_action_and_reuses_posting_picker_module() -> None:
    manifest = json.loads((EXTENSION / "manifest.json").read_text(encoding="utf-8"))
    background = read("background.js")
    popup_html = read("popup.html")
    popup_router = read("popup_router.js")
    sidepanel_html = read("sidepanel.html")
    sidepanel = read("sidepanel.js")
    sidepanel_css = read("sidepanel.css")
    dice_runs = read("ui/dice_cover_letter_runs.js")
    dice_wizard = read("dice_wizard_assistant.js")
    draft_sidepanel_html = read("draft_sidepanel.html")
    check_script = (REPO_ROOT / "scripts" / "check").read_text(encoding="utf-8")

    assert manifest["side_panel"]["default_path"] == "sidepanel.html"
    assert "sidePanel" in manifest["permissions"]
    assert "tabs" in manifest["permissions"]
    assert "default_popup" not in manifest["action"]

    assert "POPUP_PATH" not in background
    assert 'const SIDE_PANEL_PATH = "sidepanel.html"' in background
    assert 'const DRAFT_SIDE_PANEL_PATH = "draft_sidepanel.html"' in background
    assert "function isDiceUrl" in background
    assert "function sidePanelPathForUrl" in background
    assert "return isDiceUrl(url) ? SIDE_PANEL_PATH : DRAFT_SIDE_PANEL_PATH" in background
    assert 'chrome.action.setPopup({ tabId, popup: "" })' in background
    assert "chrome.sidePanel.setOptions" in background
    assert "enabled: true" in background
    assert "function enableSidePanelActionClick" in background
    assert "chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })" in background
    assert "chrome.action.onClicked.addListener" in background
    assert "configureActionForTab(tab.id, tab.url)" in background
    assert "chrome.sidePanel.open({ tabId: tab.id })" in background
    assert "chrome.tabs.onActivated.addListener" in background
    assert "chrome.tabs.onUpdated.addListener" in background

    assert 'src="popup_router.js"' in popup_html
    assert popup_html.index('src="popup_router.js"') < popup_html.index('class="shell"')
    assert 'const DICE_SIDE_PANEL_PATH = "sidepanel.html"' in popup_router
    assert 'const DRAFT_SIDE_PANEL_PATH = "draft_sidepanel.html"' in popup_router
    assert "function isDiceUrl" in popup_router
    assert "function redirectPopupToSidePanel" in popup_router
    assert 'extensionApi.action.setPopup({ tabId: tab.id, popup: "" })' in popup_router
    assert "extensionApi.sidePanel.setOptions({ tabId: tab.id, path, enabled: true })" in popup_router
    assert "extensionApi.sidePanel.open({ tabId: tab.id })" in popup_router
    assert "window.close()" in popup_router

    assert 'src="ui/content_scripts.js"' in sidepanel_html
    assert 'src="ui/dice_posting_picker.js"' in sidepanel_html
    assert 'src="ui/dice_cover_letter_runs.js"' in sidepanel_html
    assert 'src="sidepanel.js"' in sidepanel_html
    assert 'id="dice-cover-letter-runs"' in sidepanel_html
    assert 'id="dice-cover-letter-list"' in sidepanel_html
    assert "sidepanel.css" in sidepanel_html
    assert 'src="draft_panel.js"' in draft_sidepanel_html
    assert 'id="draft"' in draft_sidepanel_html
    assert 'id="title"' in draft_sidepanel_html
    assert 'id="description"' in draft_sidepanel_html

    assert "function isDiceResultsUrl" in sidepanel
    assert "function diceResultsTab" in sidepanel
    assert "JobApplicationDicePostingPicker.create" in sidepanel
    assert "JobApplicationDiceCoverLetterRuns" in sidepanel
    assert "const BUSY_RUN_STATUSES = new Set" in sidepanel
    assert "function renderCoverLetterRuns" in sidepanel
    assert "function reconcileCoverLetterRuns" in sidepanel
    assert "function reconcileCoverLetterRun" in sidepanel
    assert "function lookupApplicationForRun" in sidepanel
    assert "function ensureWizardAssistant" in sidepanel
    assert 'chrome.runtime.sendMessage({ type: "LOOKUP_APPLICATION", source_url: run.source_url })' in sidepanel
    assert 'chrome.scripting.executeScript({ target: { tabId: tab.id }, files: DICE_WIZARD_SCRIPT_FILES })' in sidepanel
    assert 'status: "submitted"' in sidepanel
    assert "Dice tab closed before this run finished." in sidepanel
    assert 'status: "needs_attention"' in sidepanel
    assert "renderCoverLetterRuns({ reconcile: true })" in sidepanel
    assert "function startCoverLetterFromSidebar" in sidepanel
    assert "DICE_COVER_LETTER_START" in sidepanel
    assert "REVEAL_PDF" in sidepanel
    assert "JobApplicationContentScripts.inject(tabId)" in sidepanel
    assert 'files: ["content_script.js"]' not in sidepanel
    assert "align-content: start" in sidepanel_css
    assert "grid-auto-rows: max-content" in sidepanel_css
    assert ".cover-letter-runs" in sidepanel_css
    assert "find extension -name '*.js'" in check_script
    assert "document.title" not in sidepanel
    assert "innerText" not in sidepanel
    assert "[class*=" not in sidepanel

    assert "jobApplicationDiceCoverLetterRuns" in dice_runs
    assert "chrome.storage.local.set" in dice_runs
    assert "globalThis.JobApplicationDiceCoverLetterRuns" in dice_runs
    assert "function runOrderKey" in dice_runs
    assert "function compareRunsByStart" in dice_runs
    assert 'run?.started_at || run?.updated_at || ""' in dice_runs
    assert "runs.sort(compareRunsByStart)" in dice_runs
    assert "String(right.updated_at" not in dice_runs
    assert "JobApplicationDiceCoverLetterRuns" in dice_wizard
    assert "DICE_COVER_LETTER_START" in dice_wizard
    assert "DOWNLOAD_PDF" in dice_wizard
    assert "function attachGeneratedPdf" in dice_wizard
    assert "function markSubmittedIfSuccess" in dice_wizard
    assert "function markManualQuestionsIfNeeded" in dice_wizard
    assert "function continueWizardAutomation" in dice_wizard
    assert 'status: "submitted"' in dice_wizard
    assert 'status: "needs_attention"' in dice_wizard
    assert "Application questions need manual answers in this Dice tab." in dice_wizard
    assert "new DataTransfer()" in dice_wizard
    assert "input.dispatchEvent(new Event(\"change\", { bubbles: true }))" in dice_wizard
    assert "Dice did not show the generated PDF as attached." in dice_wizard
    assert "position: fixed" not in dice_wizard
    assert "job-application-dice-cover-letter-panel" not in dice_wizard


def test_dice_posting_picker_opens_selected_jobs_and_advances_page() -> None:
    picker = read("ui/dice_posting_picker.js")
    popup_html = read("popup.html")
    draft_panel = read("draft_panel.js")

    for field_id in [
        "dice-posting-picker",
        "dice-posting-summary",
        "dice-posting-next-page",
        "dice-posting-select-all",
        "dice-posting-list",
        "dice-posting-open-selected",
        "dice-posting-status",
    ]:
        assert f'id="{field_id}"' in popup_html

    assert "function createDicePostingPicker" in picker
    assert "function nextDiceResultsUrl" in picker
    assert 'url.pathname !== "/jobs"' in picker
    assert 'url.searchParams.set("page"' in picker
    assert "function listPostingsFromTab" in picker
    assert "APPLICATION_DRAFT_LIST_POSTINGS" in picker
    assert "APPLICATION_DRAFT_CLICK_DICE_EASY_APPLY" in picker
    assert "waitForTabComplete" in picker
    assert "function reloadDiceTab" in picker
    assert "await chrome.tabs.reload(tabId)" in picker
    assert "function isDiceApplicationWizardUrl" in picker
    assert "chrome.tabs.update(tab.id, { url: nextUrl })" in picker
    assert "await reloadDiceTab(tab.id)" in picker
    assert "function openPostingTab" in picker
    assert "function clickEasyApplyInOpenedTab" in picker
    assert "function startEasyApplyFlow" in picker
    assert "chrome.tabs.create({ url: posting.easy_apply_url || posting.url, active: false })" in picker
    assert "chrome.tabs.update(tabId, { url: response.next_url })" in picker
    assert "const results = await Promise.all(selectedPostings.map(async (posting) =>" in picker
    assert "return { opened: await openPostingTab(posting), error: \"\" }" in picker
    assert "openedTabs.forEach(startEasyApplyFlow)" in picker
    assert "await advanceActivePage()" in picker
    assert "await openPostingAndClickEasyApply(posting)" not in picker
    assert "Loaded next Dice results page." in picker
    assert "Opened ${openedCount} Dice Easy Apply tab" in picker
    assert "Next page" in popup_html
    assert "Open Easy Apply" in popup_html
    assert "JobApplicationDicePostingPicker.create" in draft_panel
