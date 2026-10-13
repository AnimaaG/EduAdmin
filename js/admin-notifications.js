
/**
 * EduAdmin - Admin Notifications
 *
 * Frontend only.
 * Live events, notification storage, and delivery are not connected.
 */

(() => {
  "use strict";

  const searchInput = document.getElementById("notification-search");
  const typeFilter = document.getElementById("notification-type-filter");
  const statusFilter = document.getElementById("notification-status-filter");
  const tableBody = document.getElementById("notifications-table-body");

  const deliveryForm = document.getElementById("notification-delivery-form");
  const message = document.getElementById("notifications-message");

  const markAllReadButton = document.getElementById("mark-all-read-button");

  if (!tableBody || !deliveryForm) {
    console.error("EduAdmin: Notification page elements were not found.");
    return;
  }

  function showMessage(text, type = "info") {
    if (!message) return;

    message.textContent = text;
    message.hidden = false;
    message.className = `form-message ${type}`;
    message.setAttribute("role", type === "error" ? "alert" : "status");

    message.scrollIntoView({
      behavior: "smooth",
      block: "nearest"
    });
  }

  function renderEmptyState(text) {
    tableBody.replaceChildren();

    const row = document.createElement("tr");
    const cell = document.createElement("td");
    const heading = document.createElement("strong");
    const description = document.createElement("p");

    cell.colSpan = 5;
    cell.className = "empty-state";

    heading.textContent = text;
    description.textContent =
      "Notification records will appear here after backend integration.";

    cell.append(heading, description);
    row.appendChild(cell);
    tableBody.appendChild(row);
  }

  function applyFilters() {
    const hasSearch = Boolean(searchInput?.value.trim());
    const selectedType = typeFilter?.value || "all";
    const selectedStatus = statusFilter?.value || "all";

    const filtersActive =
      hasSearch ||
      selectedType !== "all" ||
      selectedStatus !== "all";

    renderEmptyState(
      filtersActive
        ? "No matching notifications are available"
        : "No notifications loaded"
    );
  }

  searchInput?.addEventListener("input", applyFilters);
  typeFilter?.addEventListener("change", applyFilters);
  statusFilter?.addEventListener("change", applyFilters);

  // This control remains disabled until actual notification records exist.
  if (markAllReadButton) {
    markAllReadButton.disabled = true;
    markAllReadButton.addEventListener("click", () => {
      showMessage(
        "Notifications cannot be marked as read until notification records are connected.",
        "info"
      );
    });
  }

  deliveryForm.addEventListener("submit", (event) => {
    event.preventDefault();

    if (!deliveryForm.reportValidity()) return;

    const inApp = document.getElementById("delivery-in-app").checked;
    const browserPush = document.getElementById("delivery-browser-push").checked;
    const email = document.getElementById("delivery-email").checked;

    if (!inApp && !browserPush && !email) {
      showMessage(
        "Select at least one notification delivery channel.",
        "error"
      );
      return;
    }

    showMessage(
      "Delivery preferences passed validation. They have NOT been saved, and notifications have NOT been activated. Backend storage and delivery services are still required.",
      "info"
    );
  });

  renderEmptyState("No notifications loaded");
})();
