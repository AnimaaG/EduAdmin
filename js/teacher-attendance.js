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
  where,
  runTransaction,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

const $ = id => document.getElementById(id);

const calendarGrid = $("attendance-calendar-grid");
const monthLabel = $("calendar-month-label");
const previousButton = $("calendar-previous");
const nextButton = $("calendar-next");

const classesContainer = $("attendance-classes-container");
const messageBox = $("attendance-message");
const summaryElement = $("attendance-summary");
const selectedDateLabel = $("attendance-selected-date-label");
const sessionDetails = $("attendance-session-details");

const chartCanvas = $("attendance-chart");
const chartDateLabel = $("chart-date-label");
const markTodayButton = $("mark-todays-attendance-btn");

const attendanceModal = $("mark-attendance-modal");
const closeModalButton = $("close-attendance-modal");
const cancelModalButton = $("cancel-attendance-modal");
const modalDateSubtitle = $("modal-date-subtitle");
const modalSessionSelect = $("modal-session-select");
const modalSelectAllCheckbox = $("modal-select-all");
const modalMarkPresentButton = $("modal-mark-present-btn");
const modalStudentList = $("modal-student-list");
const saveModalAttendanceButton = $("save-modal-attendance-btn");

let currentTeacher = null;
let teacherClasses = [];
let academyStudents = [];
let todayClassOptions = [];
let lastChartCounts = null;
let resizeObserver = null;

let selectedDate = new Date();
let calendarMonth = new Date(
  selectedDate.getFullYear(),
  selectedDate.getMonth(),
  1
);

const STATUS_OPTIONS = ["present", "absent", "late", "excused"];

function localDateString(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDate(dateString) {
  const date = new Date(`${dateString}T00:00:00`);
  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "long",
    year: "numeric"
  });
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[character]);
}

function toDateObj(value) {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate();
  if (value instanceof Date) return value;
  if (typeof value === "object" && Number.isFinite(value.seconds)) {
    return new Date(value.seconds * 1000);
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatPunchTime(value) {
  const date = toDateObj(value);
  if (!date) return "—";
  return date.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true
  });
}

function capitalize(str) {
  const s = String(str || "");
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : "—";
}

function formatEditHistory(record) {
  if (!record) return "—";
  const edits = Array.isArray(record.editHistory) ? record.editHistory : [];
  if (!edits.length) {
    return `Original: ${escapeHTML(capitalize(record.status || "present"))}`;
  }
  const firstEdit = edits[0];
  const latestEdit = edits[edits.length - 1];
  const origStatus = firstEdit.previousStatus || record.originalStatus || "present";
  const updStatus = latestEdit.newStatus || record.status || "present";
  const updTime = formatPunchTime(latestEdit.editedAt || record.updatedAt);

  return `Original: <strong>${escapeHTML(capitalize(origStatus))}</strong> → Updated: <strong>${escapeHTML(capitalize(updStatus))}</strong> (${escapeHTML(updTime)})`;
}

function showMessage(message, type = "error") {
  messageBox.textContent = message;
  messageBox.className = `attendance-message ${type}`;
}

function clearMessage() {
  messageBox.textContent = "";
  messageBox.className = "attendance-message";
}

function getStudentName(student) {
  return student.fullName
    || student.name
    || [student.firstName, student.lastName].filter(Boolean).join(" ")
    || "Unnamed Student";
}

function getStudentEmail(student) {
  return student.email || student.emailAddress || "—";
}

function isStudentAssigned(student, classItem) {
  const classId = String(classItem.id);
  const className = String(classItem.className || classItem.name || "").trim().toLowerCase();

  const studentClassIds = [
    student.classId,
    student.assignedClassId,
    ...(Array.isArray(student.classIds) ? student.classIds : []),
    ...(Array.isArray(student.assignedClassIds) ? student.assignedClassIds : [])
  ].filter(Boolean).map(String);

  const studentClassName = String(student.className || student.class || "").trim().toLowerCase();
  const classStudentIds = Array.isArray(classItem.studentIds) ? classItem.studentIds.map(String) : [];

  return (
    studentClassIds.includes(classId) ||
    classStudentIds.includes(String(student.id)) ||
    (studentClassName && className && studentClassName === className)
  );
}

