
/**
 * EduAdmin - Admin Settings
 *
 * Client-side validation only.
 * Settings are not persisted until backend storage is connected.
 */

(() => {
  "use strict";

  const academyForm = document.getElementById("academy-settings-form");
  const academicForm = document.getElementById("academic-settings-form");
  const notificationForm = document.getElementById("notification-settings-form");
  const message = document.getElementById("settings-message");

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

  function validateForm(form, successMessage) {
    if (!form) return;

    form.addEventListener("submit", (event) => {
      event.preventDefault();

      if (!form.reportValidity()) return;

      showMessage(
        `${successMessage} Nothing has been saved because backend storage is not connected.`,
        "info"
      );
    });
  }

  validateForm(
    academyForm,
    "Academy details passed browser validation."
  );

  validateForm(
    academicForm,
    "Academic preferences passed browser validation."
  );

  validateForm(
    notificationForm,
    "Notification preferences passed browser validation. Notifications are not active yet."
  );

  const academicYearInput = document.getElementById("academic-year");

  if (academicYearInput) {
    academicYearInput.addEventListener("change", () => {
      const value = academicYearInput.value.trim();

      if (!value) {
        academicYearInput.setCustomValidity("");
        return;
      }

      const match = value.match(/^(\d{4})-(\d{4})$/);

      if (!match) {
        academicYearInput.setCustomValidity(
          "Enter the academic year in YYYY-YYYY format."
        );
        academicYearInput.reportValidity();
        return;
      }

      const startYear = Number(match[1]);
      const endYear = Number(match[2]);

      if (endYear !== startYear + 1) {
        academicYearInput.setCustomValidity(
          "The ending year must be one year after the starting year."
        );
        academicYearInput.reportValidity();
        return;
      }

      academicYearInput.setCustomValidity("");
    });

    academicYearInput.addEventListener("input", () => {
      academicYearInput.setCustomValidity("");
    });
  }

  const phoneInput = document.getElementById("academy-phone");

  if (phoneInput) {
    phoneInput.addEventListener("input", () => {
      phoneInput.setCustomValidity("");
    });

    phoneInput.addEventListener("blur", () => {
      const value = phoneInput.value.trim();

      if (value && !/^[+\d\s().-]{7,20}$/.test(value)) {
        phoneInput.setCustomValidity(
          "Enter a valid-looking phone number using digits and common phone symbols."
        );
        phoneInput.reportValidity();
      }
    });
  }
})();
