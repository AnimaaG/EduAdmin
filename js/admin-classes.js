
/* =========================================================
   EduAdmin — Admin Classes
   File: js/admin-classes.js
   ========================================================= */

(function () {
  "use strict";

  function initAdminClasses() {
    const addButton = document.getElementById("add-class-button");
    const formSection = document.getElementById("class-form-section");
    const form = document.getElementById("class-form");
    const cancelButton = document.getElementById("cancel-class-button");
    const message = document.getElementById("classes-message");

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

      const firstField = document.getElementById("class-name");
      if (firstField) firstField.focus();

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

      const className = document.getElementById("class-name").value.trim();
      const subject = document.getElementById("class-subject").value.trim();

      if (!className || !subject) {
        showMessage(
          "Enter a class name and subject before continuing.",
          "error"
        );
        return;
      }

      /*
       * No database is connected yet.
       * Do not claim that the class was saved.
       */
      showMessage(
        "The form is valid, but the class has not been saved. " +
        "Connect the academy data service before creating real class records.",
        "info"
      );
    });

    hideMessage();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initAdminClasses, {
      once: true
    });
  } else {
    initAdminClasses();
  }
})();
