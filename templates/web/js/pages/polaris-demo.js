/**
 * Polaris component demo page logic
 * Copy-to-clipboard, live demos, collapsible sections, and interactive examples.
 */

(function () {
  "use strict";

  // ── Copy to clipboard ──────────────────────────────────────────
  window.copyCode = function (button) {
    // Find the <pre><code> sibling
    var container = button.closest(".demo-code") || button.closest(".code-block");
    if (!container) return;

    var codeEl = container.querySelector("code");
    if (!codeEl) return;

    var text = codeEl.textContent;

    // Use clipboard API when available
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        showCopiedFeedback(button);
      }).catch(function () {
        fallbackCopy(text, button);
      });
    } else {
      fallbackCopy(text, button);
    }
  };

  function fallbackCopy(text, button) {
    var textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    try {
      document.execCommand("copy");
      showCopiedFeedback(button);
    } catch (_) {
      showToast("Failed to copy to clipboard", true);
    }
    document.body.removeChild(textarea);
  }

  function showCopiedFeedback(button) {
    var original = button.textContent;
    button.textContent = "Copied!";
    button.classList.add("copied");
    setTimeout(function () {
      button.textContent = original;
      button.classList.remove("copied");
    }, 2000);
  }

  // ── Banner reset ───────────────────────────────────────────────
  window.resetBanners = function () {
    var preview = document.getElementById("banners-preview");
    if (!preview) return;

    // Remove existing banners
    var existing = preview.querySelectorAll(".banner");
    for (var i = 0; i < existing.length; i++) {
      existing[i].remove();
    }

    // Re-insert banners before the reset button
    var resetBtn = preview.querySelector("button");

    var banners = [
      {
        cls: "banner-info",
        icon: "&#8505;",
        title: "Information",
        text: "This is an informational banner. Use it for tips or neutral messages.",
      },
      {
        cls: "banner-success",
        icon: "&#10003;",
        title: "Success",
        text: "The operation completed successfully. Your changes have been saved.",
      },
      {
        cls: "banner-warning",
        icon: "&#9888;",
        title: "Warning",
        text: "This action may have unintended consequences. Please review before proceeding.",
      },
      {
        cls: "banner-critical",
        icon: "&#10006;",
        title: "Error",
        text: "Something went wrong. Please try again or contact support.",
      },
    ];

    for (var j = 0; j < banners.length; j++) {
      var b = banners[j];
      var div = document.createElement("div");
      div.className = "banner " + b.cls;
      div.innerHTML =
        '<div class="banner-icon">' + b.icon + "</div>" +
        '<div class="banner-content">' +
        "<p><strong>" + b.title + "</strong></p>" +
        "<p>" + b.text + "</p>" +
        "</div>" +
        '<button class="banner-dismiss" onclick="this.closest(\'.banner\').remove()">&times;</button>';
      preview.insertBefore(div, resetBtn);
    }

    showToast("Banners restored");
  };

  // ── Confirmation delete demo ───────────────────────────────────
  window.demoConfirmDelete = function () {
    var modal = document.getElementById("demo-modal-confirm");
    if (modal && modal.hide) modal.hide();
    showToast("Item deleted (demo only)");
  };

  // ── Resource picker demo ───────────────────────────────────────
  window.demoResourcePicker = async function () {
    if (!window.shopify || !window.shopify.resourcePicker) {
      showToast("Resource Picker is only available inside the Shopify admin.", true);
      var resultDiv = document.getElementById("picker-demo-result");
      if (resultDiv) {
        resultDiv.innerHTML =
          '<div class="banner banner-warning" style="margin-bottom:0;">' +
          '<div class="banner-icon">&#9888;</div>' +
          '<div class="banner-content">' +
          "<p><strong>Not available</strong></p>" +
          "<p>The Resource Picker requires the app to be loaded inside the Shopify admin iframe. " +
          "Install the app on a Shopify store to test this feature.</p>" +
          "</div></div>";
      }
      return;
    }

    try {
      var selected = await shopify.resourcePicker({ type: "product" });
      var resultDiv = document.getElementById("picker-demo-result");

      if (!selected || selected.length === 0) {
        if (resultDiv) resultDiv.innerHTML = '<p class="text-secondary">Selection cancelled.</p>';
        return;
      }

      var html = '<div class="card" style="margin-bottom:0;">';
      html += '<h3 class="mb-3">Selected ' + selected.length + " product(s)</h3>";
      html += '<ul class="info-list">';
      for (var i = 0; i < selected.length; i++) {
        html += "<li>" +
          '<span class="font-semibold">' + escapeHtml(selected[i].title || "Untitled") + "</span>" +
          '<span class="badge badge-success">Selected</span>' +
          "</li>";
      }
      html += "</ul></div>";
      if (resultDiv) resultDiv.innerHTML = html;
    } catch (err) {
      showToast("Resource picker error: " + err.message, true);
    }
  };

  // ── API fetch demo ─────────────────────────────────────────────
  window.demoApiFetch = async function () {
    try {
      var data = await apiFetch("/api/shop");
      var name = (data.shop && data.shop.name) || data.name || "unknown";
      showToast("API call successful! Shop: " + name);
    } catch (err) {
      showToast("API error: " + err.message, true);
    }
  };

  // ── Smooth scroll for anchor links ─────────────────────────────
  document.addEventListener("DOMContentLoaded", function () {
    var anchors = document.querySelectorAll('a[href^="#section-"]');
    for (var i = 0; i < anchors.length; i++) {
      anchors[i].addEventListener("click", function (e) {
        e.preventDefault();
        var target = document.querySelector(this.getAttribute("href"));
        if (target) {
          target.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      });
    }
  });
})();
