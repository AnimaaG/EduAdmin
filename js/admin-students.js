
/* =========================================================
   EduAdmin — Admin Students
   File: js/admin-students.js
   ========================================================= */

(function () {
  "use strict";

  function initAdminStudents() {
    const addButton = document.getElementById("add-student-button");
    const formSection = document.getElementById("student-form-section");
    const form = document.getElementById("student-form");
    const cancelButton = document.getElementById("cancel-student-button");
    const message = document.getElementById("students-message");

    if (!addButton || !formSection || !form || !cancelButton || !message) {
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

    function openForm() {
      hideMessage();
      formSection.hidden = false;
      addButton.disabled = true;

      document.getElementById("student-name").focus();

      formSection.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    }

    function closeForm() {
      form.reset();
      formSection.hidden = true;
      addButton.disabled = false;
      hideMessage();
      addButton.focus();
    }

    addButton.addEventListener("click", openForm);
    cancelButton.addEventListener("click", closeForm);

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      hideMessage();

      const name = document.getElementById("student-name").value.trim();
      const phone = document.getElementById("student-phone").value.trim();
      const classId = document.getElementById("student-class").value;

      if (!name || !phone || !classId) {
        showMessage(
          "Enter the student's name and phone number, and select a class.",
          "error"
        );
        return;
      }

      if (!form.checkValidity()) {
        form.reportValidity();
        return;
      }

      /*
       * The backend is not connected.
       * Do not claim that the student was saved.
       */
      showMessage(
        "The form is valid, but the student has not been saved. " +
        "Connect the academy data service before creating student records.",
        "info"
      );
    });

    hideMessage();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initAdminStudents, {
      once: true
    });
  } else {
    initAdminStudents();
  }
})();
