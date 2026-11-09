
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
  setDoc,
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

let currentTeacher = null;
let teacherClasses = [];
let academyStudents = [];

let selectedDate = new Date();
let calendarMonth = new Date(
  selectedDate.getFullYear(),
  selectedDate.getMonth(),
  1
);

let resizeObserver = null;

const STATUS_OPTIONS = [
  "present",
  "absent",
  "late",
  "excused"
];

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


function getTimestampDate(value) {
  if (!value) return null;

  if (value instanceof Date) return value;

  if (typeof value.toDate === "function") {
    return value.toDate();
  }

  if (typeof value === "number") {
    return new Date(value);
  }

  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  return null;
}

function formatTimestamp(value) {
  const date = getTimestampDate(value);

  if (!date) return "—";

  return date.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true
  });
}

function formatClassTime(value) {
  if (!value) return "—";

  const parts = String(value).split(":");

  if (parts.length < 2) return String(value);

  let hours = Number(parts[0]);
  const minutes = parts[1];

  if (!Number.isFinite(hours)) return String(value);

  const suffix = hours >= 12 ? "PM" : "AM";
  hours = hours % 12 || 12;

  return `${hours}:${minutes} ${suffix}`;
}

function calculateClassDuration(startTime, endTime) {
  if (!startTime || !endTime) return "—";

  const parseTime = value => {
    const [hours, minutes] = String(value).split(":").map(Number);

    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
      return null;
    }

    return hours * 60 + minutes;
  };

  const start = parseTime(startTime);
  const end = parseTime(endTime);

  if (start === null || end === null) return "—";

  let duration = end - start;

  if (duration < 0) duration += 24 * 60;

  const hours = Math.floor(duration / 60);
  const minutes = duration % 60;

  if (hours && minutes) return `${hours} hr ${minutes} min`;
  if (hours) return `${hours} hr`;

  return `${minutes} min`;
}

function getStudentLoginTime(record, student) {
  const candidates = [
    record?.loginDetails,
    record?.sessionDetails,
    record,
    student?.loginDetails,
    student?.sessionDetails,
    student
  ].filter(value => value && typeof value === "object");

  const keys = [
    "loginAt",
    "loggedInAt",
    "lastLoginAt",
    "sessionStartedAt"
  ];

  for (const candidate of candidates) {
    for (const key of keys) {
      if (candidate[key]) return candidate[key];
    }
  }

  return null;
}


function isStudentAssigned(student, classItem) {
  const classId = classItem.id;

  const assignedIds = [
    student.classId,
    student.assignedClassId,
    ...(Array.isArray(student.classIds) ? student.classIds : []),
    ...(Array.isArray(student.assignedClassIds)
      ? student.assignedClassIds
      : [])
  ].filter(Boolean);

  const classStudentIds = Array.isArray(classItem.studentIds)
    ? classItem.studentIds
    : [];

  return assignedIds.includes(classId)
    || classStudentIds.includes(student.id);
}

function getClassSessions(classItem) {
  return Array.isArray(classItem.sessions)
    ? classItem.sessions
    : [];
}

function isClassScheduledOnDate(classItem, dateString) {
  if (
    classItem.status
    && !["active", "scheduled"].includes(
      String(classItem.status).toLowerCase()
    )
  ) {
    return false;
  }

  return getClassSessions(classItem).some(session =>
    session.date === dateString
  );
}

function getSessionsForDate(classItem, dateString) {
  return getClassSessions(classItem).filter(session =>
    session.date === dateString
  );
}

function getAssignedStudents(classItem) {
  return academyStudents.filter(student =>
    isStudentAssigned(student, classItem)
  );
}

async function loadTeacherData() {
  const user = auth.currentUser;

  if (!user) {
    throw new Error("Please sign in again.");
  }

  const profileSnapshot = await getDoc(
    doc(db, "users", user.uid)
  );

  if (!profileSnapshot.exists()) {
    throw new Error("Teacher profile not found.");
  }

  currentTeacher = {
    ...profileSnapshot.data(),
    uid: user.uid
  };

  if (
    currentTeacher.role !== "teacher"
    || currentTeacher.isActive !== true
    || !currentTeacher.academyId
  ) {
    throw new Error("Teacher account is inactive or not configured.");
  }

  const classesQuery = query(
    collection(db, "classes"),
    where("academyId", "==", currentTeacher.academyId),
    where("teacherId", "==", currentTeacher.uid)
  );

  const studentsQuery = query(
    collection(db, "users"),
    where("academyId", "==", currentTeacher.academyId),
    where("role", "==", "student"),
    where("isActive", "==", true)
  );

  const [classSnapshot, studentSnapshot] = await Promise.all([
    getDocs(classesQuery),
    getDocs(studentsQuery)
  ]);

  teacherClasses = classSnapshot.docs.map(snapshot => ({
    id: snapshot.id,
    ...snapshot.data()
  }));

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
    const blank = document.createElement("div");
    calendarGrid.appendChild(blank);
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month, day);
    const dateString = localDateString(date);

    const hasClass = teacherClasses.some(classItem =>
      isClassScheduledOnDate(classItem, dateString)
    );

    const isSelected =
      dateString === localDateString(selectedDate);

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
  calendarMonth = new Date(
    calendarMonth.getFullYear(),
    calendarMonth.getMonth() - 1,
    1
  );

  renderCalendar();
});

