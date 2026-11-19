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
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";

document.addEventListener("DOMContentLoaded", () => {
  const message = document.getElementById("teachers-message");
  const searchInput = document.getElementById("teacher-search");
  const tableBody = document.getElementById("teachers-table-body");
  const totalCountEl = document.getElementById("teachers-total-count");

  if (!tableBody || !message) {
    console.error("Teachers page is missing required elements.");
    return;
  }

  let academyId = "";
  let teachers = [];
  let classes = [];
  let updatingTeacherId = null;

  injectTeacherStyles();

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

  function getTeacherAssignments(teacherId) {
    const classNames = new Set();
    const subjectNames = new Set();

    classes.forEach(cls => {
      const subjects = Array.isArray(cls.subjects) ? cls.subjects : [];
      subjects.forEach(subj => {
        if (subj.teacherId === teacherId) {
          const cName = cls.className || cls.name;
          if (cName) classNames.add(cName);
          if (subj.subjectName) subjectNames.add(subj.subjectName);
        }
      });
    });

    return {
      classes: classNames.size > 0 ? [...classNames] : [],
      subjects: subjectNames.size > 0 ? [...subjectNames] : []
    };
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

    if (totalCountEl) {
      totalCountEl.textContent = teachers.length;
    }

    if (filtered.length === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="7" class="teachers-empty">
            <h3>${term ? "No matching teachers" : "No teachers found"}</h3>
            <p>${term
              ? "Try another name, email, phone number, or subject."
              : "No teacher accounts were found for this academy."}</p>
          </td>
        </tr>
      `;
      return;
    }

    tableBody.innerHTML = filtered.map(teacher => {
      const name = teacher.fullName || teacher.name || teacher.displayName || "Unnamed teacher";
      const initials = name
        .split(/\s+/)
        .slice(0, 2)
        .map(part => part.charAt(0))
        .join("")
        .toUpperCase();

      const isActive = teacher.isActive !== false;
      const assignments = getTeacherAssignments(teacher.id);

      const classesHtml = assignments.classes.length > 0
        ? assignments.classes.map(c => `<span class="teacher-chip class-chip">${escapeHTML(c)}</span>`).join(" ")
        : '<span style="color:#94a3b8; font-style:italic;">None assigned</span>';

      const subjectsHtml = assignments.subjects.length > 0
        ? assignments.subjects.map(s => `<span class="teacher-chip subject-chip">${escapeHTML(s)}</span>`).join(" ")
        : (teacher.subject || teacher.specialization ? `<span class="teacher-chip subject-chip">${escapeHTML(teacher.subject || teacher.specialization)}</span>` : '<span style="color:#94a3b8; font-style:italic;">None assigned</span>');

      const disabled = updatingTeacherId === teacher.id;

      return `
        <tr>
          <td>
            <div class="teacher-identity">
              <span class="teacher-avatar">${escapeHTML(initials || "T")}</span>
              <div class="teacher-identity-text">
                <strong>${escapeHTML(name)}</strong>
                <span>${escapeHTML(teacher.email || "No email")}</span>
              </div>
            </div>
          </td>
          <td>${escapeHTML(teacher.email || "—")}</td>
          <td>${escapeHTML(teacher.phone || teacher.contactNumber || "—")}</td>
          <td>${classesHtml}</td>
          <td>${subjectsHtml}</td>
          <td>
            <span class="teacher-status-badge status-${isActive ? "active" : "inactive"}">
              <span class="status-dot"></span>
              ${isActive ? "Active" : "Inactive"}
            </span>
          </td>
          <td>
            <button
              type="button"
              class="secondary-button teacher-status-toggle"
              data-teacher-id="${escapeHTML(teacher.id)}"
              data-new-status="${isActive ? "false" : "true"}"
              ${disabled ? "disabled" : ""}
            >
              ${disabled ? "Updating..." : (isActive ? "Mark Inactive" : "Mark Active")}
            </button>
          </td>
        </tr>
      `;
    }).join("");

    tableBody.querySelectorAll(".teacher-status-toggle").forEach(button => {
      button.addEventListener("click", () => {
        const tId = button.dataset.teacherId;
        const targetActive = button.dataset.newStatus === "true";
        updateTeacherStatus(tId, targetActive);
      });
    });
  }

  async function updateTeacherStatus(teacherId, targetActive) {
    if (updatingTeacherId) return;

    const teacher = teachers.find(t => t.id === teacherId);
    if (!teacher) return;

    const actionText = targetActive ? "activate this teacher" : "mark this teacher as inactive (they will be hidden from subject assignment dropdowns)";
    if (!window.confirm(`Are you sure you want to ${actionText}?`)) {
      return;
    }

    updatingTeacherId = teacherId;
    hideMessage();
    renderTeachers();

    try {
      await updateDoc(doc(db, "users", teacherId), {
        isActive: targetActive,
        statusUpdatedAt: serverTimestamp(),
        statusUpdatedBy: auth.currentUser.uid
      });

      teacher.isActive = targetActive;
      showMessage(`Successfully updated status for ${teacher.fullName || teacher.name || "teacher"}.`, "success");
    } catch (error) {
      console.error("Failed to update teacher status:", error);
      showMessage(error.code === "permission-denied" ? "Firestore denied this update. Check security rules." : error.message, "error");
    } finally {
      updatingTeacherId = null;
      renderTeachers();
    }
  }

  async function loadData(currentAcademyId) {
    academyId = currentAcademyId;
    tableBody.innerHTML = `
      <tr><td colspan="7" class="teachers-empty">Loading teacher records...</td></tr>
    `;

    const [teacherSnapshot, classSnapshot] = await Promise.all([
      getDocs(query(
        collection(db, "users"),
        where("academyId", "==", academyId),
        where("role", "==", "teacher")
      )),
      getDocs(query(
        collection(db, "classes"),
        where("academyId", "==", academyId)
      ))
    ]);

    teachers = teacherSnapshot.docs.map(teacherDoc => ({
      id: teacherDoc.id,
      ...teacherDoc.data()
    }));

    classes = classSnapshot.docs.map(classDoc => ({
      id: classDoc.id,
      ...classDoc.data()
    }));

    renderTeachers();
    hideMessage();
  }

  if (searchInput) {
    searchInput.disabled = false;
    searchInput.addEventListener("input", renderTeachers);
  }

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

      await loadData(profile.academyId);
    } catch (error) {
      console.error("Could not load teacher records:", error);

      tableBody.innerHTML = `
        <tr>
          <td colspan="7" class="teachers-empty">
            Teacher records could not be loaded due to permission errors.
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

  function injectTeacherStyles() {
    if (document.getElementById("teacher-management-styles")) return;

    const style = document.createElement("style");
    style.id = "teacher-management-styles";

    style.textContent = `
      .teachers-panel {
        padding: 26px;
        background: #fff;
        border: 1px solid #e7eaf2;
        border-radius: 20px;
        box-shadow: 0 8px 30px rgba(26, 39, 75, .055);
        color: #19233b;
      }
      .teachers-panel-header, .teachers-toolbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 20px;
      }
      .teachers-panel-header { margin-bottom: 24px; }
      .teachers-eyebrow {
        display: inline-block;
        margin-bottom: 8px;
        color: #6254e8;
        font-size: 11px;
        font-weight: 800;
        letter-spacing: 1.4px;
      }
      .teachers-panel-header h2 {
        margin: 0 0 7px;
        font-size: clamp(22px, 3vw, 29px);
        letter-spacing: -.7px;
      }
      .teachers-panel-header p, .teachers-toolbar p {
        margin: 0;
        color: #788198;
        font-size: 13px;
        line-height: 1.6;
      }
      .teachers-total {
        min-width: 86px;
        padding: 13px 18px;
        text-align: center;
        border-radius: 15px;
        background: #f1f0ff;
        color: #5144d9;
      }
      .teachers-total span, .teachers-total small { display: block; }
      .teachers-total span { font-size: 25px; font-weight: 800; }
      .teachers-total small { font-size: 11px; font-weight: 700; }
      .teachers-toolbar {
        align-items: end;
        margin-bottom: 18px;
      }
      .teachers-toolbar h3 { margin: 0 0 5px; font-size: 18px; }
      .teachers-toolbar input {
        width: min(100%, 340px);
        min-height: 43px;
        padding: 10px 13px;
        border: 1px solid #dfe4ef;
        border-radius: 11px;
        outline: none;
        background: #fff;
        color: #19233b;
      }
      .teachers-toolbar input:focus {
        border-color: #7064ed;
        box-shadow: 0 0 0 3px rgba(98, 84, 232, .12);
      }
      .teachers-table-wrap {
        width: 100%;
        overflow-x: auto;
        border: 1px solid #e9edf5;
        border-radius: 14px;
      }
      .teachers-table {
        width: 100%;
        min-width: 1000px;
        border-collapse: collapse;
        text-align: left;
      }
      .teachers-table th,
      .teachers-table td {
        border: 1px solid #e9edf5;
        vertical-align: middle;
        padding: 14px 16px;
      }
      .teachers-table th {
        background: #f7f8fc;
        color: #707a91;
        font-size: 10px;
        font-weight: 800;
        letter-spacing: .65px;
        text-transform: uppercase;
        white-space: nowrap;
      }
      .teachers-table td {
        color: #414c63;
        font-size: 12px;
      }
      .teachers-table tbody tr:hover { background: #fbfbff; }
      .teacher-identity {
        display: flex;
        align-items: center;
        gap: 11px;
        min-width: 190px;
      }
      .teacher-avatar {
        display: grid;
        place-items: center;
        flex-shrink: 0;
        width: 39px;
        height: 39px;
        border-radius: 13px;
        background: linear-gradient(135deg, #4f46e5, #818cf8);
        color: white;
        font-size: 12px;
        font-weight: 800;
      }
      .teacher-identity-text { min-width: 0; }
      .teacher-identity-text strong, .teacher-identity-text span {
        display: block;
        max-width: 205px;
        overflow-wrap: anywhere;
      }
      .teacher-identity-text strong {
        margin-bottom: 4px;
        color: #202b43;
        font-size: 12px;
      }
      .teacher-identity-text span {
        color: #8790a3;
        font-size: 11px;
      }
      .teacher-chip {
        display: inline-block;
        padding: 4px 8px;
        border-radius: 6px;
        line-height: 1.4;
        font-size: 11px;
        white-space: nowrap;
        margin: 2px 2px 2px 0;
      }
      .class-chip {
        border: 1px solid #e0f2fe;
        background: #f0f9ff;
        color: #0369a1;
        font-weight: 600;
      }
      .subject-chip {
        border: 1px solid #e5e4ff;
        background: #f5f4ff;
        color: #5144c9;
      }
      .teacher-status-badge {
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
      .status-inactive { background: #fee2e2; color: #991b1b; }
      .status-inactive .status-dot { background: #dc2626; }
      .teachers-empty { padding: 40px !important; text-align: center; color: #7d869a !important; }
      .teachers-empty h3 { margin: 0 0 6px; color: #202b43; font-size: 16px; }
      .teachers-empty p { margin: 0; color: #7d869a; font-size: 13px; }
      @media (max-width: 850px) {
        .teachers-panel { padding: 17px; }
        .teachers-panel-header { align-items: flex-start; }
        .teachers-toolbar { align-items: stretch; flex-direction: column; }
        .teachers-toolbar input { width: 100%; box-sizing: border-box; }
      }
    `;

    document.head.appendChild(style);
  }
});