
import { auth, db } from "./firebase-config.js";

import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  writeBatch,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("attendance-filter-form");
  const classSelect = document.getElementById("attendance-class");
  const dateInput = document.getElementById("attendance-date");
  const tableBody = document.getElementById("attendance-table-body");
  const saveButton = document.getElementById("save-attendance-button");
  const message = document.getElementById("attendance-message");

  if (!form || !classSelect || !dateInput || !tableBody || !saveButton || !message) {
    console.error("Attendance page is missing required HTML elements.");
    return;
  }

  let adminProfile = null;
  let activeClass = null;
  let students = [];
  let attendanceByStudent = new Map();
  let loadedSessionKey = null;

  function localDateString(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
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

  function showMessage(text, type = "info") {
    message.textContent = text;
    message.className = `message ${type}`;
    message.hidden = false;
  }

  function hideMessage() {
    message.textContent = "";
    message.hidden = true;
  }

  function renderEmptyState(title, description = "") {
    tableBody.innerHTML = `
      <tr>
        <td colspan="2">
          <div class="empty-state">
            <h3>${escapeHTML(title)}</h3>
            <p>${escapeHTML(description)}</p>
          </div>
        </td>
      </tr>
    `;
  }

  function setLoading(isLoading) {
    saveButton.disabled = isLoading || students.length === 0;
    classSelect.disabled = isLoading;
    dateInput.disabled = isLoading;

    const submitButton = form.querySelector('button[type="submit"]');
    if (submitButton) {
      submitButton.disabled = isLoading;
    }
  }

  function getStudentName(profile) {
    return profile.fullName ||
      profile.name ||
      profile.displayName ||
      profile.email ||
      "Unnamed student";
  }

  function getSessionKey(classId, date) {
    return `${classId}__${date}`;
  }

  async function loadClasses(academyId) {
    classSelect.innerHTML = '<option value="">Loading classes...</option>';

    const classesQuery = query(
      collection(db, "classes"),
      where("academyId", "==", academyId)
    );

    const snapshot = await getDocs(classesQuery);

    const activeClasses = snapshot.docs
      .map(classDoc => ({
        id: classDoc.id,
        ...classDoc.data()
      }))
      .filter(item => item.status === "active")
      .sort((a, b) =>
        String(a.className || "").localeCompare(String(b.className || ""))
      );

    classSelect.innerHTML = '<option value="">Select a class</option>';

    activeClasses.forEach(item => {
      const option = document.createElement("option");
      option.value = item.id;
      option.textContent = `${item.className || "Unnamed class"}${item.subject ? ` — ${item.subject}` : ""}`;
      classSelect.appendChild(option);
    });

    if (activeClasses.length === 0) {
      showMessage("No active classes were found for your academy.", "info");
    }

    return activeClasses;
  }

  async function loadStudents(academyId) {
    const studentsQuery = query(
      collection(db, "users"),
      where("academyId", "==", academyId),
      where("role", "==", "student"),
      where("isActive", "==", true)
    );

    const snapshot = await getDocs(studentsQuery);

    return snapshot.docs
      .map(studentDoc => ({
        id: studentDoc.id,
        ...studentDoc.data()
      }))
      .sort((a, b) =>
        getStudentName(a).localeCompare(getStudentName(b))
      );
  }

  async function loadExistingAttendance(classId, date, academyId) {
    const attendanceQuery = query(
      collection(db, "attendance"),
      where("academyId", "==", academyId),
      where("classId", "==", classId),
      where("date", "==", date)
    );

    const snapshot = await getDocs(attendanceQuery);
    const records = new Map();

    snapshot.docs.forEach(attendanceDoc => {
      const record = attendanceDoc.data();
      if (record.studentId) {
        records.set(record.studentId, record.status || "unmarked");
      }
    });

    return records;
  }

  function renderStudents() {
    if (students.length === 0) {
      renderEmptyState(
        "No active students found",
        "Active student accounts in this academy will appear here."
      );
      saveButton.disabled = true;
      return;
    }

    tableBody.innerHTML = students.map(student => {
      const status = attendanceByStudent.get(student.id) || "unmarked";

      return `
        <tr data-student-row="${escapeHTML(student.id)}">
          <td>
            <strong>${escapeHTML(getStudentName(student))}</strong>
            ${student.email
              ? `<div class="form-help">${escapeHTML(student.email)}</div>`
              : ""}
          </td>

          <td>
            <select
              class="attendance-status-select"
              data-student-id="${escapeHTML(student.id)}"
              aria-label="Attendance status for ${escapeHTML(getStudentName(student))}"
            >
              <option value="unmarked" ${status === "unmarked" ? "selected" : ""}>Unmarked</option>
              <option value="present" ${status === "present" ? "selected" : ""}>Present</option>
              <option value="absent" ${status === "absent" ? "selected" : ""}>Absent</option>
              <option value="late" ${status === "late" ? "selected" : ""}>Late</option>
              <option value="excused" ${status === "excused" ? "selected" : ""}>Excused</option>
            </select>
          </td>
        </tr>
      `;
    }).join("");

    saveButton.disabled = false;
  }

  async function loadAttendanceSession() {
    hideMessage();

    const classId = classSelect.value;
    const date = dateInput.value;

    if (!classId || !date) {
      showMessage("Select a class and date before loading students.", "error");
      return;
    }

    if (!adminProfile?.academyId) {
      showMessage("Your academy admin profile is not ready.", "error");
      return;
    }

    const sessionKey = getSessionKey(classId, date);

    setLoading(true);
    students = [];
    attendanceByStudent = new Map();
    loadedSessionKey = null;

    renderEmptyState("Loading students...", "Please wait while records are retrieved.");
    hideMessage();

    try {
      const classSnapshot = await getDoc(doc(db, "classes", classId));

      if (!classSnapshot.exists()) {
        throw new Error("The selected class could not be found.");
      }

      activeClass = {
        id: classSnapshot.id,
        ...classSnapshot.data()
      };

      if (
        activeClass.academyId !== adminProfile.academyId ||
        activeClass.status !== "active"
      ) {
        throw new Error("The selected class is not active in your academy.");
      }

      students = await loadStudents(adminProfile.academyId);

      attendanceByStudent = await loadExistingAttendance(
        classId,
        date,
        adminProfile.academyId
      );

      loadedSessionKey = sessionKey;
      renderStudents();

      showMessage(
        `Loaded ${students.length} active student(s) for ${activeClass.className} on ${date}.`,
        "success"
      );
    } catch (error) {
      console.error("Failed to load attendance session:", error);

      renderEmptyState(
        "Could not load attendance",
        "Check your Firestore permissions and connection, then try again."
      );

      showMessage(
        error.code === "permission-denied"
          ? "Firestore denied access. Check the classes, users, and attendance rules."
          : (error.message || "Could not load attendance data."),
        "error"
      );
    } finally {
      setLoading(false);
    }
  }

  form.addEventListener("submit", async event => {
    event.preventDefault();

    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    await loadAttendanceSession();
  });

  classSelect.addEventListener("change", () => {
    loadedSessionKey = null;
    students = [];
    attendanceByStudent = new Map();
    renderEmptyState(
      "Select Load students",
      "Choose the attendance date, then load the selected class."
    );
    saveButton.disabled = true;
    hideMessage();
  });

  dateInput.addEventListener("change", () => {
    loadedSessionKey = null;
    students = [];
    attendanceByStudent = new Map();
    renderEmptyState(
      "Select Load students",
      "Load the selected class and date to view attendance."
    );
    saveButton.disabled = true;
    hideMessage();
  });

  saveButton.addEventListener("click", async () => {
    hideMessage();

    const classId = classSelect.value;
    const date = dateInput.value;
    const sessionKey = getSessionKey(classId, date);

    if (!classId || !date || loadedSessionKey !== sessionKey) {
      showMessage("Load the class and date before saving attendance.", "error");
      return;
    }

    if (!students.length) {
      showMessage("There are no students to save for this session.", "error");
      return;
    }

    const selects = [
      ...tableBody.querySelectorAll(".attendance-status-select")
    ];

    const selectedStatuses = new Map(
      selects.map(select => [select.dataset.studentId, select.value])
    );

    if (selectedStatuses.size !== students.length) {
      showMessage("Some student statuses are missing. Reload the session and try again.", "error");
      return;
    }

    if ([...selectedStatuses.values()].some(status => status === "unmarked")) {
      showMessage("Mark every student before saving. No student can remain Unmarked.", "error");
      return;
    }

    saveButton.disabled = true;
    classSelect.disabled = true;
    dateInput.disabled = true;

    try {
      // Firestore batches support up to 500 writes.
      // Split large classes into safe batches.
      const chunks = [];

      for (let index = 0; index < students.length; index += 400) {
        chunks.push(students.slice(index, index + 400));
      }

      for (const chunk of chunks) {
        const batch = writeBatch(db);

        chunk.forEach(student => {
          const status = selectedStatuses.get(student.id);
          const recordId = `${classId}_${date}_${student.id}`;
          const recordRef = doc(db, "attendance", recordId);

          batch.set(recordRef, {
            academyId: adminProfile.academyId,
            classId,
            className: activeClass.className || "",
            subject: activeClass.subject || "",
            teacherId: activeClass.teacherId || "",
            teacherName: activeClass.teacherName || "",
            date,
            studentId: student.id,
            studentName: getStudentName(student),
            status,
            markedBy: auth.currentUser.uid,
            updatedAt: serverTimestamp()
          }, { merge: true });
        });

        await batch.commit();
      }

      attendanceByStudent = selectedStatuses;

      showMessage(
        `Attendance saved successfully for ${students.length} student(s).`,
        "success"
      );
    } catch (error) {
      console.error("Failed to save attendance:", error);

      showMessage(
        error.code === "permission-denied"
          ? "Firestore denied the save. Add the academy-scoped attendance rules before saving."
          : (error.message || "Could not save attendance."),
        "error"
      );
    } finally {
      saveButton.disabled = students.length === 0;
      classSelect.disabled = false;
      dateInput.disabled = false;
    }
  });

  // Default to the current local date.
  if (!dateInput.value) {
    dateInput.value = localDateString();
  }

  saveButton.disabled = true;

  onAuthStateChanged(auth, async user => {
    if (!user) {
      window.location.href = "../login.html";
      return;
    }

    setLoading(true);

    try {
      const profileSnapshot = await getDoc(doc(db, "users", user.uid));

      if (!profileSnapshot.exists()) {
        throw new Error("Your user profile could not be found.");
      }

      const profile = profileSnapshot.data();

      if (
        profile.role !== "admin" ||
        profile.isActive !== true ||
        !profile.academyId
      ) {
        throw new Error("An active academy admin account is required.");
      }

      adminProfile = profile;

      await loadClasses(profile.academyId);

      renderEmptyState(
        "Select a class and date",
        "Then click Load students to mark attendance."
      );

      hideMessage();
    } catch (error) {
      console.error("Attendance page initialization failed:", error);

      classSelect.innerHTML = '<option value="">Unable to load classes</option>';

      renderEmptyState(
        "Attendance could not be initialized",
        "Check your admin profile and Firestore access."
      );

      showMessage(
        error.code === "permission-denied"
          ? "Firestore denied access. Check your users and classes rules."
          : (error.message || "Could not initialize the attendance page."),
        "error"
      );
    } finally {
      setLoading(false);
    }
  });
});
