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
const checkInTime = $("attendance-checkin-time");
const checkOutTime = $("attendance-checkout-time");
const checkInButton = $("attendance-checkin-button");
const checkOutButton = $("attendance-checkout-button");
const historyBody = $("attendance-history-body");

let student = null;
let profile = null;
let sessions = [];
let records = [];
let selectedSession = null;
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

function formatTimestamp(value) {
  if (!value) return "—";

  const date = typeof value.toDate === "function"
    ? value.toDate()
    : new Date(value);

  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit"
      });
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

function sessionKey(item) {
  return `${item.classId}_${item.date}_${item.sessionIndex}_${student.uid}`;
}

function recordForSession(item) {
  return records.find(record => record.id === sessionKey(item)) || null;
}

function renderSessionDetails() {
  const item = selectedSession;
  const record = item ? recordForSession(item) : null;

  if (!item) {
    sessionName.textContent = "—";
    sessionTime.textContent = "No session selected";
    statusText.textContent = "Unavailable";
    statusDetail.textContent = "There are no eligible sessions to display.";
    checkInTime.textContent = "—";
    checkOutTime.textContent = "—";
    checkInButton.disabled = true;
    checkOutButton.disabled = true;
    return;
  }

  sessionName.textContent = item.className;
  sessionTime.textContent =
    `${item.subject || "Class"} · ${item.startTime || "Time not set"}–${item.endTime || "Time not set"}`;

  checkInTime.textContent = formatTimestamp(record?.checkInAt);
  checkOutTime.textContent = formatTimestamp(record?.checkOutAt);

  if (!record) {
    statusText.textContent = "Not checked in";
    statusDetail.textContent = "Check in when you arrive for this session.";
  } else if (!record.checkOutAt) {
    statusText.textContent = "Checked in";
    statusDetail.textContent = "Remember to check out when you leave.";
  } else {
    statusText.textContent = "Session completed";
    statusDetail.textContent = "Your arrival and departure have been recorded.";
  }

  checkInButton.disabled = busy || Boolean(record);
  checkOutButton.disabled = busy || !record || Boolean(record.checkOutAt);
}

function renderHistory() {
  if (!records.length) {
    historyBody.innerHTML = `
      <tr><td colspan="6" class="empty-state">
        <strong>No attendance recorded today</strong>
        <p>Your check-in records will appear here.</p>
      </td></tr>`;
    return;
  }

  const sorted = [...records].sort((a, b) =>
    (a.startTime || "").localeCompare(b.startTime || "")
  );

  historyBody.innerHTML = sorted.map(record => `
    <tr>
      <td>${escapeHTML(record.className)}</td>
      <td>${escapeHTML(record.subject || "—")}</td>
      <td>${escapeHTML(record.startTime || "—")} – ${escapeHTML(record.endTime || "—")}</td>
      <td>${escapeHTML(formatTimestamp(record.checkInAt))}</td>
      <td>${escapeHTML(formatTimestamp(record.checkOutAt))}</td>
      <td>${record.checkOutAt ? "Completed" : "Checked in"}</td>
    </tr>
  `).join("");
}

function renderSessionOptions() {
  const previousValue = sessionSelect.value;

  sessionSelect.replaceChildren();

  if (!sessions.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "No class sessions scheduled for today";
    sessionSelect.appendChild(option);
    selectedSession = null;
    renderSessionDetails();
    return;
  }

  sessions.forEach((item, index) => {
    const option = document.createElement("option");
    option.value = String(index);
    option.textContent =
      `${item.className} — ${item.subject || "Class"} (${item.startTime || "Time not set"}–${item.endTime || "Time not set"})`;
    sessionSelect.appendChild(option);
  });

  const oldIndex = sessions.findIndex(item =>
    `${item.classId}_${item.date}_${item.sessionIndex}` === previousValue
  );

  const chosenIndex = oldIndex >= 0 ? oldIndex : 0;
  sessionSelect.value = String(chosenIndex);
  selectedSession = sessions[chosenIndex];
  sessionSelect.dataset.selectedKey =
    `${selectedSession.classId}_${selectedSession.date}_${selectedSession.sessionIndex}`;

  renderSessionDetails();
}

async function loadToday() {
  const today = localDateString();

  const classSnapshot = await getDocs(query(
    collection(db, "classes"),
    where("academyId", "==", profile.academyId),
    where("status", "==", "active")
  ));

  sessions = [];

  classSnapshot.forEach(snapshot => {
    const data = snapshot.data();
    const classSessions = Array.isArray(data.sessions) ? data.sessions : [];

    classSessions.forEach((session, sessionIndex) => {
      if (session.date !== today) return;
      if ((session.status || data.status || "active") !== "active") return;

      sessions.push({
        classId: snapshot.id,
        className: data.className || "Class",
        subject: data.subject || "",
        teacherId: data.teacherId || "",
        teacherName: data.teacherName || "",
        date: session.date,
        day: session.day || "",
        startTime: session.startTime || "",
        endTime: session.endTime || "",
        sessionIndex
      });
    });
  });

  sessions.sort((a, b) =>
    a.startTime.localeCompare(b.startTime) ||
    a.className.localeCompare(b.className)
  );

  const attendanceSnapshot = await getDocs(query(
    collection(db, "attendance"),
    where("academyId", "==", profile.academyId),
    where("studentId", "==", student.uid),
    where("date", "==", today)
  ));

  records = attendanceSnapshot.docs.map(snapshot => ({
    id: snapshot.id,
    ...snapshot.data()
  }));

  renderSessionOptions();
  renderHistory();
}