function isTeacherAssignedToClass(classItem) {
  if (!currentTeacher) return false;
  if (classItem.teacherId === currentTeacher.uid) return true;
  const subjects = Array.isArray(classItem.subjects) ? classItem.subjects : [];
  return subjects.some(subj => subj.teacherId === currentTeacher.uid);
}

function isClassScheduledOnDate(classItem, dateString) {
  if (
    classItem.status
    && !["active", "scheduled"].includes(String(classItem.status).toLowerCase())
  ) {
    return false;
  }

  const subjects = Array.isArray(classItem.subjects) ? classItem.subjects : [];
  const hasSubjectSession = subjects.some(subj =>
    Array.isArray(subj.sessions) && subj.sessions.some(s => s && s.date === dateString && s.status !== "cancelled")
  );
  if (hasSubjectSession) return true;

  const rootSessions = Array.isArray(classItem.sessions) ? classItem.sessions : [];
  return rootSessions.some(s => s && s.date === dateString && s.status !== "cancelled");
}

function getAssignedStudents(classItem) {
  return academyStudents.filter(student => isStudentAssigned(student, classItem));
}

async function loadTeacherData() {
  const user = auth.currentUser;
  if (!user) throw new Error("Please sign in again.");

  const profileSnapshot = await getDoc(doc(db, "users", user.uid));
  if (!profileSnapshot.exists()) throw new Error("Teacher profile not found.");

  currentTeacher = { ...profileSnapshot.data(), uid: user.uid };
  if (
    currentTeacher.role !== "teacher"
    || currentTeacher.isActive !== true
    || !currentTeacher.academyId
  ) {
    throw new Error("Teacher account is inactive or not configured.");
  }

  const [classSnapshot, studentSnapshot] = await Promise.all([
    getDocs(query(collection(db, "classes"), where("academyId", "==", currentTeacher.academyId))),
    getDocs(query(
      collection(db, "users"),
      where("academyId", "==", currentTeacher.academyId),
      where("role", "==", "student"),
      where("isActive", "==", true)
    ))
  ]);

  teacherClasses = classSnapshot.docs
    .map(snapshot => ({ id: snapshot.id, ...snapshot.data() }))
    .filter(item => isTeacherAssignedToClass(item));

  academyStudents = studentSnapshot.docs.map(snapshot => ({
    id: snapshot.id,
    ...snapshot.data()
  }));

  summaryElement.textContent =
    `${teacherClasses.length} assigned class(es) · ${academyStudents.length} active student(s)`;
}

function renderCalendar() {
  calendarGrid.innerHTML = "";
  const year = calendarMonth.getFullYear();
  const month = calendarMonth.getMonth();

  monthLabel.textContent = calendarMonth.toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric"
  });

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  for (let index = 0; index < firstDay; index++) {
    calendarGrid.appendChild(document.createElement("div"));
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month, day);
    const dateString = localDateString(date);
    const hasClass = teacherClasses.some(cls => isClassScheduledOnDate(cls, dateString));
    const isSelected = dateString === localDateString(selectedDate);

    const button = document.createElement("button");
    button.type = "button";
    button.textContent = day;
    button.className = "calendar-day";
    if (hasClass) button.classList.add("has-class");
    if (isSelected) button.classList.add("selected");

    button.setAttribute(
      "aria-label",
      `${formatDate(dateString)}${hasClass ? ", assigned class scheduled" : ""}`
    );

    button.addEventListener("click", async () => {
      selectedDate = date;
      renderCalendar();
      await loadSelectedDateAttendance();
    });

    calendarGrid.appendChild(button);
  }
}

