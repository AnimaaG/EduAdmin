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

const tableBody = document.getElementById(
  "student-schedules-table-body"
);

const searchInput = document.getElementById(
  "student-schedule-search"
);

const dateFilter = document.getElementById(
  "student-schedule-date"
);

const resetButton = document.getElementById(
  "student-schedule-reset"
);

const messageBox = document.getElementById(
  "student-schedule-message"
);

const upcomingCount = document.getElementById(
  "schedule-upcoming-count"
);

const todayCount = document.getElementById(
  "schedule-today-count"
);

const nextClassName = document.getElementById(
  "schedule-next-class"
);

const nextClassDetail = document.getElementById(
  "schedule-next-detail"
);

let allSessions = [];
let loadingFailed = false;

function localDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function formatDate(value) {
  if (!value) return "—";

  const parts = value.split("-").map(Number);

  if (
    parts.length !== 3 ||
    parts.some(part => !Number.isFinite(part))
  ) {
    return value;
  }

  const [year, month, day] = parts;

  return new Date(year, month - 1, day).toLocaleDateString(
    undefined,
    {
      day: "numeric",
      month: "short",
      year: "numeric"
    }
  );
}

function formatTime(value) {
  if (!value) return "";

  const match = /^(\d{1,2}):(\d{2})$/.exec(value);

  if (!match) return value;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);

  if (hours > 23 || minutes > 59) return value;

  return new Date(2000, 0, 1, hours, minutes).toLocaleTimeString(
    undefined,
    {
      hour: "numeric",
      minute: "2-digit"
    }
  );
}

function sessionDateTime(session) {
  if (!session.date) return Number.POSITIVE_INFINITY;

  const time = /^\d{1,2}:\d{2}$/.test(session.startTime || "")
    ? session.startTime
    : "23:59";

  return new Date(`${session.date}T${time}:00`).getTime();
}

function isCancelled(session) {
  return ["cancelled", "canceled"].includes(
    String(session.status || "").toLowerCase()
  );
}

function showMessage(text) {
  if (!messageBox) return;

  messageBox.textContent = text;
  messageBox.hidden = !text;
}

function renderEmptyState(
  title,
  description = "Try changing your search or date filter."
) {
  tableBody.replaceChildren();

  const row = document.createElement("tr");
  const cell = document.createElement("td");
  const heading = document.createElement("strong");
  const detail = document.createElement("p");

  cell.colSpan = 8;
  cell.className = "empty-state";

  heading.textContent = title;
  detail.textContent = description;

  cell.append(heading, detail);
  row.appendChild(cell);
  tableBody.appendChild(row);
}

function isStudentAssignedToClass(studentUid, profile, classRecord) {
  const uid = String(studentUid || "");
  const classId = String(classRecord?.id || "");
  const className = String(
    classRecord?.className || classRecord?.name || ""
  ).trim().toLowerCase();

  const studentClassIds = [
    profile?.classId,
    profile?.assignedClassId,
    ...(Array.isArray(profile?.classIds) ? profile.classIds : []),
    ...(Array.isArray(profile?.assignedClassIds) ? profile.assignedClassIds : [])
  ]
    .filter(Boolean)
    .map(String);

  const studentClassName = String(
    profile?.className || profile?.class || ""
  ).trim().toLowerCase();

  const classStudentIds = Array.isArray(classRecord?.studentIds)
    ? classRecord.studentIds.map(String)
    : [];

  return (
    classStudentIds.includes(uid) ||
    studentClassIds.includes(classId) ||
    (Boolean(studentClassName) && Boolean(className) && studentClassName === className)
  );
}

function isStudentAssignedToSubject(studentUid, subjectRecord) {
  if (!subjectRecord || typeof subjectRecord !== "object") return true;

  if (Array.isArray(subjectRecord.studentIds) && subjectRecord.studentIds.length > 0) {
    return subjectRecord.studentIds.map(String).includes(String(studentUid));
  }

  return true;
}

function updateSummary() {
  const today = localDateString();
  const now = Date.now();

  const upcoming = allSessions.filter(session =>
    !isCancelled(session) &&
    sessionDateTime(session) >= now
  );

  const todaySessions = allSessions.filter(session =>
    session.date === today && !isCancelled(session)
  );

  upcomingCount.textContent = String(upcoming.length);
  todayCount.textContent = String(todaySessions.length);

  if (!upcoming.length) {
    nextClassName.textContent = "—";
    nextClassDetail.textContent = "No upcoming classes";
    return;
  }

  const next = upcoming[0];

  nextClassName.textContent = next.className;
  nextClassDetail.textContent = [
    next.subject,
    formatDate(next.date),
    formatTime(next.startTime)
  ].filter(Boolean).join(" · ");
}

