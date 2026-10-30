
import { auth, db } from "./firebase-config.js";

import {
  onAuthStateChanged,
  updateProfile
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";

import {
  doc,
  getDoc,
  updateDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);

  const adminForm = $("admin-profile-form");
  const academyForm = $("academy-settings-form");
  const paymentForm = $("payment-settings-form");
  const message = $("settings-message");

  let currentUser = null;
  let academyId = "";
  let adminProfile = {};

  function showMessage(text, type = "info") {
    message.textContent = text;
    message.hidden = false;
    message.className = `form-message ${type}`;
    message.setAttribute(
      "role",
      type === "error" ? "alert" : "status"
    );
  }

  function getValue(id) {
    return $(id).value.trim();
  }

  function setValue(id, value) {
    $(id).value = value == null ? "" : String(value);
  }

  function setFormsDisabled(disabled) {
    [adminForm, academyForm, paymentForm].forEach((form) => {
      form.querySelectorAll("input, button, select, textarea")
        .forEach((element) => {
          element.disabled = disabled;
        });
    });
  }

  function validPhone(phone) {
    return !phone || /^[+\d\s().-]{7,20}$/.test(phone);
  }

  async function loadSettings(user) {
    const userSnapshot = await getDoc(doc(db, "users", user.uid));

    if (!userSnapshot.exists()) {
      throw new Error("Admin profile was not found.");
    }

    adminProfile = userSnapshot.data();

    if (
      adminProfile.role !== "admin" ||
      adminProfile.isActive !== true
    ) {
      throw new Error("An active administrator account is required.");
    }

    if (!adminProfile.academyId) {
      throw new Error("This admin account is not linked to an academy.");
    }

    academyId = adminProfile.academyId;

    const academySnapshot = await getDoc(
      doc(db, "academies", academyId)
    );

    if (!academySnapshot.exists()) {
      throw new Error("Academy profile was not found.");
    }

    const academy = academySnapshot.data();

    // Admin profile: use the existing user document fields.
    setValue("admin-full-name", adminProfile.fullName || "");
    setValue(
      "admin-email",
      currentUser.email || adminProfile.email || ""
    );
    setValue("admin-phone", adminProfile.phone || "");

    // Academy profile: use the existing academy document fields.
    setValue("academy-name", academy.name || "");
    setValue("academy-email", academy.email || "");
    setValue("academy-phone", academy.phone || "");
    setValue("academy-address", academy.address || "");

    // Payment information: use academy.settings.payment.
    const payment = academy.settings?.payment || {};
    setValue("upi-id", payment.upiId || "");
    setValue("upi-payee-name", payment.payeeName || "");
  }

  async function runSave(form, task) {
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;

    try {
      await task();
    } catch (error) {
      console.error("Settings save failed:", error);

      if (error.code === "permission-denied") {
        showMessage(
          "Firestore denied the update. Check the relevant Firestore rules.",
          "error"
        );
      } else {
        showMessage(
          error.message || "Could not save settings. Please try again.",
          "error"
        );
      }
    } finally {
      button.disabled = false;
    }
  }

  async function saveAdminProfile(event) {
    event.preventDefault();

    if (!adminForm.reportValidity()) return;

    const fullName = getValue("admin-full-name");
    const phone = getValue("admin-phone");

    if (!fullName) {
      showMessage("Full name is required.", "error");
      return;
    }

    if (!validPhone(phone)) {
      showMessage("Enter a valid phone number.", "error");
      return;
    }

    await runSave(adminForm, async () => {
      // This update requires the matching Firestore rule below.
      await updateDoc(doc(db, "users", currentUser.uid), {
        fullName,
        phone,
        updatedAt: serverTimestamp()
      });

      // Keep Firebase Authentication's display name consistent.
      await updateProfile(currentUser, {
        displayName: fullName
      });

      adminProfile = {
        ...adminProfile,
        fullName,
        phone
      };

      showMessage("Admin profile saved.", "success");
    });
  }

  async function saveAcademyProfile(event) {
    event.preventDefault();

    if (!academyForm.reportValidity()) return;

    const name = getValue("academy-name");
    const email = getValue("academy-email");
    const phone = getValue("academy-phone");
    const address = getValue("academy-address");

    if (!name) {
      showMessage("Academy name is required.", "error");
      return;
    }

    if (!validPhone(phone)) {
      showMessage("Enter a valid academy contact number.", "error");
      return;
    }

    await runSave(academyForm, async () => {
      await updateDoc(doc(db, "academies", academyId), {
        name,
        email,
        phone,
        address,
        updatedAt: serverTimestamp()
      });

      showMessage("Academy profile saved.", "success");
    });
  }

  async function savePaymentInformation(event) {
    event.preventDefault();

    if (!paymentForm.reportValidity()) return;

    const upiId = getValue("upi-id");
    const payeeName = getValue("upi-payee-name");

    // Basic format validation only; it cannot verify account ownership.
    if (!/^[A-Za-z0-9._-]{2,256}@[A-Za-z0-9.-]{2,64}$/.test(upiId)) {
      showMessage("Enter a UPI ID in the format name@bank.", "error");
      return;
    }

    if (!payeeName) {
      showMessage("Payee name is required.", "error");
      return;
    }

    await runSave(paymentForm, async () => {
      // Dot-path update changes only settings.payment and preserves
      // other settings stored in the academy document.
      await updateDoc(doc(db, "academies", academyId), {
        "settings.payment": {
          upiId,
          payeeName
        },
        updatedAt: serverTimestamp()
      });

      showMessage("Payment information saved.", "success");
    });
  }

  adminForm.addEventListener("submit", saveAdminProfile);
  academyForm.addEventListener("submit", saveAcademyProfile);
  paymentForm.addEventListener("submit", savePaymentInformation);

  setFormsDisabled(true);

  onAuthStateChanged(auth, async (user) => {
    setFormsDisabled(true);

    if (!user) {
      showMessage(
        "Please sign in as an administrator to manage settings.",
        "error"
      );
      return;
    }

    currentUser = user;

    try {
      await loadSettings(user);
      setFormsDisabled(false);
      showMessage("Settings loaded from Firebase.", "info");
    } catch (error) {
      console.error("Settings page initialization failed:", error);
      showMessage(
        error.message || "Could not load settings.",
        "error"
      );
    }
  });
})();
