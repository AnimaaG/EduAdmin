import { auth, db } from "./firebase-config.js";

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

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";

const $ = id => document.getElementById(id);

const sessionSelect = $("attendance-session-select");
const messageBox = $("attendance-message");
const sessionName = $("attendance-session-name");
const sessionTime = $("attendance-session-time");
const statusText = $("attendance-today-status");
const statusDetail = $("attendance-today-detail");
const punchTimeEl = $("attendance-punch-time");
const markedByEl = $("attendance-marked-by");
const markButton = $("attendance-checkin-button");
const historyBody = $("attendance-history-body");
const historyStartDate = $("history-start-date");
const historyEndDate = $("history-end-date");
const historyRangeBody = $("attendance-history-range-body");
const historyRangeMessage = $("attendance-history-range-message");
const historyRangeLabel = $("attendance-history-range-label");
const viewHistoryButton = $("view-attendance-history-button");
const last10DaysButton = $("last-10-days-button");

let student = null;
let profile = null;
let assignedClasses = [];
let todayRecords = [];
let selectedClass = null;
let busy = false;

function localDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
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
  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}

function formatHistoryDate(value) {
  if (!value) return "—";
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric"
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
    return `Original: ${escapeHTML(capitalize(record.status || "present"))} (${escapeHTML(formatPunchTime(record.punchedAt || record.createdAt))})`;
  }
  const firstEdit = edits[0];
  const latestEdit = edits[edits.length - 1];
  const origStatus = firstEdit.previousStatus || record.originalStatus || "present";
  const origTime = formatPunchTime(firstEdit.editedAt || record.createdAt);
  const updStatus = latestEdit.newStatus || record.status || "present";
  const updTime = formatPunchTime(latestEdit.editedAt || record.updatedAt);

  return `Original: <strong>${escapeHTML(capitalize(origStatus))}</strong> (${escapeHTML(origTime)}) → Updated: <strong>${escapeHTML(capitalize(updStatus))}</strong> (${escapeHTML(updTime)})`;
}

function getMarkedByLabel(record) {
  if (!record) return "—";
  if (record.markedByRole === "teacher" || (record.teacherId && record.markedBy === record.teacherId)) {
    return `Teacher (${record.teacherName || "Teacher"})`;
  }
  return "Self (Student)";
}

function showMessage(message, type = "info") {
  messageBox.textContent = message;
  messageBox.className = `form-message ${type}`;
  messageBox.hidden = false;
}

function hideMessage() {
  messageBox.textContent = "";
  messageBox.hidden = true;
}

function classDocId(classId, dateStr) {
  return `${classId}_${dateStr}_${student.uid}`;
}

function recordForClassDate(classId, dateStr) {
  return todayRecords.find(
    r => r.id === classDocId(classId, dateStr) || (r.classId === classId && r.date === dateStr)
  ) || null;
}

function isStudentAssignedToClass(classData) {
  const studentId = String(student?.uid || "");
  const classId = String(classData?.id || "");
  const className = String(classData?.className || classData?.name || "").trim().toLowerCase();

  const studentClassIds = [
    profile?.classId,
    profile?.assignedClassId,
    ...(Array.isArray(profile?.classIds) ? profile.classIds : []),
    ...(Array.isArray(profile?.assignedClassIds) ? profile.assignedClassIds : [])
  ].filter(Boolean).map(String);

  const studentClassName = String(profile?.className || profile?.class || "").trim().toLowerCase();
  const classStudentIds = Array.isArray(classData?.studentIds) ? classData.studentIds.map(String) : [];

  return (
    classStudentIds.includes(studentId) ||
    studentClassIds.includes(classId) ||
    (studentClassName && className && studentClassName === className)
  );
}

function renderSessionDetails() {
  const today = localDateString();
  const item = selectedClass;
  const record = item ? recordForClassDate(item.id, today) : null;

  if (!item) {
    sessionName.textContent = "—";
    sessionTime.textContent = "No class selected";
    statusText.textContent = "Unavailable";
    statusDetail.textContent = "No assigned active class found.";
    punchTimeEl.textContent = "—";
    markedByEl.textContent = "—";
    markButton.disabled = true;
    return;
  }

  const label = item.className || item.name || "Class";
  sessionName.textContent = label;
  sessionTime.textContent = `Date: ${formatHistoryDate(today)}`;

  if (!record) {
    statusText.textContent = "Not marked";
    statusDetail.textContent = "Click Mark Attendance once for today.";
    punchTimeEl.textContent = "—";
    markedByEl.textContent = "—";
    markButton.disabled = busy;
    return;
  }

  statusText.textContent = capitalize(record.status || "present");
  statusDetail.textContent = "Already marked for today. Duplicate marking is locked.";
  punchTimeEl.textContent = formatPunchTime(record.punchedAt || record.createdAt);
  markedByEl.textContent = getMarkedByLabel(record);
  markButton.disabled = true;
}

