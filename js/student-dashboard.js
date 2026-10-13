
/**
 * EduAdmin - Student Dashboard
 *
 * Initializes the dashboard without inventing student records.
 * Real dashboard data requires backend integration.
 */

(() => {
  "use strict";

  const dashboard = document.querySelector(".dashboard-main");

  if (!dashboard) {
    console.error("EduAdmin: Student dashboard container was not found.");
    return;
  }

  // Keep summary values as placeholders until actual student data is available.
  const summaryCards = dashboard.querySelectorAll(".stats-grid .stat-card");

  summaryCards.forEach((card) => {
    const value = card.querySelector("h3");

    if (value && !value.textContent.trim()) {
      value.textContent = "—";
    }
  });

  // Show a clear initial state for recent updates.
  const updatesSection = Array.from(
    dashboard.querySelectorAll(".dashboard-section")
  ).find((section) => {
    const heading = section.querySelector("h2");
    return heading?.textContent.trim() === "Recent Updates";
  });

  if (updatesSection) {
    const emptyState = updatesSection.querySelector(".empty-state");

    if (emptyState) {
      emptyState.setAttribute("role", "status");
    }
  }

  // Do not claim the student is authenticated or display fabricated personal data.
  console.info(
    "EduAdmin Student Dashboard initialized. Student records are not connected."
  );
})();
