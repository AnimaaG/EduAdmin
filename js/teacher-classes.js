
import { auth, db } from "./firebase-config.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";

import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

const $ = id => document.getElementById(id);

const classesGrid = $("classes-grid");
const messageBox = $("classes-message");

const totalClassesElement = $("total-classes");
const activeClassesElement = $("active-classes");
const totalStudentsElement = $("total-students");

const searchInput = $("class-search");
const statusFilter = $("class-status-filter");

let currentTeacher = null;
let teacherClasses = [];

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[character]);
}

function showMessage(message, type = "error") {
  messageBox.textContent = message;
  messageBox.className = `classes-message ${type}`;
}

function clearMessage() {
  messageBox.textContent = "";
  messageBox.className = "classes-message";
}

function getClassName(classItem) {
  return classItem.className || classItem.name || "Unnamed Class";
}

function getClassStatus(classItem) {
  return String(classItem.status || "active").toLowerCase();
}

function isActiveClass(classItem) {
  return getClassStatus(classItem) === "active";
}

function getClassSessions(classItem) {
  return Array.isArray(classItem.sessions)
    ? classItem.sessions
    : [];
}

function localDateString(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function formatDate(dateString) {
  if (!dateString) return "Date not set";

  const date = new Date(`${dateString}T00:00:00`);

  if (Number.isNaN(date.getTime())) return dateString;

  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
}

function formatTime(value) {
  if (!value) return "Time not set";

  const parts = String(value).split(":");

  if (parts.length < 2) return value;

  let hours = Number(parts[0]);
  const minutes = parts[1];

  if (!Number.isFinite(hours)) return value;

  const suffix = hours >= 12 ? "PM" : "AM";
  hours = hours % 12 || 12;

  return `${hours}:${minutes} ${suffix}`;
}

function getStudentCount(classItem) {
  return Array.isArray(classItem.studentIds)
    ? classItem.studentIds.length
    : 0;
}

function getUpcomingSessions(classItem) {
  const today = localDateString(new Date());

  return getClassSessions(classItem)
    .filter(session =>
      session &&
      session.date &&
      session.date >= today &&
      !["cancelled", "canceled"].includes(
        String(session.status || "").toLowerCase()
      )
    )
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 3);
}

function renderSession(session) {
  return `
    <div class="session-item">
      <span class="session-date">
        ${escapeHTML(formatDate(session.date))}
      </span>

      <span class="session-time">
        ${escapeHTML(formatTime(session.startTime))}
        –
        ${escapeHTML(formatTime(session.endTime))}
      </span>
    </div>
  `;
}

function renderClassCard(classItem) {
  const className = getClassName(classItem);
  const subject = classItem.subject || "Subject not specified";
  const description = classItem.description || "No class description available.";

  const status = getClassStatus(classItem);
  const active = isActiveClass(classItem);

  const sessions = getUpcomingSessions(classItem);
  const studentCount = getStudentCount(classItem);

  const firstLetter = className.trim().charAt(0).toUpperCase() || "C";

  return `
    <article class="class-card">

      <div class="class-card-top">

        <div class="class-card-icon">
          ${escapeHTML(firstLetter)}
        </div>

        <span class="class-status ${active ? "" : "inactive"}">
          ${escapeHTML(status)}
        </span>

      </div>

      <h3>${escapeHTML(className)}</h3>

      <p class="class-subject">
        ${escapeHTML(subject)}
      </p>

      <p class="class-description">
        ${escapeHTML(description)}
      </p>

      <div class="class-info-grid">

        <div class="class-info-item">
          <span>Assigned Students</span>
          <strong>${studentCount}</strong>
        </div>

        <div class="class-info-item">
          <span>Scheduled Sessions</span>
          <strong>${getClassSessions(classItem).length}</strong>
        </div>

        <div class="class-info-item">
          <span>Class Status</span>
          <strong>${active ? "Active" : "Inactive"}</strong>
        </div>

        <div class="class-info-item">
          <span>Created</span>
          <strong>${escapeHTML(
            formatCreatedDate(classItem.createdAt)
          )}</strong>
        </div>

      </div>

      <div class="sessions-heading">
        <strong>Upcoming Sessions</strong>
        <span style="font-size:11px;color:#94a3b8;">
          ${sessions.length} shown
        </span>
      </div>

      <div class="session-list">
        ${
          sessions.length
            ? sessions.map(renderSession).join("")
            : `<div class="no-sessions">No upcoming sessions scheduled.</div>`
        }
      </div>

      <div class="class-card-footer">
        <span class="student-count">
          ${studentCount} assigned student(s)
        </span>

        <span class="class-id">
          ID: ${escapeHTML(classItem.id)}
        </span>
      </div>

    </article>
  `;
}

