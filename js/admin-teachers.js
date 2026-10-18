
import { auth, db } from "./firebase-config.js";

import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";

document.addEventListener("DOMContentLoaded", () => {
  const addButton = document.getElementById("add-teacher-button");
  const formSection = document.getElementById("teacher-form-section");
  const form = document.getElementById("teacher-form");
  const cancelButton = document.getElementById("cancel-teacher-button");
  const message = document.getElementById("teachers-message");
  const searchInput = document.getElementById("teacher-search");
  const tableBody = document.getElementById("teachers-table-body");

  if (!tableBody || !message) {
    console.error("Teachers page is missing required elements.");
    return;
  }

  let teachers = [];

  function showMessage(text, type = "info") {
    message.textContent = text;
    message.className = `message ${type}`;
    message.hidden = false;
  }

  function hideMessage() {
    message.textContent = "";
    message.hidden = true;
  }

  function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[character]);
  }

  function renderTeachers() {
    const term = (searchInput?.value || "").trim().toLowerCase();

    const filtered = teachers.filter(teacher => {
      const searchableText = [
        teacher.fullName,
        teacher.name,
        teacher.displayName,
        teacher.email,
        teacher.phone,
        teacher.subject,
        teacher.specialization
      ].join(" ").toLowerCase();

      return searchableText.includes(term);
    });

    if (filtered.length === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="5">
            <div class="empty-state">
              <h3>${term ? "No matching teachers" : "No active teachers found"}</h3>
              <p>${term
                ? "Try another name, email, phone number, or subject."
                : "No active teacher accounts were found for this academy."}</p>
            </div>
          </td>
        </tr>
      `;
      return;
    }

    tableBody.innerHTML = filtered.map(teacher => `
      <tr>
        <td>${escapeHTML(
          teacher.fullName || teacher.name || teacher.displayName || "—"
        )}</td>
        <td>${escapeHTML(teacher.email || "—")}</td>
        <td>${escapeHTML(teacher.phone || "—")}</td>
        <td>${escapeHTML(
          teacher.subject || teacher.specialization || "—"
        )}</td>
        <td>${escapeHTML(teacher.registrationStatus || "approved")}</td>
      </tr>
    `).join("");
  }

  async function loadTeachers(academyId) {
    tableBody.innerHTML = `
      <tr><td colspan="5">Loading teacher records...</td></tr>
    `;

    const teachersQuery = query(
      collection(db, "users"),
      where("academyId", "==", academyId),
      where("role", "==", "teacher"),
      where("isActive", "==", true)
    );

    const snapshot = await getDocs(teachersQuery);

    teachers = snapshot.docs.map(teacherDoc => ({
      id: teacherDoc.id,
      ...teacherDoc.data()
    }));

    renderTeachers();

    hideMessage();

    console.info(`Loaded ${teachers.length} active teacher account(s).`);
  }

  if (searchInput) {
    searchInput.disabled = false;
    searchInput.addEventListener("input", renderTeachers);
  }

  if (addButton && formSection) {
    addButton.addEventListener("click", () => {
      hideMessage();
      formSection.hidden = false;
      addButton.disabled = true;
      document.getElementById("teacher-name")?.focus();

      formSection.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    });
  }

  function closeForm() {
    form?.reset();

    if (formSection) formSection.hidden = true;
    if (addButton) addButton.disabled = false;

    hideMessage();
  }

  cancelButton?.addEventListener("click", closeForm);

  form?.addEventListener("submit", event => {
    event.preventDefault();
    hideMessage();

    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    showMessage(
      "The form is ready, but no teacher account was created. " +
      "Secure teacher account creation must be connected before saving.",
      "info"
    );
  });

  onAuthStateChanged(auth, async user => {
    if (!user) {
      window.location.href = "../login.html";
      return;
    }

    try {
      const profileSnapshot = await getDoc(doc(db, "users", user.uid));

      if (!profileSnapshot.exists()) {
        showMessage("Your user profile could not be found.", "error");
        return;
      }

      const profile = profileSnapshot.data();

      if (
        profile.role !== "admin" ||
        profile.isActive !== true ||
        !profile.academyId
      ) {
        showMessage(
          "An active administrator account with an academy assignment is required.",
          "error"
        );
        return;
      }

      await loadTeachers(profile.academyId);
    } catch (error) {
      console.error("Could not load teacher records:", error);

      tableBody.innerHTML = `
        <tr>
          <td colspan="5">
            Teacher records could not be loaded.
          </td>
        </tr>
      `;

      showMessage(
        error.code === "permission-denied"
          ? "Firestore denied access to teacher records. Check the users collection rules."
          : "Could not load teacher records. See the browser console for details.",
        "error"
      );
    }
  });
});
