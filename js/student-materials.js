
/**
 * EduAdmin - Student Study Materials
 *
 * Frontend only.
 * Materials, payment records, and access permissions require backend integration.
 */

(() => {
  "use strict";

  const searchInput = document.getElementById("student-material-search");
  const typeFilter = document.getElementById("student-material-type-filter");
  const accessFilter = document.getElementById("student-material-access-filter");
  const tableBody = document.getElementById("student-materials-table-body");

  if (!tableBody) {
    console.error("EduAdmin: Student materials table was not found.");
    return;
  }

  function renderEmptyState(message) {
    tableBody.replaceChildren();

    const row = document.createElement("tr");
    const cell = document.createElement("td");
    const heading = document.createElement("strong");
    const description = document.createElement("p");

    cell.colSpan = 7;
    cell.className = "empty-state";

    heading.textContent = message;
    description.textContent =
      "Published materials will appear here when the backend is connected.";

    cell.append(heading, description);
    row.appendChild(cell);
    tableBody.appendChild(row);
  }

  function applyFilters() {
    const search = searchInput?.value.trim() || "";
    const type = typeFilter?.value || "all";
    const access = accessFilter?.value || "all";

    const filtersActive =
      search.length > 0 ||
      type !== "all" ||
      access !== "all";

    renderEmptyState(
      filtersActive
        ? "No matching materials are available"
        : "No materials available"
    );
  }

  searchInput?.addEventListener("input", applyFilters);
  typeFilter?.addEventListener("change", applyFilters);
  accessFilter?.addEventListener("change", applyFilters);

  renderEmptyState("No materials available");

  console.info(
    "EduAdmin Student Materials initialized. Material records are not connected."
  );
})();