previousButton.addEventListener("click", () => {
  calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1);
  renderCalendar();
});

nextButton.addEventListener("click", () => {
  calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1);
  renderCalendar();
});

function calculateCounts(classResults) {
  const counts = {
    present: 0,
    absent: 0,
    late: 0,
    excused: 0,
    "not-marked": 0
  };

  classResults.forEach(result => {
    const recordMap = new Map();
    result.attendanceRecords.forEach(rec => recordMap.set(rec.studentId, rec));

    result.students.forEach(student => {
      const status = String(recordMap.get(student.id)?.status || "").toLowerCase();
      if (STATUS_OPTIONS.includes(status)) {
        counts[status]++;
      } else {
        counts["not-marked"]++;
      }
    });
  });

  return counts;
}

function drawAttendanceChart(counts) {
  lastChartCounts = counts;
  const context = chartCanvas.getContext("2d");
  const width = chartCanvas.clientWidth;
  if (!width) return;

  const height = 250;
  const ratio = window.devicePixelRatio || 1;
  chartCanvas.width = Math.round(width * ratio);
  chartCanvas.height = Math.round(height * ratio);

  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, width, height);

  const items = [
    { label: "Present", value: counts.present, color: "#16a34a" },
    { label: "Absent", value: counts.absent, color: "#dc2626" },
    { label: "Late", value: counts.late, color: "#f59e0b" },
    { label: "Excused", value: counts.excused, color: "#6366f1" },
    { label: "Not Marked", value: counts["not-marked"], color: "#94a3b8" }
  ];

  const maxValue = Math.max(1, ...items.map(item => item.value));
  const labelWidth = Math.min(100, Math.max(78, width * 0.22));
  const rightSpace = 32;
  const barWidth = Math.max(20, width - labelWidth - rightSpace - 12);
  const top = 12;
  const rowHeight = 44;
  const barHeight = 20;

  context.font = "12px Arial";
  context.textBaseline = "middle";

  items.forEach((item, index) => {
    const y = top + index * rowHeight;

    context.textAlign = "right";
    context.fillStyle = "#475569";
    context.fillText(item.label, labelWidth - 10, y + barHeight / 2);

    context.fillStyle = "#eef2f7";
    context.fillRect(labelWidth, y, barWidth, barHeight);

    const actualWidth = (item.value / maxValue) * barWidth;
    context.fillStyle = item.color;
    context.fillRect(labelWidth, y, actualWidth, barHeight);

    context.textAlign = "left";
    context.fillStyle = "#1e293b";
    const valueX = Math.min(labelWidth + actualWidth + 7, width - 18);
    context.fillText(String(item.value), valueX, y + barHeight / 2);
  });
}

function renderClassTable(result) {
  const { classItem, students, attendanceRecords } = result;
  const recordMap = new Map();
  attendanceRecords.forEach(rec => recordMap.set(rec.studentId, rec));

  const rows = students.map(student => {
    const rec = recordMap.get(student.id);
    const statusLabel = rec ? capitalize(rec.status || "present") : "Not Marked";
    const punch = rec ? formatPunchTime(rec.punchedAt || rec.createdAt) : "—";
    const markedBy = rec
      ? (rec.markedByRole === "student" ? "Student" : `Teacher (${rec.teacherName || "Teacher"})`)
      : "—";

    return `
      <tr data-student-id="${escapeHTML(student.id)}">
        <td><strong>${escapeHTML(getStudentName(student))}</strong></td>
        <td>${escapeHTML(getStudentEmail(student))}</td>
        <td>${escapeHTML(statusLabel)}</td>
        <td>${escapeHTML(punch)}</td>
        <td>${escapeHTML(markedBy)}</td>
        <td>${formatEditHistory(rec)}</td>
      </tr>
    `;
  });

  return `
    <section class="attendance-class-card">
      <div class="class-heading">
        <div>
          <h3>${escapeHTML(classItem.className || classItem.name || "Class")}</h3>
          <p>Daily class-wise attendance</p>
        </div>
        <span class="class-student-count">${students.length} student(s)</span>
      </div>

      <div class="attendance-table-wrapper">
        <table class="attendance-table">
          <thead>
            <tr>
              <th>Student Name</th>
              <th>Email</th>
              <th>Status</th>
              <th>Punch Time</th>
              <th>Marked By</th>
              <th>Original / Updated History</th>
            </tr>
          </thead>
          <tbody>
            ${
              rows.length
                ? rows.join("")
                : `<tr><td colspan="6" class="empty-state">No students assigned to this class.</td></tr>`
            }
          </tbody>
        </table>
      </div>
    </section>
  `;
}