async function markCheckIn() {
  if (!selectedSession || busy) return;

  busy = true;
  renderSessionDetails();
  hideMessage();

  const item = selectedSession;
  const id = sessionKey(item);
  const attendanceRef = doc(db, "attendance", id);
  const classRef = doc(db, "classes", item.classId);

  try {
    await runTransaction(db, async transaction => {
      const existing = await transaction.get(attendanceRef);
      const classSnapshot = await transaction.get(classRef);

      if (existing.exists()) {
        throw new Error("You have already checked in for this session.");
      }

      if (!classSnapshot.exists()) {
        throw new Error("This class is no longer available.");
      }

      const classData = classSnapshot.data();
      const actualSession = classData.sessions?.[item.sessionIndex];

      if (
        classData.academyId !== profile.academyId ||
        classData.status !== "active" ||
        !actualSession ||
        actualSession.date !== item.date ||
        actualSession.startTime !== item.startTime ||
        actualSession.endTime !== item.endTime ||
        (actualSession.status || classData.status) !== "active"
      ) {
        throw new Error("This class session is no longer available.");
      }

      transaction.set(attendanceRef, {
        academyId: profile.academyId,
        classId: item.classId,
        className: item.className,
        subject: item.subject,
        teacherId: item.teacherId,
        teacherName: item.teacherName,
        date: item.date,
        day: item.day,
        sessionIndex: item.sessionIndex,
        startTime: item.startTime,
        endTime: item.endTime,
        studentId: student.uid,
        studentName: profile.fullName || profile.name || student.displayName || "Student",
        status: "present",
        checkInAt: serverTimestamp(),
        checkOutAt: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    });

    showMessage("Your check-in has been recorded.", "success");
    await loadToday();
  } catch (error) {
    console.error("Attendance check-in failed:", error);
    showMessage(
      error.message || "Could not record check-in. Please try again.",
      "error"
    );
  } finally {
    busy = false;
    renderSessionDetails();
  }
}

async function markCheckOut() {
  if (!selectedSession || busy) return;

  const item = selectedSession;
  const id = sessionKey(item);
  const attendanceRef = doc(db, "attendance", id);

  busy = true;
  renderSessionDetails();
  hideMessage();

  try {
    await runTransaction(db, async transaction => {
      const snapshot = await transaction.get(attendanceRef);

      if (!snapshot.exists()) {
        throw new Error("Check in before checking out.");
      }

      const data = snapshot.data();

      if (data.studentId !== student.uid ||
          data.academyId !== profile.academyId) {
        throw new Error("This attendance record is unavailable.");
      }

      if (data.checkOutAt) {
        throw new Error("You have already checked out for this session.");
      }

      if (!data.checkInAt) {
        throw new Error("Check in before checking out.");
      }

      transaction.update(attendanceRef, {
        checkOutAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    });

    showMessage("Your check-out has been recorded.", "success");
    await loadToday();
  } catch (error) {
    console.error("Attendance check-out failed:", error);
    showMessage(
      error.message || "Could not record check-out. Please try again.",
      "error"
    );
  } finally {
    busy = false;
    renderSessionDetails();
  }
}

sessionSelect.addEventListener("change", () => {
  const index = Number(sessionSelect.value);
  selectedSession = Number.isInteger(index) ? sessions[index] || null : null;
  renderSessionDetails();
});

checkInButton.addEventListener("click", markCheckIn);
checkOutButton.addEventListener("click", markCheckOut);

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

    if (
      profile.role !== "student" ||
      profile.isActive !== true ||
      !profile.academyId
    ) {
      throw new Error("An active student account is required.");
    }

    await loadToday();

    if (!sessions.length) {
      showMessage("There are no active class sessions scheduled for today.");
    } else {
      hideMessage();
    }
  } catch (error) {
    console.error("Could not load attendance:", error);
    showMessage(
      error.code === "permission-denied"
        ? "Attendance could not be loaded. Please contact your academy administrator."
        : error.message || "Could not load attendance. Please try again.",
      "error"
    );

    sessionSelect.replaceChildren();
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "Attendance unavailable";
    sessionSelect.appendChild(option);

    selectedSession = null;
    renderSessionDetails();
    historyBody.innerHTML = `
      <tr><td colspan="6" class="empty-state">
        Attendance is temporarily unavailable.
      </td></tr>`;
  }
});