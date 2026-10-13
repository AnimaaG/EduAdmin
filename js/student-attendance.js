
/**
 * EduAdmin - Student Attendance
 *
 * Frontend only.
 * Attendance records and summaries require backend integration.
 */

(() => {
  "use strict";

  const dateFilter = document.getElementById("student-attendance-date");
  const statusFilter = document.getElementById("student-attendance-status");
  const searchInput = document.getElementById("student-attendance-search");
  const tableBody = document.getElementById("student-attendance-table-body");

  if (!tableBody) {
    console.error("EduAdmin: Student attendance table was not found.");
    return;
  }

  function renderEmptyState(message) {
    tableBody.replaceChildren();

    const row = document.createElement("tr");
    const cell = document.createElement("td");
    const heading = document.createElement("strong");
    const description = document.createElement("p");

    cell.colSpan = 5;
    cell.className = "empty-state";

    heading.textContent = message;
    description.textContent =
      "Verified attendance records will appear here after backend integration.";

    cell.append(heading, description);
    row.appendChild(cell);
    tableBody.appendChild(row);
  }

  function applyFilters() {
    const selectedDate = dateFilter?.value || "";
    const selectedStatus = statusFilter?.value || "all";
    const search = searchInput?.value.trim() || "";

    const filtersActive =
      Boolean(selectedDate || search) ||
      selectedStatus !== "all";

    renderEmptyState(
      filtersActive
        ? "No matching attendance records are available"
        : "No attendance records available"
    );
  }

  dateFilter?.addEventListener("change", applyFilters);
  statusFilter?.addEventListener("change", applyFilters);
  searchInput?.addEventListener("input", applyFilters);

  renderEmptyState("No attendance records available");

  console.info(
    "EduAdmin Student Attendance initialized. Attendance records are not connected."
  );
})();