async function loadSelectedDateAttendance(preserveMessage = false) {
  if (!preserveMessage) {
    clearMessage();
  }
  const dateString = localDateString(selectedDate);

  selectedDateLabel.innerHTML = `<h2>${escapeHTML(formatDate(dateString))}</h2>`;
  chartDateLabel.textContent = `Attendance for ${formatDate(dateString)}`;

  const scheduledClasses = teacherClasses.filter(cls => isClassScheduledOnDate(cls, dateString));

  if (!scheduledClasses.length) {
    classesContainer.innerHTML = `
      <div class="attendance-class-card empty-state">
        <h3>No schedule for the selected date!</h3>
      </div>
    `;
    sessionDetails.innerHTML = "";
    drawAttendanceChart({ present: 0, absent: 0, late: 0, excused: 0, "not-marked": 0 });
    return;
  }

  classesContainer.innerHTML = `<div class="empty-state">Loading attendance...</div>`;

  try {
    const classResults = [];

    for (const classItem of scheduledClasses) {
      const students = getAssignedStudents(classItem);
      const attendanceSnapshot = await getDocs(query(
        collection(db, "attendance"),
        where("academyId", "==", currentTeacher.academyId),
        where("classId", "==", classItem.id),
        where("date", "==", dateString)
      ));

      const attendanceRecords = attendanceSnapshot.docs.map(snap => ({
        id: snap.id,
        ...snap.data()
      }));

      classResults.push({ classItem, students, attendanceRecords });
    }

    const counts = calculateCounts(classResults);
    drawAttendanceChart(counts);
    classesContainer.innerHTML = classResults.map(r => renderClassTable(r)).join("");
  } catch (error) {
    console.error("Attendance loading error:", error);
    showMessage(
      error.code === "permission-denied"
        ? "Firestore permission denied. Check your security rules."
        : "Attendance loading failed: " + error.message,
      "error"
    );
  }
}

function setStudentBadge(studentId, statusText) {
  const badge = modalStudentList.querySelector(
    `.student-row-status[data-student-id="${CSS.escape(studentId)}"]`
  );
  if (!badge) return;
  if (statusText === "Present") {
    badge.textContent = "Present";
    badge.style.color = "#15803d";
    badge.style.fontWeight = "700";
  } else {
    badge.textContent = "Absent";
    badge.style.color = "#dc2626";
    badge.style.fontWeight = "700";
  }
}

