/**
 * Settings page logic
 * Load, edit, and save app settings via the API.
 * Uses Polaris Web Components + data-save-bar for native save/discard UX.
 */

(function () {
  "use strict";

  // ── State ───────────────────────────────────────────────────────
  var savedSettings = {};

  // ── Init ────────────────────────────────────────────────────────
  document.addEventListener("DOMContentLoaded", function () {
    if (typeof apiFetch !== "function") {
      var loading = document.getElementById("settings-loading");
      if (loading) {
        loading.innerHTML =
          '<s-banner tone="critical"><s-text><s-text fontWeight="semibold">App failed to initialize</s-text> Core scripts did not load. Please refresh the page.</s-text></s-banner>';
      }
      return;
    }
    loadSettings();
    setupForm();
  });

  // ── Form wiring (data-save-bar handles save/discard bar) ────────
  function setupForm() {
    var form = document.getElementById("settings-form");

    // Submit = Save
    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      await saveSettings();
    });

    // Reset = Discard
    form.addEventListener("reset", function () {
      populateForm(savedSettings);
      showToast("Changes discarded");
    });
  }

  // ── Load settings ──────────────────────────────────────────────
  async function loadSettings() {
    var loading = document.getElementById("settings-loading");
    var content = document.getElementById("settings-content");

    try {
      var data = await apiFetch("/api/settings");
      savedSettings = data.settings || data || {};
      populateForm(savedSettings);

      // Hide loading, show content
      if (loading) loading.style.display = "none";
      content.style.display = "";
    } catch (err) {
      // If 404 or no settings yet, show empty form
      if (err.message && err.message.indexOf("404") !== -1) {
        savedSettings = {};
        populateForm(savedSettings);
        if (loading) loading.style.display = "none";
        content.style.display = "";
      } else {
        if (loading) {
          loading.innerHTML =
            '<s-banner tone="critical">' +
            "<s-text>" +
            "<s-text fontWeight=\"semibold\">Could not load settings</s-text> " +
            escapeHtml(err.message) +
            "</s-text></s-banner>" +
            '<s-box paddingBlockStart="base"><s-button onclick="location.reload()">Retry</s-button></s-box>';
        }
      }
    }
  }

  // ── Populate form fields ────────────────────────────────────────
  function populateForm(settings) {
    setFieldValue("setting-greeting", settings.greeting || "");
    setFieldValue("setting-theme", settings.theme || "auto");
    setFieldValue("setting-css", settings.customCss || "");
    setSwitch("setting-notifications", !!settings.notifications);
    setSwitch("setting-order-alerts", !!settings.orderAlerts);
  }

  function setFieldValue(id, value) {
    var el = document.getElementById(id);
    if (el) el.value = value;
  }

  function setSwitch(id, checked) {
    var el = document.getElementById(id);
    if (!el) return;
    el.checked = checked;
    if (checked) {
      el.setAttribute("checked", "");
    } else {
      el.removeAttribute("checked");
    }
  }

  // ── Collect form values ─────────────────────────────────────────
  function collectFormValues() {
    return {
      greeting: getVal("setting-greeting"),
      theme: getVal("setting-theme"),
      notifications: getChecked("setting-notifications"),
      orderAlerts: getChecked("setting-order-alerts"),
      customCss: getVal("setting-css"),
    };
  }

  function getVal(id) {
    var el = document.getElementById(id);
    return el ? el.value : "";
  }

  function getChecked(id) {
    var el = document.getElementById(id);
    return el ? el.hasAttribute("checked") || el.checked : false;
  }

  // ── Save settings ──────────────────────────────────────────────
  async function saveSettings() {
    try {
      var values = collectFormValues();

      await apiFetch("/api/settings", {
        method: "POST",
        body: JSON.stringify(values),
      });

      savedSettings = values;
      showToast("Settings saved successfully");
    } catch (err) {
      showToast("Failed to save: " + err.message, true);
    }
  }

  // Expose for direct calls
  window.saveSettings = saveSettings;
})();
