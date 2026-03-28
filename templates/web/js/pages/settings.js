/**
 * Settings page logic
 * Load, edit, and save app settings via the API.
 * Shows/hides the App Bridge <ui-save-bar> when the form is dirty.
 */

(function () {
  "use strict";

  // ── State ───────────────────────────────────────────────────────
  var savedSettings = {};
  var isDirty = false;
  var isSaving = false;

  // ── Init ────────────────────────────────────────────────────────
  document.addEventListener("DOMContentLoaded", function () {
    loadSettings();
    setupSaveBar();
  });

  // ── Save bar wiring ─────────────────────────────────────────────
  function setupSaveBar() {
    var saveBar = document.getElementById("save-bar");
    var saveBtn = document.getElementById("save-btn");
    var discardBtn = document.getElementById("discard-btn");

    if (saveBtn) {
      saveBtn.addEventListener("click", function () {
        saveSettings();
      });
    }

    if (discardBtn) {
      discardBtn.addEventListener("click", function () {
        discardChanges();
      });
    }
  }

  // ── Load settings ──────────────────────────────────────────────
  async function loadSettings() {
    var container = document.getElementById("settings-container");

    try {
      var data = await apiFetch("/api/settings");
      savedSettings = data.settings || data || {};
      renderForm(container, savedSettings);
    } catch (err) {
      // If 404 or no settings yet, render empty form
      if (err.message && err.message.indexOf("404") !== -1) {
        savedSettings = {};
        renderForm(container, savedSettings);
      } else {
        container.innerHTML =
          '<div class="banner banner-critical">' +
          '<div class="banner-icon">&#9888;</div>' +
          '<div class="banner-content">' +
          "<p><strong>Could not load settings</strong></p>" +
          "<p>" + escapeHtml(err.message) + "</p>" +
          "</div></div>" +
          '<button class="btn mt-4" onclick="location.reload()">Retry</button>';
      }
    }
  }

  // ── Render form ─────────────────────────────────────────────────
  function renderForm(container, settings) {
    var html = "";

    // General settings card
    html += '<div class="card">';
    html += '<h2>General</h2>';
    html += '<p class="mb-4">Configure basic app settings.</p>';

    // Greeting message
    html += '<div class="form-group">';
    html += '<label for="setting-greeting">Store greeting message</label>';
    html += '<input type="text" class="form-input" id="setting-greeting" placeholder="Welcome to our store!" value="' + escapeAttr(settings.greeting || "") + '">';
    html += '<p class="form-hint">Displayed to customers when they visit your app.</p>';
    html += "</div>";

    // Theme select
    html += '<div class="form-group">';
    html += '<label for="setting-theme">Theme</label>';
    html += '<select class="form-select" id="setting-theme">';
    html += '<option value="auto"' + (settings.theme === "auto" ? " selected" : "") + '>Auto (System)</option>';
    html += '<option value="light"' + (settings.theme === "light" ? " selected" : "") + ">Light</option>";
    html += '<option value="dark"' + (settings.theme === "dark" ? " selected" : "") + ">Dark</option>";
    html += "</select>";
    html += '<p class="form-hint">Choose the visual theme for your app interface.</p>';
    html += "</div>";

    html += "</div>"; // end card

    // Notifications card
    html += '<div class="card">';
    html += '<h2>Notifications</h2>';
    html += '<p class="mb-4">Manage email and push notification preferences.</p>';

    // Enable notifications checkbox
    html += '<div class="form-group">';
    html += '<label class="form-checkbox">';
    html += '<input type="checkbox" id="setting-notifications"' + (settings.notifications ? " checked" : "") + ">";
    html += "<span>Enable email notifications</span>";
    html += "</label>";
    html += '<p class="form-hint" style="margin-left: 26px;">Receive email alerts for new orders and important events.</p>';
    html += "</div>";

    // Order notifications checkbox
    html += '<div class="form-group">';
    html += '<label class="form-checkbox">';
    html += '<input type="checkbox" id="setting-order-alerts"' + (settings.orderAlerts ? " checked" : "") + ">";
    html += "<span>Order alert notifications</span>";
    html += "</label>";
    html += '<p class="form-hint" style="margin-left: 26px;">Get notified when a new order is placed.</p>';
    html += "</div>";

    html += "</div>"; // end card

    // Advanced card
    html += '<div class="card">';
    html += '<h2>Advanced</h2>';
    html += '<p class="mb-4">Advanced customization options.</p>';

    // Custom CSS textarea
    html += '<div class="form-group">';
    html += '<label for="setting-css">Custom CSS</label>';
    html += '<textarea class="form-textarea" id="setting-css" rows="6" placeholder="/* Add custom styles here */">' + escapeHtml(settings.customCss || "") + "</textarea>";
    html += '<p class="form-hint">Add custom CSS to override default styles. Use with caution.</p>';
    html += "</div>";

    html += "</div>"; // end card

    // Save button (visible below form too)
    html += '<div class="flex justify-end gap-3 mb-8">';
    html += '<button class="btn" onclick="discardChanges()">Discard</button>';
    html += '<button class="btn btn-primary" id="save-button" onclick="saveSettings()">Save settings</button>';
    html += "</div>";

    container.innerHTML = html;

    // Attach change listeners for dirty tracking
    var inputs = container.querySelectorAll("input, select, textarea");
    for (var i = 0; i < inputs.length; i++) {
      inputs[i].addEventListener("input", markDirty);
      inputs[i].addEventListener("change", markDirty);
    }
  }

  // ── Dirty state management ──────────────────────────────────────
  function markDirty() {
    if (isDirty) return;
    isDirty = true;

    var saveBar = document.getElementById("save-bar");
    if (saveBar && saveBar.show) {
      saveBar.show();
    }
  }

  function clearDirty() {
    isDirty = false;

    var saveBar = document.getElementById("save-bar");
    if (saveBar && saveBar.hide) {
      saveBar.hide();
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
    return el ? el.checked : false;
  }

  // ── Save settings ──────────────────────────────────────────────
  window.saveSettings = async function () {
    if (isSaving) return;
    isSaving = true;

    var saveButton = document.getElementById("save-button");
    if (saveButton) {
      saveButton.classList.add("btn-loading");
      saveButton.disabled = true;
    }

    try {
      var values = collectFormValues();

      await apiFetch("/api/settings", {
        method: "POST",
        body: JSON.stringify(values),
      });

      savedSettings = values;
      clearDirty();
      showToast("Settings saved successfully");
    } catch (err) {
      showToast("Failed to save: " + err.message, true);
    } finally {
      isSaving = false;
      if (saveButton) {
        saveButton.classList.remove("btn-loading");
        saveButton.disabled = false;
      }
    }
  };

  // ── Discard changes ─────────────────────────────────────────────
  window.discardChanges = function () {
    var container = document.getElementById("settings-container");
    renderForm(container, savedSettings);
    clearDirty();
    showToast("Changes discarded");
  };

  // ── Helpers ─────────────────────────────────────────────────────
  function escapeAttr(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }
})();
