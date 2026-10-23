
import { auth, db } from "./firebase-config.js";

import { onAuthStateChanged } from
  "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";

import {
  doc,
  getDoc,
  updateDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

(() => {
  "use strict";

  const academyForm = document.getElementById("academy-settings-form");
  const academicForm = document.getElementById("academic-settings-form");
  const notificationForm = document.getElementById("notification-settings-form");
  const message = document.getElementById("settings-message");

  let academyId = "";
  let academyData = {};
  let loading = true;

  function showMessage(text, type = "info") {
    if (!message) return;

    message.textContent = text;
    message.hidden = false;
    message.className = `form-message ${type}`;
    message.setAttribute("role", type === "error" ? "alert" : "status");
    message.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function setFormDisabled(form, disabled) {
    if (!form) return;
    form.querySelectorAll("input, select, button, textarea").forEach((element) => {
      element.disabled = disabled;
    });
  }

  function setValue(id, value) {
    const element = document.getElementById(id);
    if (element && value !== undefined && value !== null) {
      element.value = String(value);
    }
  }

  function setChecked(id, value) {
    const element = document.getElementById(id);
    if (element) element.checked = Boolean(value);
  }

  function getValue(id) {
    return document.getElementById(id)?.value.trim() || "";
  }

  function getChecked(id) {
    return Boolean(document.getElementById(id)?.checked);
  }

  function validateAcademicYear() {
    const input = document.getElementById("academic-year");
    if (!input) return true;

    const value = input.value.trim();
    input.setCustomValidity("");

    if (!value) return true;

    const match = value.match(/^(\d{4})-(\d{4})$/);

    if (!match || Number(match[2]) !== Number(match[1]) + 1) {
      input.setCustomValidity(
        "Enter a valid academic year, such as 2026-2027."
      );
      input.reportValidity();
      return false;
    }

    return true;
  }

  function fillForms(data) {
    academyData = data;

    // These fields match the academy profile fields used by registration.
    setValue("academy-name", data.name || "");
    setValue("academy-email", data.email || "");
    setValue("academy-phone", data.phone || "");
    setValue("academy-address", data.address || "");

    const settings = data.settings || {};

    setValue("academic-year", settings.academicYear || "");
    setValue("default-currency", settings.currency || "INR");
    setValue("date-format", settings.dateFormat || "DD/MM/YYYY");
    setValue("timezone", settings.timezone || "Asia/Kolkata");

    const notifications = settings.notifications || {};
    setChecked("notify-payment-pending", notifications.paymentPending ?? true);
    setChecked("notify-payment-approved", notifications.paymentApproved ?? true);
    setChecked("notify-payment-rejected", notifications.paymentRejected ?? true);
    setChecked("notify-email", notifications.emailNotifications ?? false);
    setChecked("notify-browser-push", notifications.browserPush ?? false);
  }

  async function loadSettings(user) {
    const userSnapshot = await getDoc(doc(db, "users", user.uid));

    if (!userSnapshot.exists()) {
      throw new Error("Your user profile was not found.");
    }

    const profile = userSnapshot.data();

    if (profile.role !== "admin" || profile.isActive !== true) {
      throw new Error("An active administrator account is required.");
    }

    if (!profile.academyId) {
      throw new Error("Your account is not linked to an academy.");
    }

    academyId = profile.academyId;

    const academySnapshot = await getDoc(doc(db, "academies", academyId));

    if (!academySnapshot.exists()) {
      throw new Error("The academy profile was not found.");
    }

    fillForms(academySnapshot.data());
  }

  async function saveAcademy(event) {
    event.preventDefault();

    if (!academyForm.reportValidity()) return;

    const name = getValue("academy-name");
    const phone = getValue("academy-phone");

    if (!name) {
      showMessage("Enter the academy name.", "error");
      return;
    }

    if (phone && !/^[+\d\s().-]{7,20}$/.test(phone)) {
      showMessage("Enter a valid contact number.", "error");
      return;
    }

    const button = academyForm.querySelector('button[type="submit"]');
    if (button) button.disabled = true;

    try {
      await updateDoc(doc(db, "academies", academyId), {
        name,
        email: getValue("academy-email"),
        phone,
        address: getValue("academy-address"),
        updatedAt: serverTimestamp()
      });

      showMessage("Academy profile saved successfully.", "success");
    } catch (error) {
      console.error("Could not save academy profile:", error);
      showMessage(
        error.code === "permission-denied"
          ? "Permission denied. Check your Firestore academy update rules."
          : "Could not save the academy profile. Check your connection and try again.",
        "error"
      );
    } finally {
      if (button) button.disabled = false;
    }
  }

  async function saveAcademicPreferences(event) {
    event.preventDefault();

    if (!academicForm.reportValidity() || !validateAcademicYear()) return;

    const settings = {
      ...(academyData.settings || {}),
      academicYear: getValue("academic-year"),
      currency: getValue("default-currency"),
      dateFormat: getValue("date-format"),
      timezone: getValue("timezone")
    };

    const button = academicForm.querySelector('button[type="submit"]');
    if (button) button.disabled = true;

    try {
      await updateDoc(doc(db, "academies", academyId), {
        settings,
        updatedAt: serverTimestamp()
      });

      academyData.settings = settings;
      showMessage("Academic preferences saved successfully.", "success");
    } catch (error) {
      console.error("Could not save academic preferences:", error);
      showMessage(
        error.code === "permission-denied"
          ? "Permission denied. Check your Firestore academy update rules."
          : "Could not save academic preferences. Try again.",
        "error"
      );
    } finally {
      if (button) button.disabled = false;
    }
  }

  async function saveNotificationPreferences(event) {
    event.preventDefault();

    const settings = {
      ...(academyData.settings || {}),
      notifications: {
        paymentPending: getChecked("notify-payment-pending"),
        paymentApproved: getChecked("notify-payment-approved"),
        paymentRejected: getChecked("notify-payment-rejected"),
        emailNotifications: getChecked("notify-email"),
        browserPush: getChecked("notify-browser-push")
      }
    };

    const button = notificationForm.querySelector('button[type="submit"]');
    if (button) button.disabled = true;

    try {
      await updateDoc(doc(db, "academies", academyId), {
      "settings.notifications": {
        paymentPending: getChecked("notify-payment-pending"),
        paymentApproved: getChecked("notify-payment-approved"),
        paymentRejected: getChecked("notify-payment-rejected"),
        emailNotifications: getChecked("notify-email"),
        browserPush: getChecked("notify-browser-push")
      },
      updatedAt: serverTimestamp()
    });

    academyData.settings = {
      ...(academyData.settings || {}),
      notifications: {
        paymentPending: getChecked("notify-payment-pending"),
        paymentApproved: getChecked("notify-payment-approved"),
        paymentRejected: getChecked("notify-payment-rejected"),
        emailNotifications: getChecked("notify-email"),
        browserPush: getChecked("notify-browser-push")
      }
    };
    } catch (error) {
      console.error("Could not save notification preferences:", error);
      showMessage(
        error.code === "permission-denied"
          ? "Permission denied. Check your Firestore academy update rules."
          : "Could not save notification preferences. Try again.",
        "error"
      );
    } finally {
      if (button) button.disabled = false;
    }
  }

  const yearInput = document.getElementById("academic-year");
  if (yearInput) {
    yearInput.addEventListener("input", () => {
      yearInput.setCustomValidity("");
    });
  }

  if (academyForm) academyForm.addEventListener("submit", saveAcademy);
  if (academicForm) academicForm.addEventListener("submit", saveAcademicPreferences);
  if (notificationForm) {
    notificationForm.addEventListener("submit", saveNotificationPreferences);
  }

  setFormDisabled(academyForm, true);
  setFormDisabled(academicForm, true);
  setFormDisabled(notificationForm, true);

  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      showMessage("Please sign in as an administrator to manage settings.", "error");
      loading = false;
      return;
    }

    try {
      await loadSettings(user);

      setFormDisabled(academyForm, false);
      setFormDisabled(academicForm, false);
      setFormDisabled(notificationForm, false);

      showMessage("Settings loaded from Firebase.", "info");
    } catch (error) {
      console.error("Could not load admin settings:", error);
      showMessage(error.message || "Could not load settings.", "error");
    } finally {
      loading = false;
    }
  });
})();