function renderSessionOptions() {
  const today = localDateString();
  const previousId = sessionSelect.value;
  sessionSelect.replaceChildren();

  if (!assignedClasses.length) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "No assigned classes found";
    sessionSelect.appendChild(opt);
    selectedClass = null;
    renderSessionDetails();
    return;
  }

  assignedClasses.forEach(cls => {
    const rec = recordForClassDate(cls.id, today);
    const opt = document.createElement("option");
    opt.value = cls.id;
    const clsTitle = cls.className || cls.name || "Class";
    opt.textContent = rec
      ? `${clsTitle} — Already marked (${capitalize(rec.status || "present")})`
      : clsTitle;
    sessionSelect.appendChild(opt);
  });

  const matched = assignedClasses.find(c => c.id === previousId) || assignedClasses[0];
  sessionSelect.value = matched.id;
  selectedClass = matched;
  renderSessionDetails();
}

function renderTodayHistory() {
  if (!todayRecords.length) {
    historyBody.innerHTML = `
      <tr><td colspan="5" class="empty-state">
        <strong>No attendance recorded today</strong>
        <p>Your daily attendance punch will appear here.</p>
      </td></tr>`;
    return;
  }

  historyBody.innerHTML = todayRecords.map(record => `
    <tr>
      <td><strong>${escapeHTML(record.className || "Class")}</strong></td>
      <td>${escapeHTML(capitalize(record.status || "present"))}</td>
      <td>${escapeHTML(formatPunchTime(record.punchedAt || record.createdAt))}</td>
      <td>${escapeHTML(getMarkedByLabel(record))}</td>
      <td>${formatEditHistory(record)}</td>
    </tr>
  `).join("");
}

function setHistoryMessage(text, type = "info") {
  if (!historyRangeMessage) return;
  historyRangeMessage.textContent = text;
  historyRangeMessage.className = `form-message ${type}`;
  historyRangeMessage.hidden = !text;
}

function getLast10DaysRange() {
  const end = new Date();
  end.setHours(0, 0, 0, 0);
  const start = new Date(end);
  start.setDate(start.getDate() - 9);
  return {
    startDate: localDateString(start),
    endDate: localDateString(end)
  };
}

function renderAttendanceRangeHistory(historyRecords, startDate, endDate) {
  if (!historyRangeBody) return;

  if (historyRangeLabel) {
    historyRangeLabel.textContent =
      `${formatHistoryDate(startDate)} – ${formatHistoryDate(endDate)}`;
  }

  if (!historyRecords.length) {
    historyRangeBody.innerHTML = `
      <tr>
        <td colspan="6" class="empty-state">
          <strong>No attendance records found</strong>
          <p>No records were found for this date range.</p>
        </td>
      </tr>
    `;
    return;
  }

  const sorted = [...historyRecords].sort((a, b) =>
    String(b.date || "").localeCompare(String(a.date || ""))
  );

  historyRangeBody.innerHTML = sorted.map(record => `
    <tr>
      <td>${escapeHTML(formatHistoryDate(record.date))}</td>
      <td><strong>${escapeHTML(record.className || "—")}</strong></td>
      <td>${escapeHTML(capitalize(record.status || "present"))}</td>
      <td>${escapeHTML(formatPunchTime(record.punchedAt || record.createdAt))}</td>
      <td>${escapeHTML(getMarkedByLabel(record))}</td>
      <td>${formatEditHistory(record)}</td>
    </tr>
  `).join("");
}

