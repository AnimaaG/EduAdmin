
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
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";

document.addEventListener("DOMContentLoaded", () => {
  const addButton = document.getElementById("add-student-button");
  const formSection = document.getElementById("student-form-section");
  const form = document.getElementById("student-form");
  const cancelButton = document.getElementById("cancel-student-button");
  const message = document.getElementById("students-message");

  if (!message) {
    console.error("Student page is missing #students-message.");
    return;
  }

  function showMessage(text, type = "info") {
    message.textContent = text;
    message.className = `message ${type}`;
    message.hidden = false;
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

  // Add the approved-student table while preserving the existing page layout.
  let listSection = document.getElementById("approved-students-section");

  if (!listSection) {
    listSection = document.createElement("section");
    listSection.id = "approved-students-section";
    listSection.className = "card";
    listSection.innerHTML = `
      <div class="section-title-row">
        <div>
          <h2>Registered Students</h2>
          <p>Approved student accounts in your academy.</p>
        </div>
      </div>

      <div class="form-group">
        <label for="approved-student-search">Search students</label>
        <input
          type="search"
          id="approved-student-search"
          placeholder="Search by name, email, or phone"
        >
      </div>

      <p id="approved-students-status" role="status" aria-live="polite">
        Waiting for account verification...
      </p>

      <div style="overflow-x:auto">
        <table class="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Phone</th>
              <th>Class</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody id="approved-students-body">
            <tr><td colspan="5">Loading students...</td></tr>
          </tbody>
        </table>
      </div>
    `;

    if (formSection?.parentElement) {
      formSection.parentElement.insertBefore(listSection, formSection);
    } else {
      message.insertAdjacentElement("afterend", listSection);
    }
  }

  const studentsBody = document.getElementById("approved-students-body");
  const studentsStatus = document.getElementById("approved-students-status");
  const searchInput = document.getElementById("approved-student-search");

  let students = [];

  function renderStudents() {
    const term = searchInput.value.trim().toLowerCase();

    const filtered = students.filter(student => {
      const text = [
        student.fullName,
        student.name,
        student.email,
        student.phone,
        student.className
      ].join(" ").toLowerCase();

      return text.includes(term);
    });

    if (filtered.length === 0) {
      studentsBody.innerHTML = `
        <tr>
          <td colspan="5">
            ${term
              ? "No students match your search."
              : "No approved students found for this academy."}
          </td>
        </tr>
      `;
      return;
    }

    studentsBody.innerHTML = filtered.map(student => `
      <tr>
        <td>${escapeHTML(student.fullName || student.name || "—")}</td>
        <td>${escapeHTML(student.email || "—")}</td>
        <td>${escapeHTML(student.phone || "—")}</td>
        <td>${escapeHTML(student.className || "Not assigned")}</td>
        <td>${escapeHTML(student.registrationStatus || "approved")}</td>
      </tr>
    `).join("");
  }

  async function loadStudents(academyId) {
    studentsStatus.textContent = "Loading approved students...";
    studentsBody.innerHTML =
      '<tr><td colspan="5">Loading students...</td></tr>';

    const studentsQuery = query(
      collection(db, "users"),
      where("academyId", "==", academyId),
      where("role", "==", "student"),
      where("isActive", "==", true)
    );

    const snapshot = await getDocs(studentsQuery);

    students = snapshot.docs.map(studentDoc => ({
      id: studentDoc.id,
      ...studentDoc.data()
    }));

    renderStudents();

    studentsStatus.textContent =
      `${students.length} active student account(s) loaded.`;

    message.hidden = true;
  }

  searchInput.addEventListener("input", renderStudents);

  if (addButton && formSection) {
    addButton.addEventListener("click", () => {
      formSection.hidden = false;
      addButton.disabled = true;
      document.getElementById("student-name")?.focus();
    });
  }

  if (cancelButton && formSection && form) {
    cancelButton.addEventListener("click", () => {
      form.reset();
      formSection.hidden = true;
      if (addButton) addButton.disabled = false;
      message.hidden = true;
    });
  }

  if (form) {
    form.addEventListener("submit", event => {
      event.preventDefault();

      showMessage(
        "This form does not create a Firebase login account yet. " +
        "Student account creation must be connected through a secure backend.",
        "info"
      );
    });
  }

  onAuthStateChanged(auth, async user => {
    if (!user) {
      window.location.href = "../login.html";
      return;
    }

    try {
      const profileSnapshot = await getDoc(
        doc(db, "users", user.uid)
      );

      if (!profileSnapshot.exists()) {
        await signOut(auth);
        window.location.href = "../login.html";
        return;
      }

      const adminProfile = profileSnapshot.data();

      if (
        adminProfile.role !== "admin" ||
        adminProfile.isActive !== true ||
        !adminProfile.academyId
      ) {
        showMessage(
          "An active administrator profile with an academy assignment is required.",
          "error"
        );
        return;
      }

      await loadStudents(adminProfile.academyId);
    } catch (error) {
      console.error("Could not load approved students:", error);

      studentsStatus.textContent = "Student records could not be loaded.";
      studentsBody.innerHTML = `
        <tr>
          <td colspan="5">
            Unable to load students. Check Firestore permissions and academy IDs.
          </td>
        </tr>
      `;

      showMessage(
        error.code === "permission-denied"
          ? "Firestore denied access to student records. Check the users collection rules."
          : "Could not load student records. See the browser console for details.",
        "error"
      );
    }
  });
});
