/**
 * Theme App Extension — storefront JavaScript.
 * Communicate with your backend via App Proxy:
 *   fetch("/apps/{subpath}/your-endpoint")
 */
(function () {
  "use strict";
  document.querySelectorAll(".app-block__button").forEach((btn) => {
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      btn.textContent = "Loading...";
      try {
        // Example: fetch("/apps/myapp/hello")
        // const data = await (await fetch("/apps/myapp/hello")).json();
        alert("Connect this button to your App Proxy endpoint.");
      } finally {
        btn.disabled = false;
        btn.textContent = "Click me";
      }
    });
  });
})();