async function renderModalStudents(entry) {
  if (!entry || !entry.students.length) {
    modalStudentList.innerHTML = `<div class="empty-state">No students assigned to this class.</div>`;
    modalSelectAllCheckbox.checked = false;
    return;
  }

  const existingMap = new Map();
  try {
    const snap = await getDocs(query(
      collection(db, "attendance"),
      where("academyId", "==", currentTeacher.academyId),
      where("classId", "==", entry.classItem.id),
      where("date", "==", entry.dateString)
    ));
    snap.docs.forEach(d => {
      const data = d.data();
      if (data.studentId) existingMap.set(data.studentId, data);
    });
  } catch (err) {
    console.warn("Could not preload class attendance:", err);
  }

  modalStudentList.innerHTML = entry.students.map(student => {
    const rec = existingMap.get(student.id);
    const isPresent = String(rec?.status || "").toLowerCase() === "present";
    const statusLabel = isPresent ? "Present" : "Absent";
    const alreadyMarked = Boolean(rec);

    return `
      <label class="modal-student-row">
        <span class="modal-student-left">
          <input
            type="checkbox"
            class="modal-student-checkbox"
            value="${escapeHTML(student.id)}"
            data-already-marked="${alreadyMarked ? "true" : "false"}"
            ${isPresent ? "checked" : ""}
          >
          <strong>${escapeHTML(getStudentName(student))}</strong>
        </span>
        <span
          class="student-row-status"
          data-student-id="${escapeHTML(student.id)}"
          style="font-size: 12px; font-weight: 700; color: ${isPresent ? "#15803d" : "#dc2626"};"
        >
          ${escapeHTML(statusLabel)}${alreadyMarked ? " (Marked)" : ""}
        </span>
      </label>
    `;
  }).join("");

  const allCbs = Array.from(modalStudentList.querySelectorAll(".modal-student-checkbox"));
  modalSelectAllCheckbox.checked = allCbs.length > 0 && allCbs.every(cb => cb.checked);
}

modalStudentList?.addEventListener("change", event => {
  const cb = event.target.closest(".modal-student-checkbox");
  if (!cb) return;

  setStudentBadge(cb.value, cb.checked ? "Present" : "Absent");

  const allCbs = Array.from(modalStudentList.querySelectorAll(".modal-student-checkbox"));
  modalSelectAllCheckbox.checked = allCbs.length > 0 && allCbs.every(item => item.checked);
});

function closeAttendanceModal() {
  attendanceModal.hidden = true;
}

markTodayButton?.addEventListener("click", async () => {
  const today = new Date();
  const todayStr = localDateString(today);
  selectedDate = today;
  calendarMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  renderCalendar();
  await loadSelectedDateAttendance();

  todayClassOptions = teacherClasses
    .filter(cls => isClassScheduledOnDate(cls, todayStr))
    .map(cls => ({
      key: cls.id,
      classItem: cls,
      dateString: todayStr,
      students: getAssignedStudents(cls)
    }));

  modalDateSubtitle.textContent = formatDate(todayStr);

  if (!todayClassOptions.length) {
    modalSessionSelect.innerHTML = `<option value="">No assigned class today</option>`;
    modalStudentList.innerHTML = `<div class="empty-state">No assigned classes scheduled for today.</div>`;
    saveModalAttendanceButton.disabled = true;
    attendanceModal.hidden = false;
    return;
  }

  saveModalAttendanceButton.disabled = false;
  modalSessionSelect.innerHTML = todayClassOptions.map(opt => `
    <option value="${escapeHTML(opt.key)}">
      ${escapeHTML(opt.classItem.className || opt.classItem.name || "Class")}
    </option>
  `).join("");

  await renderModalStudents(todayClassOptions[0]);
  attendanceModal.hidden = false;
});

modalSessionSelect?.addEventListener("change", async () => {
  const chosen = todayClassOptions.find(opt => opt.key === modalSessionSelect.value);
  await renderModalStudents(chosen);
});

modalSelectAllCheckbox?.addEventListener("change", () => {
  const checked = modalSelectAllCheckbox.checked;
  modalStudentList.querySelectorAll(".modal-student-checkbox").forEach(cb => {
    cb.checked = checked;
    setStudentBadge(cb.value, checked ? "Present" : "Absent");
  });
});

modalMarkPresentButton?.addEventListener("click", () => {
  const checkboxes = Array.from(modalStudentList.querySelectorAll(".modal-student-checkbox"));
  const checkedBoxes = checkboxes.filter(cb => cb.checked);
  const targets = checkedBoxes.length ? checkedBoxes : checkboxes;

  targets.forEach(cb => {
    cb.checked = true;
    setStudentBadge(cb.value, "Present");
  });
});

