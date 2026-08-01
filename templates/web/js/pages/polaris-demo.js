/**
 * Polaris Web Components reference page logic
 * Copy-to-clipboard, resource picker demo, and interactive examples.
 */

(function () {
  "use strict";

  // ── Copy to clipboard ──────────────────────────────────────────
  window.copyCode = function (button) {
    var container = button.closest(".demo-code") || button.closest(".code-block");
    if (!container) return;

    var codeEl = container.querySelector("code");
    if (!codeEl) return;

    var text = codeEl.textContent;

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
          '<s-banner tone="warning">' +
          "<s-text>" +
          "<s-text fontWeight=\"semibold\">Not available</s-text> " +
          "The Resource Picker requires the app to be loaded inside the Shopify admin iframe. " +
          "Install the app on a Shopify store to test this feature." +
          "</s-text></s-banner>";
      }
      return;
    }

    try {
      var selected = await shopify.resourcePicker({ type: "product" });
      var resultDiv = document.getElementById("picker-demo-result");

      if (!selected || selected.length === 0) {
        if (resultDiv) resultDiv.innerHTML = '<s-text color="subdued">Selection cancelled.</s-text>';
        return;
      }

      var html = '<s-box border="base" borderRadius="base" padding="base">';
      html += '<s-stack gap="base">';
      html += '<s-text variant="headingSm">Selected ' + selected.length + " product(s)</s-text>";
      for (var i = 0; i < selected.length; i++) {
        html += '<s-stack direction="inline" gap="base" alignItems="center">';
        html += '<s-text fontWeight="semibold">' + escapeHtml(selected[i].title || "Untitled") + "</s-text>";
        html += '<s-badge tone="success">Selected</s-badge>';
        html += "</s-stack>";
      }
      html += "</s-stack></s-box>";
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
    var anchors = document.querySelectorAll('a[href^="#section-"], s-button[href^="#section-"]');
    for (var i = 0; i < anchors.length; i++) {
      anchors[i].addEventListener("click", function (e) {
        var href = this.getAttribute("href");
        if (href && href.charAt(0) === "#") {
          e.preventDefault();
          var target = document.querySelector(href);
          if (target) {
            target.scrollIntoView({ behavior: "smooth", block: "start" });
          }
        }
      });
    }
  });
})();
