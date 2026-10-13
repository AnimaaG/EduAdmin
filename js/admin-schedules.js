
/**
 * EduAdmin - Admin Schedules
 *
 * Frontend validation only.
 * Schedule records are not saved until backend storage is connected.
 */

(() => {
  "use strict";

  const form = document.getElementById("schedule-form");
  const formSection = document.getElementById("schedule-form-section");
  const addButton = document.getElementById("add-schedule-button");
  const cancelButton = document.getElementById("cancel-schedule-button");
  const message = document.getElementById("schedules-message");
  const searchInput = document.getElementById("schedule-search");
  const dateFilter = document.getElementById("schedule-date-filter");
  const tableBody = document.getElementById("schedules-table-body");
  const saveButton = document.getElementById("save-schedule-button");

  if (!form || !formSection || !addButton || !cancelButton) {
    console.error("EduAdmin: Schedule page elements were not found.");
    return;
  }

  function showMessage(text, type = "info") {
    if (!message) return;

    message.textContent = text;
    message.hidden = false;
    message.className = `form-message ${type}`;
    message.setAttribute("role", type === "error" ? "alert" : "status");
  }

  function hideMessage() {
    if (!message) return;

    message.textContent = "";
    message.hidden = true;
  }

  function openForm() {
    formSection.hidden = false;
    hideMessage();

    document.getElementById("schedule-title")?.focus();

    formSection.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  }

  function closeForm() {
    form.reset();
    hideMessage();
    formSection.hidden = true;

    if (saveButton) {
      saveButton.textContent = "Validate Schedule";
    }
  }

  function renderEmptyState(text) {
    if (!tableBody) return;

    tableBody.replaceChildren();

    const row = document.createElement("tr");
    const cell = document.createElement("td");
    const heading = document.createElement("strong");
    const description = document.createElement("p");

    cell.colSpan = 7;
    cell.className = "empty-state";

    heading.textContent = text;
    description.textContent =
      "Schedule records will appear here after backend storage is connected.";

    cell.append(heading, description);
    row.appendChild(cell);
    tableBody.appendChild(row);
  }

  function filterSchedules() {
    const hasSearch = Boolean(searchInput?.value.trim());
    const hasDate = Boolean(dateFilter?.value);

    if (hasSearch || hasDate) {
      renderEmptyState("No matching schedule records are available");
    } else {
      renderEmptyState("No schedule records loaded");
    }
  }

  addButton.addEventListener("click", openForm);
  cancelButton.addEventListener("click", closeForm);

  searchInput?.addEventListener("input", filterSchedules);
  dateFilter?.addEventListener("change", filterSchedules);

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    hideMessage();

    if (!form.reportValidity()) return;

    const startTime = document.getElementById("schedule-start-time").value;
    const endTime = document.getElementById("schedule-end-time").value;
    const date = document.getElementById("schedule-date").value;
    const day = document.getElementById("schedule-day").value;
    const title = document.getElementById("schedule-title").value.trim();
    const subject = document.getElementById("schedule-subject").value.trim();
    const classValue = document.getElementById("schedule-class").value;
    const teacherValue = document.getElementById("schedule-teacher").value;

    if (!title || !subject || !classValue || !teacherValue) {
      showMessage(
        "Complete all required fields and select an available class and teacher. These lists need backend data.",
        "error"
      );
      return;
    }

    if (endTime <= startTime) {
      showMessage(
        "End time must be later than start time.",
        "error"
      );
      document.getElementById("schedule-end-time").focus();
      return;
    }

    if (day) {
      const selectedDate = new Date(`${date}T12:00:00`);
      const actualDay = selectedDate.toLocaleDateString("en-US", {
        weekday: "long"
      });

      if (actualDay !== day) {
        showMessage(
          `The selected date falls on ${actualDay}, not ${day}. Choose a matching date or select "One-time class".`,
          "error"
        );
        return;
      }
    }

    showMessage(
      "Validation complete. This schedule has NOT been saved or published because backend storage is not connected.",
      "info"
    );

    if (saveButton) {
      saveButton.textContent = "Validation Complete";
    }
  });

  renderEmptyState("No schedule records loaded");
})();