async function loadAttendanceHistory(startDate, endDate) {
  if (!student || !profile || !historyRangeBody) return;

  if (!startDate || !endDate || startDate > endDate) {
    setHistoryMessage("Please select a valid start date and end date.", "error");
    return;
  }

  setHistoryMessage("");
  historyRangeBody.innerHTML = `
    <tr><td colspan="6" class="empty-state">Loading attendance history…</td></tr>
  `;

  if (viewHistoryButton) viewHistoryButton.disabled = true;
  if (last10DaysButton) last10DaysButton.disabled = true;

  try {
    const snap = await getDocs(query(
      collection(db, "attendance"),
      where("academyId", "==", profile.academyId),
      where("studentId", "==", student.uid)
    ));

    const filtered = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(r => typeof r.date === "string" && r.date >= startDate && r.date <= endDate);

    renderAttendanceRangeHistory(filtered, startDate, endDate);
  } catch (error) {
    console.error("Could not load attendance history:", error);
    historyRangeBody.innerHTML = `
      <tr><td colspan="6" class="empty-state">Could not load attendance history.</td></tr>
    `;
    setHistoryMessage(
      error.code === "permission-denied"
        ? "You do not have permission to view these records."
        : error.message || "Could not load attendance history.",
      "error"
    );
  } finally {
    if (viewHistoryButton) viewHistoryButton.disabled = false;
    if (last10DaysButton) last10DaysButton.disabled = false;
  }
}

async function loadLast10DaysHistory() {
  const range = getLast10DaysRange();
  if (historyStartDate) historyStartDate.value = range.startDate;
  if (historyEndDate) historyEndDate.value = range.endDate;
  await loadAttendanceHistory(range.startDate, range.endDate);
}

async function loadToday() {
  const today = localDateString();

  const classSnapshot = await getDocs(query(
    collection(db, "classes"),
    where("academyId", "==", profile.academyId),
    where("status", "==", "active")
  ));

  assignedClasses = classSnapshot.docs
    .map(snap => ({ id: snap.id, ...snap.data() }))
    .filter(cls => isStudentAssignedToClass(cls));

  const attendanceSnapshot = await getDocs(query(
    collection(db, "attendance"),
    where("academyId", "==", profile.academyId),
    where("studentId", "==", student.uid),
    where("date", "==", today)
  ));

  todayRecords = attendanceSnapshot.docs.map(snap => ({
    id: snap.id,
    ...snap.data()
  }));

  renderSessionOptions();
  renderTodayHistory();
}

async function markStudentAttendance() {
  if (!selectedClass || busy) return;

  const today = localDateString();
  const docId = classDocId(selectedClass.id, today);
  const attendanceRef = doc(db, "attendance", docId);

  busy = true;
  renderSessionDetails();
  hideMessage();

  try {
    await runTransaction(db, async transaction => {
      const existing = await transaction.get(attendanceRef);
      if (existing.exists()) {
        throw new Error("Attendance for this class today is already marked.");
      }

      transaction.set(attendanceRef, {
        academyId: profile.academyId,
        classId: selectedClass.id,
        className: selectedClass.className || selectedClass.name || "Class",
        date: today,
        studentId: student.uid,
        studentName: profile.fullName || profile.name || student.displayName || "Student",
        status: "present",
        originalStatus: "present",
        markedBy: student.uid,
        markedByRole: "student",
        punchedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        editHistory: []
      });
    });

    showMessage("Your attendance has been marked for today.", "success");
    await loadToday();
    await loadLast10DaysHistory();
  } catch (error) {
    console.error("Student attendance mark failed:", error);
    showMessage(
      error.code === "permission-denied"
        ? "Permission denied or already marked today."
        : error.message || "Could not mark attendance.",
      "error"
    );
  } finally {
    busy = false;
    renderSessionDetails();
  }
}

sessionSelect.addEventListener("change", () => {
  selectedClass = assignedClasses.find(c => c.id === sessionSelect.value) || null;
  renderSessionDetails();
});

markButton.addEventListener("click", markStudentAttendance);

viewHistoryButton?.addEventListener("click", () => {
  loadAttendanceHistory(historyStartDate?.value, historyEndDate?.value);
});

last10DaysButton?.addEventListener("click", loadLast10DaysHistory);

onAuthStateChanged(auth, async user => {
  if (!user) {
    window.location.href = "../../login.html";
    return;
  }

  student = user;

  try {
    const profileSnapshot = await getDoc(doc(db, "users", user.uid));
    if (!profileSnapshot.exists()) {
      throw new Error("Your student profile could not be found.");
    }

    profile = profileSnapshot.data();
    if (profile.role !== "student" || profile.isActive !== true || !profile.academyId) {
      throw new Error("An active student account is required.");
    }

    await loadToday();
    await loadLast10DaysHistory();

    if (!assignedClasses.length) {
      showMessage("No active assigned class found for your profile.");
    } else {
      hideMessage();
    }
  } catch (error) {
    console.error("Could not load student attendance:", error);
    showMessage(
      error.code === "permission-denied"
        ? "Attendance could not be loaded. Check your Firestore security rules."
        : error.message || "Could not load attendance.",
      "error"
    );
  }
});