function renderSessions() {
  if (loadingFailed) return;

  const search = (searchInput?.value || "").trim().toLowerCase();
  const selectedDate = dateFilter?.value || "";

  const filtered = allSessions.filter(session => {
    const searchable = [
      session.className,
      session.subject,
      session.teacherName,
      session.room,
      session.day
    ].join(" ").toLowerCase();

    return searchable.includes(search) &&
      (!selectedDate || session.date === selectedDate);
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const monday = new Date(today);
  const dayOfWeek = monday.getDay();
  const daysSinceMonday = (dayOfWeek + 6) % 7;
  monday.setDate(monday.getDate() - daysSinceMonday);

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  const weekStart = localDateString(monday);
  const weekEnd = localDateString(sunday);

  const displayed = (search || selectedDate)
    ? [...filtered].sort(
        (a, b) => sessionDateTime(a) - sessionDateTime(b)
      )
    : filtered
        .filter(session =>
          session.date >= weekStart &&
          session.date <= weekEnd
        )
        .sort(
          (a, b) => sessionDateTime(a) - sessionDateTime(b)
        );

  tableBody.replaceChildren();

  if (!displayed.length && (search || selectedDate)) {
    const hasFilters = Boolean(search || selectedDate);

    renderEmptyState(
      hasFilters
        ? "No classes match your filters"
        : "No classes scheduled this week",
      hasFilters
        ? "Try another search term or choose a different date."
        : `No sessions are scheduled from ${formatDate(weekStart)} to ${formatDate(weekEnd)}. Use search or choose a date to find other sessions.`
    );

    return;
  }

  const weekDates = [];
  const currentDay = new Date(monday);

  for (let i = 0; i < 7; i++) {
    const date = new Date(currentDay);
    date.setDate(monday.getDate() + i);

    weekDates.push({
      date: localDateString(date),
      day: date.toLocaleDateString(undefined, { weekday: "long" })
    });
  }

  const sessionsToRender = (search || selectedDate)
    ? displayed.map(session => ({
        session,
        date: session.date,
        day: session.day || new Date(
          `${session.date}T12:00:00`
        ).toLocaleDateString(undefined, { weekday: "long" })
      }))
    : weekDates.flatMap(weekDay => {
        const daySessions = displayed.filter(
          session => session.date === weekDay.date
        );

        if (!daySessions.length) {
          return [{
            session: null,
            date: weekDay.date,
            day: weekDay.day
          }];
        }

        return daySessions.map(session => ({
          session,
          date: weekDay.date,
          day: weekDay.day
        }));
      });

  const dateRowSpans = new Map();

  sessionsToRender.forEach(item => {
    if (item.session) {
      dateRowSpans.set(
        item.date,
        (dateRowSpans.get(item.date) || 0) + 1
      );
    }
  });

  const renderedDates = new Set();

  sessionsToRender.forEach(item => {
    const session = item.session;
    const row = document.createElement("tr");

    if (!renderedDates.has(item.date)) {
      const dateCell = document.createElement("td");
      dateCell.textContent = formatDate(item.date);

      const dayCell = document.createElement("td");
      dayCell.textContent = item.day;

      const rowSpan = session
        ? dateRowSpans.get(item.date) || 1
        : 1;

      dateCell.rowSpan = rowSpan;
      dayCell.rowSpan = rowSpan;

      row.append(dateCell, dayCell);
      renderedDates.add(item.date);
    }

    if (!session) {
      row.innerHTML += `
        <td></td>
        <td></td>
        <td></td>
        <td></td>
        <td></td>
        <td>No-schedule</td>
      `;

      row.classList.add("no-class-day");
      tableBody.appendChild(row);
      return;
    }

    const values = [
      session.className,
      session.subject || "—",
      session.teacherName || "—",
      [
        formatTime(session.startTime),
        formatTime(session.endTime)
      ].filter(Boolean).join(" – ") || "—"
    ];

    values.forEach(value => {
      const cell = document.createElement("td");
      cell.textContent = value;
      row.appendChild(cell);
    });

    const locationCell = document.createElement("td");

    if (session.room) {
      locationCell.textContent = session.room;
    } else if (session.meetingLink) {
      const link = document.createElement("a");
      link.href = session.meetingLink;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = "Join class";
      locationCell.appendChild(link);
    } else {
      locationCell.textContent = "—";
    }

    row.appendChild(locationCell);

    const statusCell = document.createElement("td");
    const badge = document.createElement("span");
    const cancelled = isCancelled(session);

    badge.className =
      `status-badge ${cancelled ? "inactive" : "active"}`;
    badge.textContent = cancelled ? "Cancelled" : "Scheduled";

    statusCell.appendChild(badge);
    row.appendChild(statusCell);

    tableBody.appendChild(row);
  });
}

function normalizeSession(classRecord, session, index, subjectRecord = null) {
  const className = classRecord.className || classRecord.name || "Class";
  const subject =
    subjectRecord?.subjectName ||
    subjectRecord?.name ||
    session.subject ||
    classRecord.subject ||
    "";

  return {
    id: `${classRecord.id}_${subject || "general"}_${session.date || "undated"}_${index}`,
    classId: classRecord.id,
    className,
    subject,
    teacherName:
      session.teacherName ||
      subjectRecord?.teacherName ||
      classRecord.teacherName ||
      "",
    date: session.date || "",
    day: session.day || "",
    startTime: session.startTime || "",
    endTime: session.endTime || "",
    status: session.status || subjectRecord?.status || classRecord.status || "active",
    room:
      session.room ||
      session.roomName ||
      subjectRecord?.room ||
      classRecord.room ||
      "",
    meetingLink:
      session.meetingLink ||
      session.onlineLink ||
      subjectRecord?.meetingLink ||
      classRecord.meetingLink ||
      ""
  };
}

function extractAssignedClassSessions(studentUid, profile, classRecord) {
  if (!isStudentAssignedToClass(studentUid, profile, classRecord)) {
    return [];
  }

  const extracted = [];
  const subjects = Array.isArray(classRecord.subjects) ? classRecord.subjects : [];

  subjects.forEach((subj, subjIdx) => {
    if (!isStudentAssignedToSubject(studentUid, subj)) return;

    const subjSessions = Array.isArray(subj?.sessions) ? subj.sessions : [];
    subjSessions.forEach((session, sessionIdx) => {
      if (session?.date) {
        extracted.push(
          normalizeSession(classRecord, session, `${subjIdx}_${sessionIdx}`, subj)
        );
      }
    });
  });

  const rootSessions = Array.isArray(classRecord.sessions) ? classRecord.sessions : [];
  rootSessions.forEach((session, sessionIdx) => {
    if (session?.date) {
      extracted.push(
        normalizeSession(classRecord, session, `root_${sessionIdx}`, null)
      );
    }
  });

  return extracted;
}

async function loadSchedules(user) {
  showMessage("");

  try {
    const profileSnapshot = await getDoc(
      doc(db, "users", user.uid)
    );

    if (!profileSnapshot.exists()) {
      throw new Error("Student profile not found.");
    }

    const profile = profileSnapshot.data();

    if (
      profile.role !== "student" ||
      profile.isActive !== true ||
      !profile.academyId
    ) {
      throw new Error("Student account is not active.");
    }

    const classesSnapshot = await getDocs(
      query(
        collection(db, "classes"),
        where("academyId", "==", profile.academyId)
      )
    );

    const activeClasses = classesSnapshot.docs
      .map(snapshot => ({
        id: snapshot.id,
        ...snapshot.data()
      }))
      .filter(item => String(item.status || "").toLowerCase() === "active");

    allSessions = activeClasses.flatMap(classRecord =>
      extractAssignedClassSessions(user.uid, profile, classRecord)
    );

    allSessions.sort((a, b) =>
      sessionDateTime(a) - sessionDateTime(b)
    );

    loadingFailed = false;
    updateSummary();
    renderSessions();
  } catch (error) {
    loadingFailed = true;

    console.error("Unable to load student schedules:", error);

    upcomingCount.textContent = "—";
    todayCount.textContent = "—";
    nextClassName.textContent = "—";
    nextClassDetail.textContent = "Schedule unavailable";

    renderEmptyState(
      "We couldn't load your timetable",
      "Please try again in a moment."
    );

    showMessage(
      "Your timetable is temporarily unavailable. Please refresh the page."
    );
  }
}

searchInput?.addEventListener("input", renderSessions);
dateFilter?.addEventListener("change", renderSessions);

resetButton?.addEventListener("click", () => {
  if (searchInput) searchInput.value = "";
  if (dateFilter) dateFilter.value = "";

  renderSessions();
});

onAuthStateChanged(auth, user => {
  if (!user) {
    window.location.href = "../login.html";
    return;
  }

  loadSchedules(user);
});