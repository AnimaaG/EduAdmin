
/* =========================================================
   EduAdmin — Admin Attendance
   File: js/admin-attendance.js
   ========================================================= */

(function () {
  "use strict";

  function initAdminAttendance() {
    const form = document.getElementById("attendance-filter-form");
    const classSelect = document.getElementById("attendance-class");
    const dateInput = document.getElementById("attendance-date");
    const saveButton = document.getElementById("save-attendance-button");
    const message = document.getElementById("attendance-message");

    if (!form || !classSelect || !dateInput || !saveButton || !message) {
      return;
    }

    function showMessage(text, type) {
      message.textContent = text;
      message.className = "message " + type;
      message.hidden = false;
    }

    function hideMessage() {
      message.textContent = "";
      message.hidden = true;
    }

    /*
     * Set today's local date without relying on UTC.
     * Do not overwrite an existing date selection.
     */
    function getLocalDate() {
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, "0");
      const day = String(now.getDate()).padStart(2, "0");

      return year + "-" + month + "-" + day;
    }

    if (!dateInput.value) {
      dateInput.value = getLocalDate();
    }

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      hideMessage();

      const classId = classSelect.value;
      const attendanceDate = dateInput.value;

      if (!classId || !attendanceDate) {
        showMessage(
          "Select a class and attendance date before continuing.",
          "error"
        );
        return;
      }

      if (!form.checkValidity()) {
        form.reportValidity();
        return;
      }

      /*
       * Class options and student records are not connected yet.
       * Do not claim that students were loaded.
       */
      saveButton.disabled = true;

      showMessage(
        "Your selection is valid, but student records are not connected. " +
        "Connect the academy data service to load students and record attendance.",
        "info"
      );
    });

    saveButton.disabled = true;
    hideMessage();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initAdminAttendance, {
      once: true
    });
  } else {
    initAdminAttendance();
  }
})();
