
import { auth, db } from "./firebase-config.js";

import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  updateDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

import {
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";

document.addEventListener("DOMContentLoaded", () => {
  const message = document.getElementById("students-message");
  const addButton = document.getElementById("add-student-button");
  const formSection = document.getElementById("student-form-section");
  const form = document.getElementById("student-form");
  const cancelButton = document.getElementById("cancel-student-button");

  if (!message) {
    console.error("Student page is missing #students-message.");
    return;
  }

  let academyId = "";
  let students = [];
  let classes = [];
  let feeRecords = [];
  let updatingStudentId = null;

  injectStudentStyles();
  createStudentList();

  const listSection = document.getElementById("approved-students-section");
  const studentsBody = document.getElementById("approved-students-body");
  const studentsStatus = document.getElementById("approved-students-status");
  const searchInput = document.getElementById("approved-student-search");

  function showMessage(text, type = "info") {
    message.textContent = text;
    message.className = `message ${type}`;
    message.hidden = false;
  }

  function hideMessage() {
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

  function createStudentList() {
    let section = document.getElementById("approved-students-section");

    if (section) return;

    section = document.createElement("section");
    section.id = "approved-students-section";
    section.className = "students-panel";

    section.innerHTML = `
      <div class="students-panel-header">
        <div>
          <span class="students-eyebrow">ACADEMY DIRECTORY</span>
          <h2>Student management</h2>
          <p>View student details, assigned classes, fees, and enrollment status.</p>
        </div>
        <div class="students-total">
          <span id="students-total-count">0</span>
          <small>Students</small>
        </div>
      </div>

      <div class="students-summary" id="students-summary">
        <div class="student-summary-card">
          <span class="student-summary-icon">👥</span>
          <div><small>Total records</small><strong id="students-summary-total">—</strong></div>
        </div>
        <div class="student-summary-card">
          <span class="student-summary-icon">✓</span>
          <div><small>Active</small><strong id="students-summary-active">—</strong></div>
        </div>
        <div class="student-summary-card">
          <span class="student-summary-icon">↗</span>
          <div><small>Left class</small><strong id="students-summary-left">—</strong></div>
        </div>
        <div class="student-summary-card">
          <span class="student-summary-icon">⊘</span>
          <div>
            <small>Terminated</small>
            <strong id="students-summary-terminated">—</strong>
          </div>
        </div>
      </div>

      <div class="students-toolbar">
        <div>
          <h3>Registered students</h3>
          <p>Search students or update their enrollment status.</p>
        </div>
        <input
          type="search"
          id="approved-student-search"
          placeholder="Search name, email, phone, or class..."
          aria-label="Search students"
        >
      </div>

      <p id="approved-students-status" class="students-loading" role="status" aria-live="polite">
        Loading student records...
      </p>

      <div class="students-table-wrap">
        <table class="students-table">
          <thead>
            <tr>
              <th>Student</th>
              <th>Contact</th>
              <th>Assigned class</th>
              <th>Joining date</th>
              <th>Assigned fees</th>
              <th>Status</th>
              <th>Update status</th>
            </tr>
          </thead>
          <tbody id="approved-students-body">
            <tr><td colspan="7">Loading students...</td></tr>
          </tbody>
        </table>
      </div>
    `;

    const content = document.querySelector(".dashboard-content");

    if (content) {
      content.appendChild(section);
    } else {
      message.insertAdjacentElement("afterend", section);
    }
  }

  function getStudentStatus(student) {
    const enrollment = String(
      student.enrollmentStatus || student.studentStatus || ""
    ).toLowerCase();

    if (enrollment === "left" || enrollment === "left_class") return "left";
    if (enrollment === "terminated") return "terminated";

    if (student.isActive === false) {
      return enrollment === "terminated" ? "terminated" : "left";
    }

    return "active";
  }

  function getStudentName(student) {
    return (
      student.fullName ||
      student.name ||
      [student.firstName, student.lastName].filter(Boolean).join(" ") ||
      "Unnamed student"
    );
  }

  function getJoiningDate(student) {
    const value =
      student.joiningDate ||
      student.joinedAt ||
      student.admissionDate ||
      student.createdAt;

    if (!value) return "—";

    let date;

    if (typeof value.toDate === "function") {
      date = value.toDate();
    } else if (typeof value === "string" || typeof value === "number") {
      date = new Date(value);
    } else {
      return "—";
    }

    if (Number.isNaN(date.getTime())) return "—";

    return date.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric"
    });
  }


function getAssignedClass(student) {
  const classNames = new Set();

  // Support existing class-name and class-ID fields.
  if (student.className) classNames.add(student.className);
  if (student.assignedClassName) classNames.add(student.assignedClassName);

  const classIds = new Set();

  if (student.classId) classIds.add(student.classId);
  if (student.assignedClassId) classIds.add(student.assignedClassId);

  if (Array.isArray(student.classIds)) {
    student.classIds.forEach(id => classIds.add(id));
  }

  if (Array.isArray(student.assignedClassIds)) {
    student.assignedClassIds.forEach(id => classIds.add(id));
  }

  // Read the new class-to-student assignments.
  classes.forEach(classItem => {
    if (
      Array.isArray(classItem.studentIds) &&
      classItem.studentIds.includes(student.id)
    ) {
      classNames.add(
        classItem.className || classItem.name || "Unnamed class"
      );
    }
  });

  // Resolve any existing class IDs to class names.
  classIds.forEach(id => {
    const classItem = classes.find(item => item.id === id);

    if (classItem) {
      classNames.add(
        classItem.className || classItem.name || "Unnamed class"
      );
    }
  });

  return classNames.size
    ? [...classNames].join(", ")
    : "Not assigned";
}


  function getAssignedFee(student) {
    const studentFees = feeRecords.filter(fee => fee.studentId === student.id);

    const total = studentFees.reduce((sum, fee) => {
      const amount = Number(
        fee.assignedAmount ?? fee.amount ?? fee.feeAmount ?? 0
      );

      return sum + (Number.isFinite(amount) ? amount : 0);
    }, 0);

    return total;
  }

  function formatCurrency(amount) {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 2
    }).format(amount);
  }

  function statusLabel(status) {
    return {
      active: "Active",
      left: "Left class",
      terminated: "Terminated"
    }[status] || "Active";
  }

  function renderSummary() {
    const active = students.filter(
      student => getStudentStatus(student) === "active"
    ).length;

    const left = students.filter(
      student => getStudentStatus(student) === "left"
    ).length;

    const terminated = students.filter(
    student => getStudentStatus(student) === "terminated"
  ).length;

    const totalFees = students.reduce(
      (sum, student) => sum + getAssignedFee(student),
      0
    );

    document.getElementById("students-total-count").textContent = students.length;
    document.getElementById("students-summary-total").textContent = students.length;
    document.getElementById("students-summary-active").textContent = active;
    document.getElementById("students-summary-left").textContent = left;
    document.getElementById("students-summary-terminated").textContent = terminated;
  }

  function renderStudents() {
    const term = searchInput.value.trim().toLowerCase();

    const filtered = students.filter(student => {
      const searchable = [
        getStudentName(student),
        student.email,
        student.phone,
        getAssignedClass(student),
        statusLabel(getStudentStatus(student))
      ].join(" ").toLowerCase();

      return searchable.includes(term);
    });

    renderSummary();

    if (!filtered.length) {
      studentsBody.innerHTML = `
        <tr>
          <td colspan="7" class="students-empty">
            ${term
              ? "No students match your search."
              : "No student records were found for this academy."}
          </td>
        </tr>
      `;
      return;
    }

    studentsBody.innerHTML = filtered.map(student => {
      const status = getStudentStatus(student);
      const name = getStudentName(student);
      const initials = name
        .split(/\s+/)
        .slice(0, 2)
        .map(part => part.charAt(0))
        .join("")
        .toUpperCase();

      const disabled = updatingStudentId === student.id;

      return `
        <tr>
          <td>
            <div class="student-identity">
              <span class="student-avatar">${escapeHTML(initials || "S")}</span>
              <div class="student-identity-text">
                <strong>${escapeHTML(name)}</strong>
                <span>${escapeHTML(student.email || "No email")}</span>
              </div>
            </div>
          </td>

          <td>${escapeHTML(student.phone || student.contactNumber || "—")}</td>

          <td>
            <span class="student-class-chip">
              ${escapeHTML(getAssignedClass(student))}
            </span>
          </td>

          <td>${escapeHTML(getJoiningDate(student))}</td>

          <td class="student-fee-value">
            ${escapeHTML(formatCurrency(getAssignedFee(student)))}
          </td>

          <td>
            <span class="student-status-badge status-${status}">
              <span class="status-dot"></span>
              ${escapeHTML(statusLabel(status))}
            </span>
          </td>

          <td>
            <div class="student-status-controls">
              <select
                class="student-status-select"
                data-status-select="${escapeHTML(student.id)}"
                aria-label="New status for ${escapeHTML(name)}"
                ${disabled ? "disabled" : ""}
              >
                <option value="active" ${status === "active" ? "selected" : ""}>Active</option>
                <option value="left" ${status === "left" ? "selected" : ""}>Left class</option>
                <option value="terminated" ${status === "terminated" ? "selected" : ""}>Terminated</option>
              </select>
              <button
                type="button"
                class="student-update-button"
                data-update-student="${escapeHTML(student.id)}"
                ${disabled ? "disabled" : ""}
              >
                ${disabled ? "Updating..." : "Update"}
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join("");

    studentsBody.querySelectorAll("[data-update-student]").forEach(button => {
      button.addEventListener("click", () => {
        const studentId = button.dataset.updateStudent;
        const select = studentsBody.querySelector(
          `[data-status-select="${CSS.escape(studentId)}"]`
        );

        if (select) updateStudentStatus(studentId, select.value);
      });
    });
  }

  async function updateStudentStatus(studentId, newStatus) {
    const student = students.find(item => item.id === studentId);
    if (!student || updatingStudentId) return;

    const currentStatus = getStudentStatus(student);

    if (!["active", "left", "terminated"].includes(newStatus)) return;

    if (newStatus === currentStatus) {
      showMessage("The student already has this status.", "info");
      return;
    }

    const actionText = {
      active: "reactivate this student's account",
      left: "mark this student as having left the class and disable account access",
      terminated: "terminate this student's enrollment and disable account access"
    }[newStatus];

    const confirmed = window.confirm(
      `Are you sure you want to ${actionText}?\n\n` +
      "This will not delete the student's attendance, fee, or payment records."
    );

    if (!confirmed) {
      renderStudents();
      return;
    }

    updatingStudentId = studentId;
    hideMessage();
    renderStudents();

    try {
      await updateDoc(doc(db, "users", studentId), {
        enrollmentStatus: newStatus,
        isActive: newStatus === "active",
        statusUpdatedAt: serverTimestamp(),
        statusUpdatedBy: auth.currentUser.uid
      });

      student.enrollmentStatus = newStatus;
      student.isActive = newStatus === "active";

      showMessage(
        `${getStudentName(student)} status updated to "${statusLabel(newStatus)}".`,
        "success"
      );
    } catch (error) {
      console.error("Failed to update student status:", error);

      showMessage(
        error.code === "permission-denied"
          ? "Firestore denied this update. Check the users collection security rules."
          : (error.message || "Could not update the student's status."),
        "error"
      );
    } finally {
      updatingStudentId = null;
      renderStudents();
    }
  }

  async function loadStudents() {
    studentsStatus.textContent = "Loading student records...";

    studentsBody.innerHTML =
      '<tr><td colspan="7">Loading student records...</td></tr>';

    const [studentSnapshot, classSnapshot, feeSnapshot] = await Promise.all([
      getDocs(query(
        collection(db, "users"),
        where("academyId", "==", academyId),
        where("role", "==", "student")
      )),
      getDocs(query(
        collection(db, "classes"),
        where("academyId", "==", academyId)
      )),
      getDocs(query(
        collection(db, "fees"),
        where("academyId", "==", academyId)
      ))
    ]);

    students = studentSnapshot.docs.map(item => ({
      id: item.id,
      ...item.data()
    }));

    classes = classSnapshot.docs.map(item => ({
      id: item.id,
      ...item.data()
    }));

    feeRecords = feeSnapshot.docs.map(item => ({
      id: item.id,
      ...item.data()
    }));

    students.sort((a, b) =>
      getStudentName(a).localeCompare(getStudentName(b))
    );

    renderStudents();

    studentsStatus.textContent =
      `${students.length} student record(s) in this academy.`;

    hideMessage();
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
      hideMessage();
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
      const profileSnapshot = await getDoc(doc(db, "users", user.uid));

      if (!profileSnapshot.exists()) {
        await signOut(auth);
        window.location.href = "../login.html";
        return;
      }

      const profile = profileSnapshot.data();

      if (
        profile.role !== "admin" ||
        profile.isActive !== true ||
        !profile.academyId
      ) {
        showMessage(
          "An active administrator profile with an academy assignment is required.",
          "error"
        );
        return;
      }

      academyId = profile.academyId;
      await loadStudents();
    } catch (error) {
      console.error("Could not load student records:", error);

      studentsStatus.textContent = "Student records could not be loaded.";
      studentsBody.innerHTML = `
        <tr>
          <td colspan="7">
            Unable to load students. Check Firestore permissions and academy IDs.
          </td>
        </tr>
      `;

      showMessage(
        error.code === "permission-denied"
          ? "Firestore denied access. Check the users, classes, and fees collection rules."
          : (error.message || "Could not load student records."),
        "error"
      );
    }
  });

  function injectStudentStyles() {
    if (document.getElementById("student-management-styles")) return;

    const style = document.createElement("style");
    style.id = "student-management-styles";

    style.textContent = `
      .students-panel {
        margin-top: 24px;
        padding: 26px;
        background: #fff;
        border: 1px solid #e7eaf2;
        border-radius: 20px;
        box-shadow: 0 8px 30px rgba(26, 39, 75, .055);
        color: #19233b;
      }
      .students-panel-header, .students-toolbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 20px;
      }
      .students-panel-header { margin-bottom: 24px; }
      .students-eyebrow {
        display: inline-block;
        margin-bottom: 8px;
        color: #6254e8;
        font-size: 11px;
        font-weight: 800;
        letter-spacing: 1.4px;
      }
      .students-panel-header h2 {
        margin: 0 0 7px;
        font-size: clamp(22px, 3vw, 29px);
        letter-spacing: -.7px;
      }
      .students-panel-header p, .students-toolbar p {
        margin: 0;
        color: #788198;
        font-size: 13px;
        line-height: 1.6;
      }
      .students-total {
        min-width: 86px;
        padding: 13px 18px;
        text-align: center;
        border-radius: 15px;
        background: #f1f0ff;
        color: #5144d9;
      }
      .students-total span, .students-total small { display: block; }
      .students-total span { font-size: 25px; font-weight: 800; }
      .students-total small { font-size: 11px; font-weight: 700; }
      .students-summary {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 13px;
        margin-bottom: 28px;
      }
      .student-summary-card {
        display: flex;
        align-items: center;
        gap: 12px;
        min-width: 0;
        padding: 16px;
        border: 1px solid #edf0f6;
        border-radius: 15px;
        background: #fcfcff;
      }
      .student-summary-icon {
        display: grid;
        place-items: center;
        flex-shrink: 0;
        width: 39px;
        height: 39px;
        border-radius: 12px;
        background: #efefff;
        color: #5b4ee8;
        font-weight: 800;
      }
      .student-summary-card small, .student-summary-card strong { display: block; }
      .student-summary-card small {
        margin-bottom: 5px;
        color: #7d869a;
        font-size: 11px;
      }
      .student-summary-card strong {
        overflow-wrap: anywhere;
        font-size: 17px;
        font-weight: 800;
      }
      .students-toolbar {
        align-items: end;
        margin-bottom: 18px;
      }
      .students-toolbar h3 { margin: 0 0 5px; font-size: 18px; }
      .students-toolbar input {
        width: min(100%, 340px);
        min-height: 43px;
        padding: 10px 13px;
        border: 1px solid #dfe4ef;
        border-radius: 11px;
        outline: none;
        background: #fff;
        color: #19233b;
      }
      .students-toolbar input:focus {
        border-color: #7064ed;
        box-shadow: 0 0 0 3px rgba(98, 84, 232, .12);
      }
      .students-loading {
        margin: 12px 0;
        color: #707a91;
        font-size: 13px;
      }
      .students-table-wrap {
        width: 100%;
        overflow-x: auto;
        border: 1px solid #e9edf5;
        border-radius: 14px;
      }
      .students-table {
        width: 100%;
        min-width: 1000px;
        border-collapse: separate;
        border-spacing: 0;
        text-align: left;
      }
      .students-table th {
        padding: 14px 15px;
        background: #f7f8fc;
        color: #707a91;
        font-size: 10px;
        font-weight: 800;
        letter-spacing: .65px;
        text-transform: uppercase;
        white-space: nowrap;
        border-bottom: 1px solid #e9edf5;
      }
      .students-table td {
        padding: 15px;
        border-bottom: 1px solid #eff1f6;
        color: #414c63;
        font-size: 12px;
        vertical-align: middle;
      }
      .students-table tbody tr:last-child td { border-bottom: 0; }
      .students-table tbody tr:hover { background: #fbfbff; }
      .student-identity {
        display: flex;
        align-items: center;
        gap: 11px;
        min-width: 190px;
      }
      .student-avatar {
        display: grid;
        place-items: center;
        flex-shrink: 0;
        width: 39px;
        height: 39px;
        border-radius: 13px;
        background: linear-gradient(135deg, #6254e8, #9389ff);
        color: white;
        font-size: 12px;
        font-weight: 800;
      }
      .student-identity-text { min-width: 0; }
      .student-identity-text strong, .student-identity-text span {
        display: block;
        max-width: 205px;
        overflow-wrap: anywhere;
      }
      .student-identity-text strong {
        margin-bottom: 4px;
        color: #202b43;
        font-size: 12px;
      }
      .student-identity-text span {
        color: #8790a3;
        font-size: 11px;
      }
      .student-class-chip {
        display: inline-block;
        max-width: 170px;
        padding: 6px 9px;
        border: 1px solid #e5e4ff;
        border-radius: 8px;
        background: #f5f4ff;
        color: #5144c9;
        line-height: 1.5;
        overflow-wrap: anywhere;
      }
      .student-fee-value { color: #202b43 !important; font-weight: 800; white-space: nowrap; }
      .student-status-badge {
        display: inline-flex;
        align-items: center;
        gap: 7px;
        padding: 7px 10px;
        border-radius: 30px;
        font-size: 11px;
        font-weight: 800;
        white-space: nowrap;
      }
      .status-dot { width: 7px; height: 7px; border-radius: 50%; }
      .status-active { background: #e9f9f0; color: #16834b; }
      .status-active .status-dot { background: #20a45e; }
      .status-left { background: #fff4df; color: #986000; }
      .status-left .status-dot { background: #e9a323; }
      .status-terminated { background: #fff0f0; color: #c03939; }
      .status-terminated .status-dot { background: #d84b4b; }
      .student-status-controls { display: flex; align-items: center; gap: 7px; }
      .student-status-select {
        max-width: 112px;
        min-height: 35px;
        padding: 6px;
        border: 1px solid #dfe4ef;
        border-radius: 8px;
        background: white;
        color: #424d64;
        font-size: 11px;
      }
      .student-update-button {
        min-height: 35px;
        padding: 7px 11px;
        border: 0;
        border-radius: 8px;
        background: #5c50e6;
        color: white;
        font-size: 11px;
        font-weight: 800;
        cursor: pointer;
        transition: background .15s ease, transform .15s ease;
      }
      .student-update-button:hover { background: #483bd0; transform: translateY(-1px); }
      .student-update-button:disabled { opacity: .6; cursor: wait; transform: none; }
      .students-empty { padding: 36px !important; text-align: center; color: #7d869a !important; }
      @media (max-width: 850px) {
        .students-panel { padding: 17px; }
        .students-summary { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .students-panel-header { align-items: flex-start; }
        .students-toolbar { align-items: stretch; flex-direction: column; }
        .students-toolbar input { width: 100%; box-sizing: border-box; }
      }
      @media (max-width: 420px) {
        .students-summary { grid-template-columns: 1fr; }
        .students-total { min-width: 64px; padding: 10px; }
      }
    `;

    document.head.appendChild(style);
  }
});