closeModalButton?.addEventListener("click", closeAttendanceModal);
cancelModalButton?.addEventListener("click", closeAttendanceModal);

saveModalAttendanceButton?.addEventListener("click", async () => {
  if (!currentTeacher) return;
  const entry = todayClassOptions.find(opt => opt.key === modalSessionSelect.value);
  if (!entry) return;

  const checkboxes = Array.from(modalStudentList.querySelectorAll(".modal-student-checkbox"));
  if (!checkboxes.length) return;

  saveModalAttendanceButton.disabled = true;
  clearMessage();

  try {
    for (const cb of checkboxes) {
      const studentId = cb.value;
      const newStatus = cb.checked ? "present" : "absent";
      const student = academyStudents.find(s => s.id === studentId);
      const docId = `${entry.classItem.id}_${entry.dateString}_${studentId}`;
      const attendanceRef = doc(db, "attendance", docId);

      await runTransaction(db, async transaction => {
        const snap = await transaction.get(attendanceRef);
        const now = new Date().toISOString();

        if (!snap.exists()) {
          transaction.set(attendanceRef, {
            academyId: currentTeacher.academyId,
            classId: entry.classItem.id,
            className: entry.classItem.className || entry.classItem.name || "Class",
            date: entry.dateString,
            studentId,
            studentName: student ? getStudentName(student) : "",
            status: newStatus,
            originalStatus: newStatus,
            teacherId: currentTeacher.uid,
            teacherName: currentTeacher.fullName || currentTeacher.name || "Teacher",
            markedBy: currentTeacher.uid,
            markedByRole: "teacher",
            punchedAt: serverTimestamp(),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            editHistory: []
          });
        } else {
          const prevData = snap.data();
          const prevStatus = prevData.status || "present";
          const history = Array.isArray(prevData.editHistory) ? [...prevData.editHistory] : [];

          if (prevStatus !== newStatus) {
            history.push({
              previousStatus: prevStatus,
              newStatus,
              editedBy: currentTeacher.uid,
              editedByName: currentTeacher.fullName || currentTeacher.name || "Teacher",
              editedAt: now
            });
          }

          transaction.update(attendanceRef, {
            status: newStatus,
            originalStatus: prevData.originalStatus || prevStatus,
            teacherId: currentTeacher.uid,
            teacherName: currentTeacher.fullName || currentTeacher.name || "Teacher",
            updatedAt: serverTimestamp(),
            editHistory: history
          });
        }
      });
    }

    closeAttendanceModal();
    showMessage(`Saved attendance for ${formatDate(entry.dateString)}.`, "success");
    await loadSelectedDateAttendance(true);
  } catch (error) {
    console.error("Saving attendance failed:", error);
    showMessage(
      error.code === "permission-denied"
        ? "Firestore permission denied while saving/updating attendance. Check security rules."
        : "Could not save attendance: " + error.message,
      "error"
    );
  } finally {
    saveModalAttendanceButton.disabled = false;
  }
});

function setupChartResize() {
  if (!("ResizeObserver" in window)) return;
  const chartContainer = document.querySelector(".chart-container");
  if (!chartContainer) return;

  resizeObserver = new ResizeObserver(() => {
    if (lastChartCounts) drawAttendanceChart(lastChartCounts);
  });
  resizeObserver.observe(chartContainer);
}

onAuthStateChanged(auth, async user => {
  if (!user) {
    window.location.href = "../../index.html";
    return;
  }

  try {
    await loadTeacherData();
    renderCalendar();
    await loadSelectedDateAttendance();
    setupChartResize();
  } catch (error) {
    console.error("Teacher attendance initialization error:", error);
    classesContainer.innerHTML = `
      <div class="attendance-class-card empty-state">
        Unable to load teacher attendance.
      </div>
    `;
    showMessage(error.message);
  }
});