
/* =========================================================
   EduAdmin — Admin Teachers
   File: js/admin-teachers.js
   ========================================================= */

(function () {
  "use strict";

  function initAdminTeachers() {
    const addButton = document.getElementById("add-teacher-button");
    const formSection = document.getElementById("teacher-form-section");
    const form = document.getElementById("teacher-form");
    const cancelButton = document.getElementById("cancel-teacher-button");
    const message = document.getElementById("teachers-message");

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

      document.getElementById("teacher-name").focus();

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

      const name = document.getElementById("teacher-name").value.trim();
      const email = document.getElementById("teacher-email").value.trim();

      if (!name || !email) {
        showMessage(
          "Enter the teacher's name and email address.",
          "error"
        );
        return;
      }

      if (!form.checkValidity()) {
        form.reportValidity();
        return;
      }

      /*
       * Backend is not connected.
       * Do not claim that a teacher record was saved.
       */
      showMessage(
        "The form is valid, but the teacher has not been saved. " +
        "Connect the academy data service before creating teacher records.",
        "info"
      );
    });

    hideMessage();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initAdminTeachers, {
      once: true
    });
  } else {
    initAdminTeachers();
  }
})();
