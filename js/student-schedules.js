
/**
 * EduAdmin - Student Schedules
 *
 * Frontend only.
 * Actual class schedules require backend integration.
 */

(() => {
  "use strict";

  const searchInput = document.getElementById("student-schedule-search");
  const dateFilter = document.getElementById("student-schedule-date");
  const tableBody = document.getElementById("student-schedules-table-body");

  if (!tableBody) {
    console.error("EduAdmin: Student schedules table was not found.");
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
      "Your assigned class schedules will appear here when schedule data is connected.";

    cell.append(heading, description);
    row.appendChild(cell);
    tableBody.appendChild(row);
  }

  function applyFilters() {
    const search = searchInput?.value.trim() || "";
    const selectedDate = dateFilter?.value || "";

    const filtersActive = Boolean(search || selectedDate);

    renderEmptyState(
      filtersActive
        ? "No matching schedule records are available"
        : "No schedule records available"
    );
  }

  searchInput?.addEventListener("input", applyFilters);
  dateFilter?.addEventListener("change", applyFilters);

  renderEmptyState("No schedule records available");

  console.info(
    "EduAdmin Student Schedules initialized. Schedule records are not connected."
  );
})();