function formatCreatedDate(value) {
  if (!value) return "—";

  let date = null;

  if (typeof value.toDate === "function") {
    date = value.toDate();
  } else if (value instanceof Date) {
    date = value;
  } else if (typeof value === "string") {
    date = new Date(value);
  }

  if (!date || Number.isNaN(date.getTime())) return "—";

  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
}

function updateSummary() {
  const activeClasses = teacherClasses.filter(isActiveClass);

  totalClassesElement.textContent = teacherClasses.length;
  activeClassesElement.textContent = activeClasses.length;

  totalStudentsElement.textContent = teacherClasses.reduce(
    (total, classItem) => total + getStudentCount(classItem),
    0
  );
}

function renderClasses() {
  const searchTerm = searchInput.value.trim().toLowerCase();
  const selectedStatus = statusFilter.value;

  const filteredClasses = teacherClasses.filter(classItem => {
    const name = getClassName(classItem).toLowerCase();
    const subject = String(classItem.subject || "").toLowerCase();
    const description = String(classItem.description || "").toLowerCase();

    const matchesSearch =
      name.includes(searchTerm) ||
      subject.includes(searchTerm) ||
      description.includes(searchTerm);

    const matchesStatus =
      selectedStatus === "all" ||
      getClassStatus(classItem) === selectedStatus;

    return matchesSearch && matchesStatus;
  });

  if (!filteredClasses.length) {
    classesGrid.innerHTML = `
      <div class="classes-empty">
        <h3>No classes found</h3>
        <p>
          ${
            teacherClasses.length
              ? "Try changing your search or filter."
              : "No classes have been assigned to your account yet."
          }
        </p>
      </div>
    `;

    return;
  }

  classesGrid.innerHTML = filteredClasses
    .map(renderClassCard)
    .join("");
}

async function loadTeacherClasses(user) {
  const profileSnapshot = await getDoc(
    doc(db, "users", user.uid)
  );

  if (!profileSnapshot.exists()) {
    throw new Error("Teacher profile not found.");
  }

  const profile = profileSnapshot.data();

  if (
    profile.role !== "teacher" ||
    profile.isActive !== true ||
    !profile.academyId
  ) {
    throw new Error("Your teacher account is inactive or not configured.");
  }

  currentTeacher = {
    ...profile,
    uid: user.uid
  };

  const classesQuery = query(
    collection(db, "classes"),
    where("academyId", "==", currentTeacher.academyId),
    where("teacherId", "==", currentTeacher.uid)
  );

  const snapshot = await getDocs(classesQuery);

  teacherClasses = snapshot.docs.map(item => ({
    id: item.id,
    ...item.data()
  }));

  updateSummary();
  renderClasses();
}

searchInput.addEventListener("input", renderClasses);
statusFilter.addEventListener("change", renderClasses);

onAuthStateChanged(auth, async user => {
  if (!user) {
    window.location.href = "../../index.html";
    return;
  }

  classesGrid.innerHTML = `
    <div class="classes-empty">
      Loading your assigned classes...
    </div>
  `;

  try {
    await loadTeacherClasses(user);
    clearMessage();

  } catch (error) {
    console.error("Teacher classes loading error:", error);

    classesGrid.innerHTML = `
      <div class="classes-empty">
        <h3>Unable to load classes</h3>
        <p>Please try again or contact your administrator.</p>
      </div>
    `;

    showMessage(
      error.code === "permission-denied"
        ? "Firestore denied access. Check the teacher class read security rule."
        : error.message || "Unable to load your classes."
    );
  }
});
