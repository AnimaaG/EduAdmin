
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

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

function sessionDateTime(session) {
  if (!session.date) return Number.POSITIVE_INFINITY;

  const time = /^\d{1,2}:\d{2}$/.test(session.startTime || "")
    ? session.startTime
    : "23:59";

  return new Date(`${session.date}T${time}:00`).getTime();
}

function isCancelled(session) {
  return String(session.status || "").toLowerCase() === "cancelled";
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
    formatDate(next.date),
    formatTime(next.startTime)
  ].filter(Boolean).join(" · ");
}

function renderSessions() {
  if (loadingFailed) return;

  const search = (searchInput?.value || "").trim().toLowerCase();
  const selectedDate = dateFilter?.value || "";

  // Search and date filters operate on all loaded sessions.
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

  // Calculate the current calendar week: Monday through Sunday.
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const monday = new Date(today);
  const dayOfWeek = monday.getDay(); // Sunday = 0, Monday = 1
  const daysSinceMonday = (dayOfWeek + 6) % 7;
  monday.setDate(monday.getDate() - daysSinceMonday);

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  const weekStart = localDateString(monday);
  const weekEnd = localDateString(sunday);

  // Default: show only this week's sessions.
  // When a search or date filter is used, search all loaded sessions.
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

// Combine Date and Day cells when multiple classes occur on the same date.
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

  // Render Date and Day only once per date.
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

function normalizeSession(classRecord, session, index) {
  return {
    id: `${classRecord.id}_${session.date || "undated"}_${index}`,
    classId: classRecord.id,
    className: classRecord.className || "Class",
    subject: classRecord.subject || session.subject || "",
    teacherName: session.teacherName || classRecord.teacherName || "",
    date: session.date || "",
    day: session.day || "",
    startTime: session.startTime || "",
    endTime: session.endTime || "",
    status: session.status || classRecord.status || "active",
    room: session.room || session.roomName || classRecord.room || "",
    meetingLink: session.meetingLink || session.onlineLink || ""
  };
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

    const classes = classesSnapshot.docs
      .map(snapshot => ({
        id: snapshot.id,
        ...snapshot.data()
      }))
      .filter(item => item.status === "active");

    allSessions = classes.flatMap(classRecord => {
      const sessions = Array.isArray(classRecord.sessions)
        ? classRecord.sessions
        : [];

      return sessions
        .map((session, index) =>
          normalizeSession(classRecord, session, index)
        )
        .filter(session => Boolean(session.date));
    });

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