nextButton.addEventListener("click", () => {
  calendarMonth = new Date(
    calendarMonth.getFullYear(),
    calendarMonth.getMonth() + 1,
    1
  );

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

    result.attendanceRecords.forEach(record => {
      recordMap.set(record.studentId, record);
    });

    result.students.forEach(student => {
      const status = recordMap.get(student.id)?.status;

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
    context.fillText(
      item.label,
      labelWidth - 10,
      y + barHeight / 2
    );

    context.fillStyle = "#eef2f7";
    context.fillRect(labelWidth, y, barWidth, barHeight);

    const actualWidth = (item.value / maxValue) * barWidth;

    context.fillStyle = item.color;
    context.fillRect(labelWidth, y, actualWidth, barHeight);

    context.textAlign = "left";
    context.fillStyle = "#1e293b";

    const valueX = Math.min(
      labelWidth + actualWidth + 7,
      width - 18
    );

    context.fillText(
      String(item.value),
      valueX,
      y + barHeight / 2
    );
  });
}


function renderClassTable(result, dateString) {
  const { classItem, students, attendanceRecords } = result;

  const sessions = getClassSessions(classItem)
    .map((session, index) => ({
      ...session,
      sessionIndex: index
    }))
    .filter(session => session.date === dateString);

  const rows = [];

  students.forEach(student => {
    sessions.forEach(session => {

      // Match the student's attendance to the correct session.
      let record = attendanceRecords.find(item =>
        item.studentId === student.id &&
        Number(item.sessionIndex) === session.sessionIndex
      );

      // Support older attendance records without sessionIndex
      // only when there is a single session on this date.
      if (!record && sessions.length === 1) {
        record = attendanceRecords.find(item =>
          item.studentId === student.id &&
          item.sessionIndex === undefined
        );
      }

      const startTime = record?.startTime || session.startTime || "";
      const endTime = record?.endTime || session.endTime || "";

      const checkInTime =
        record?.checkInAt || record?.checkedInAt || null;

      const checkOutTime =
        record?.checkOutAt || record?.checkedOutAt || null;

      const loginTime = getStudentLoginTime(record, student);

      rows.push(`
        <tr data-student-id="${escapeHTML(student.id)}">

          <td>
            <strong>${escapeHTML(getStudentName(student))}</strong>
          </td>

          <td>
            ${escapeHTML(getStudentEmail(student))}
          </td>

          <td class="time-value">
            ${escapeHTML(formatClassTime(startTime))}
          </td>

          <td class="${checkInTime ? "checkin-value" : "time-missing"}">
            ${escapeHTML(formatTimestamp(checkInTime))}
          </td>

          <td class="time-value">
            ${escapeHTML(formatClassTime(endTime))}
          </td>

          <td class="${checkOutTime ? "checkout-value" : "time-missing"}">
            ${escapeHTML(formatTimestamp(checkOutTime))}
          </td>

          <td>
            <span class="duration-value">
              ${escapeHTML(calculateClassDuration(startTime, endTime))}
            </span>
          </td>

          <td class="${loginTime ? "login-value" : "time-missing"}">
            ${escapeHTML(formatTimestamp(loginTime))}
          </td>

        </tr>
      `);
    });
  });

  const sessionText = sessions.map(session => {
    const start = formatClassTime(session.startTime);
    const end = formatClassTime(session.endTime);

    return `${start} – ${end}`;
  }).join(", ");

  return `
    <section class="attendance-class-card">

      <div class="class-heading">

        <div>
          <h3>${escapeHTML(
            classItem.className || classItem.name || "Class"
          )}</h3>

          <p>
            ${escapeHTML(classItem.subject || "Subject not specified")}
            ${sessionText ? " · " + escapeHTML(sessionText) : ""}
          </p>
        </div>

        <span class="class-student-count">
          ${students.length} student(s)
        </span>

      </div>

      <div class="attendance-table-wrapper">

        <table class="attendance-table">

          <thead>
            <tr>
              <th>Student Name</th>
              <th>Email</th>
              <th>Class Start Time</th>
              <th>Check-in Time</th>
              <th>Class End Time</th>
              <th>Check-out Time</th>
              <th>Class Duration</th>
              <th>Student Login Time</th>
            </tr>
          </thead>

          <tbody>
            ${
              rows.length
                ? rows.join("")
                : `
                  <tr>
                    <td colspan="8" class="empty-state">
                      No students assigned to this class.
                    </td>
                  </tr>
                `
            }
          </tbody>

        </table>

      </div>

    </section>
  `;
}


async function loadSelectedDateAttendance() {
  clearMessage();

  const dateString = localDateString(selectedDate);

  selectedDateLabel.innerHTML =
    `<h2>${escapeHTML(formatDate(dateString))}</h2>`;

  chartDateLabel.textContent =
    `Attendance for ${formatDate(dateString)}`;

  const scheduledClasses = teacherClasses.filter(classItem =>
    isClassScheduledOnDate(classItem, dateString)
  );

  if (!scheduledClasses.length) {
    classesContainer.innerHTML = `
      <div class="attendance-class-card empty-state">
        <h3>No schedule for the selected date!</h3>
      </div>
    `;

    sessionDetails.innerHTML = "";

    drawAttendanceChart({
      present: 0,
      absent: 0,
      late: 0,
      excused: 0,
      "not-marked": 0
    });

    return;
  }

  classesContainer.innerHTML =
    `<div class="empty-state">Loading attendance...</div>`;

  try {
    const classResults = await Promise.all(
      scheduledClasses.map(async classItem => {
        const students = getAssignedStudents(classItem);

        const attendanceQuery = query(
          collection(db, "attendance"),
          where("academyId", "==", currentTeacher.academyId),
          where("classId", "==", classItem.id),
          where("date", "==", dateString),
          where("teacherId", "==", currentTeacher.uid)
        );

        const attendanceSnapshot = await getDocs(attendanceQuery);

        const attendanceRecords = attendanceSnapshot.docs.map(snapshot => ({
          id: snapshot.id,
          ...snapshot.data()
        }));

        return {
          classItem,
          students,
          attendanceRecords
        };
      })
    );

    const counts = calculateCounts(classResults);

    drawAttendanceChart(counts);

    classesContainer.innerHTML = classResults.map(result =>
      renderClassTable(result, dateString)
    ).join("");

    attachSaveEvents();

  } catch (error) {
    console.error("Attendance loading error:", error);

    classesContainer.innerHTML = `
      <div class="attendance-class-card empty-state">
        Unable to load attendance records.
      </div>
    `;

    showMessage(
      "Firestore denied access. Check the teacher, student and attendance security rules."
    );
  }
}

function attachSaveEvents() {
  document.querySelectorAll(".save-attendance").forEach(button => {
    button.addEventListener("click", async () => {
      const classId = button.dataset.classId;
      const studentId = button.dataset.studentId;

      const row = button.closest("tr");
      const status = row.querySelector(".attendance-status").value;

      if (!STATUS_OPTIONS.includes(status)) {
        showMessage("Select a valid attendance status.");
        return;
      }

      const classItem = teacherClasses.find(item =>
        item.id === classId
      );

      if (
        !classItem
        || classItem.teacherId !== currentTeacher.uid
      ) {
        showMessage("You are not assigned to this class.");
        return;
      }

      const student = academyStudents.find(item =>
        item.id === studentId
      );

      if (!student || !isStudentAssigned(student, classItem)) {
        showMessage("This student is not assigned to this class.");
        return;
      }

      const dateString = localDateString(selectedDate);

      if (!isClassScheduledOnDate(classItem, dateString)) {
        showMessage("This class is not scheduled on the selected date.");
        return;
      }

      button.disabled = true;
      button.textContent = "Saving...";

      try {
        const attendanceId =
          `${classId}_${dateString}_${studentId}`;

        const attendanceRef = doc(
          db,
          "attendance",
          attendanceId
        );

        const existingSnapshot = await getDoc(attendanceRef);

        const attendanceData = {
          academyId: currentTeacher.academyId,
          classId,
          className: classItem.className || "",
          subject: classItem.subject || "",
          teacherId: currentTeacher.uid,
          teacherName:
            currentTeacher.fullName
            || currentTeacher.name
            || "",
          date: dateString,
          studentId,
          studentName: getStudentName(student),
          status,
          markedBy: currentTeacher.uid,
          updatedAt: serverTimestamp()
        };

        if (!existingSnapshot.exists()) {
          attendanceData.createdAt = serverTimestamp();
        }

        await setDoc(
          attendanceRef,
          attendanceData,
          { merge: true }
        );

        showMessage(
          `Attendance saved for ${getStudentName(student)}.`,
          "success"
        );

        await loadSelectedDateAttendance();

      } catch (error) {
        console.error("Attendance save error:", error);

        showMessage(
          "Unable to save attendance. Check Firestore attendance create/update rules."
        );

        button.disabled = false;
        button.textContent = "Save";
      }
    });
  });
}

function setupChartResize() {
  if (!("ResizeObserver" in window)) return;

  const chartContainer = document.querySelector(".chart-container");

  if (!chartContainer) return;

  resizeObserver = new ResizeObserver(() => {
    const dateString = localDateString(selectedDate);

    // Re-render the chart using the last displayed counts.
    if (lastChartCounts) {
      drawAttendanceChart(lastChartCounts);
    }
  });

  resizeObserver.observe(chartContainer);
}

let lastChartCounts = null;

const originalDrawAttendanceChart = drawAttendanceChart;

drawAttendanceChart = function(counts) {
  lastChartCounts = counts;
  originalDrawAttendanceChart(counts);
};

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
