function loadMarketplaceWidget() {
  const urlParams = new URLSearchParams(window.location.search);
  const widget = urlParams.get("widget");

  if (widget !== null) {
    var script2 = document.createElement("script");

    script2.src = widget;
    document.head.appendChild(script2);
  }
}

async function postJson(url, payload) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(payload),
  });

  return response.json();
}

function renderJson(target, value) {
  target.textContent = JSON.stringify(value, null, 2);
}

document.addEventListener("DOMContentLoaded", function () {
  loadMarketplaceWidget();

  const searchForm = document.getElementById("search-form");
  const searchInput = document.getElementById("inventory-query");
  const inventoryResults = document.getElementById("inventory-results");
  const pluginForm = document.getElementById("plugin-form");
  const pluginOutput = document.getElementById("plugin-output");
  const importForm = document.getElementById("import-form");
  const importOutput = document.getElementById("import-output");
  const reportForm = document.getElementById("report-form");
  const reportOutput = document.getElementById("report-output");

  searchForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const response = await fetch(`/api/inventory?q=${encodeURIComponent(searchInput.value)}`, {
      credentials: "include",
    });
    const data = await response.json();

    inventoryResults.replaceChildren(
      ...data.rows.map((item) => {
        const row = document.createElement("li");
        row.textContent = `${item.sku} - ${item.name} (${item.quantity} in ${item.aisle})`;
        return row;
      }),
    );
  });

  pluginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(pluginForm).entries());
    const result = await postJson("/api/plugins/install", payload);
    renderJson(pluginOutput, result);
  });

  importForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(importForm).entries());
    const result = await postJson("/api/imports/profile", payload);
    renderJson(importOutput, result);
  });

  reportForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(reportForm).entries());
    localStorage.setItem("stockpilot.reportPreferences", JSON.stringify(payload));
    const saved = JSON.parse(localStorage.getItem("stockpilot.reportPreferences") || "{}");
    const result = await postJson("/api/reports/preview", saved);
    renderJson(reportOutput, result);
  });
});
