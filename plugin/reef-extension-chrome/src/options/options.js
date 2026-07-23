// src/options/options.ts
document.addEventListener("DOMContentLoaded", async () => {
  const actionsModeRadios = document.getElementsByName("actionsMode");
  const exclusionSelectorsInput = document.getElementById("exclusion-selectors");
  const enableCrossTabCheckbox = document.getElementById("enable-cross-tab-crawl");
  const telemetryCheckbox = document.getElementById("telemetry-enabled");
  const saveBtn = document.getElementById("btn-save");
  const saveStatus = document.getElementById("save-status");
  if (typeof chrome !== "undefined" && chrome.storage?.local) {
    const data = await chrome.storage.local.get([
      "actionsMode",
      "exclusionSelectors",
      "enableCrossTabCrawl",
      "telemetryEnabled"
    ]);
    const mode = data.actionsMode || "execute";
    actionsModeRadios.forEach((radio) => {
      radio.checked = radio.value === mode;
    });
    exclusionSelectorsInput.value = (data.exclusionSelectors || []).join(", ");
    enableCrossTabCheckbox.checked = !!data.enableCrossTabCrawl;
    telemetryCheckbox.checked = !!data.telemetryEnabled;
  }
  saveBtn.addEventListener("click", async () => {
    let selectedMode = "execute";
    actionsModeRadios.forEach((radio) => {
      if (radio.checked) selectedMode = radio.value;
    });
    const exclusionSelectors = exclusionSelectorsInput.value.split(",").map((s) => s.trim()).filter(Boolean);
    const enableCrossTabCrawl = enableCrossTabCheckbox.checked;
    const telemetryEnabled = telemetryCheckbox.checked;
    if (typeof chrome !== "undefined" && chrome.storage?.local) {
      await chrome.storage.local.set({
        actionsMode: selectedMode,
        exclusionSelectors,
        enableCrossTabCrawl,
        telemetryEnabled
      });
      saveStatus.classList.remove("hidden");
      setTimeout(() => {
        saveStatus.classList.add("hidden");
      }, 2500);
    }
  });
});
//# sourceMappingURL=options.js.map
