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


const weekTitle = document.getElementById("week-title");
const weekSubtitle = document.getElementById("week-subtitle");
const timetableStatus = document.getElementById("timetable-status");
const timetableGrid = document.getElementById("timetable-grid");

const previousWeekButton = document.getElementById("previous-week");
const nextWeekButton = document.getElementById("next-week");
const todayButton = document.getElementById("today-button");

let currentTeacher = null;
let assignedClasses = [];
let selectedWeekStart = getMonday(new Date());


/* --------------------------------
   DATE HELPERS
--------------------------------- */

function dateToString(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function parseLocalDate(dateString) {
  const [year, month, day] = dateString.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function getMonday(date) {
  const monday = new Date(date);
  monday.setHours(0, 0, 0, 0);

  const day = monday.getDay();
  monday.setDate(monday.getDate() - (day === 0 ? 6 : day - 1));

  return monday;
}

function getWeekDates(startDate) {
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(startDate);
    date.setDate(date.getDate() + index);
    return date;
  });
}

function formatDate(date) {
  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short"
  });
}

function formatWeekRange(dates) {
  const firstDate = dates[0];
  const lastDate = dates[6];

  const sameMonth =
    firstDate.getMonth() === lastDate.getMonth() &&
    firstDate.getFullYear() === lastDate.getFullYear();

  if (sameMonth) {
    return `${firstDate.getDate()} – ${lastDate.getDate()} ${lastDate.toLocaleDateString("en-IN", {
      month: "long",
      year: "numeric"
    })}`;
  }

  return `${formatDate(firstDate)} – ${lastDate.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric"
  })}`;
}

function formatTime(time) {
  if (!time) return "—";

  const match = String(time).match(/^(\d{1,2}):(\d{2})$/);

  if (!match) return time;

  const hours = Number(match[1]);
  const minutes = match[2];

  const period = hours >= 12 ? "PM" : "AM";
  const displayHours = hours % 12 || 12;

  return `${displayHours}:${minutes} ${period}`;
}


/* --------------------------------
   HTML HELPER
--------------------------------- */

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    };

    return entities[character];
  });
}


/* --------------------------------
   LOAD TEACHER PROFILE
--------------------------------- */

async function loadTeacherProfile(user) {
  const userRef = doc(db, "users", user.uid);
  const userSnapshot = await getDoc(userRef);

  if (!userSnapshot.exists()) {
    throw new Error("Teacher profile was not found.");
  }

  const teacherData = userSnapshot.data();

  if (
    teacherData.role !== "teacher" ||
    teacherData.isActive !== true ||
    !teacherData.academyId
  ) {
    throw new Error("Your teacher account is inactive or invalid.");
  }

  currentTeacher = {
    uid: user.uid,
    academyId: teacherData.academyId,
    ...teacherData
  };
}


/* --------------------------------
   LOAD ASSIGNED CLASSES
--------------------------------- */

async function loadAssignedClasses() {
  const classesQuery = query(
    collection(db, "classes"),
    where("academyId", "==", currentTeacher.academyId),
    where("teacherId", "==", currentTeacher.uid)
  );

  const snapshot = await getDocs(classesQuery);

  assignedClasses = snapshot.docs.map(document => ({
    id: document.id,
    ...document.data()
  }));
}


/* --------------------------------
   GET WEEK SESSIONS
--------------------------------- */

function getSessionsForWeek(dates) {
  const weekStart = dateToString(dates[0]);
  const weekEnd = dateToString(dates[6]);

  const sessionsByDate = {};

  dates.forEach(date => {
    sessionsByDate[dateToString(date)] = [];
  });

  assignedClasses.forEach(classItem => {
    const sessions = Array.isArray(classItem.sessions)
      ? classItem.sessions
      : [];

    sessions.forEach(session => {
      if (!session || !session.date) return;

      if (
        session.date < weekStart ||
        session.date > weekEnd
      ) {
        return;
      }

      const sessionStatus = String(session.status || "").toLowerCase();

      if (
        sessionStatus === "cancelled" ||
        sessionStatus === "canceled"
      ) {
        return;
      }

      sessionsByDate[session.date].push({
        classId: classItem.id,
        className: classItem.className || "Untitled Class",
        subject: classItem.subject || "",
        startTime: session.startTime || "",
        endTime: session.endTime || ""
      });
    });
  });

  // Sort each day's sessions by start time.
  Object.keys(sessionsByDate).forEach(date => {
    sessionsByDate[date].sort((a, b) =>
      a.startTime.localeCompare(b.startTime)
    );
  });

  return sessionsByDate;
}


/* --------------------------------
   RENDER TIMETABLE
--------------------------------- */

function renderTimetable() {
  const dates = getWeekDates(selectedWeekStart);
  const sessionsByDate = getSessionsForWeek(dates);

  weekTitle.textContent = formatWeekRange(dates);
  weekSubtitle.textContent = "Monday – Sunday";

  const todayString = dateToString(new Date());

  let totalSessions = 0;

  dates.forEach(date => {
    totalSessions += sessionsByDate[dateToString(date)].length;
  });

  if (totalSessions === 0) {
    timetableGrid.hidden = true;
    timetableStatus.hidden = false;
    timetableStatus.textContent =
      "No classes are scheduled for this week.";
    return;
  }

  timetableStatus.hidden = true;
  timetableGrid.hidden = false;

  timetableGrid.innerHTML = dates.map(date => {
    const dateString = dateToString(date);
    const daySessions = sessionsByDate[dateString];
    const isToday = dateString === todayString;

    const dayName = date.toLocaleDateString("en-IN", {
      weekday: "short"
    });

    const sessionHTML = daySessions.length
      ? daySessions.map(session => `
          <article class="timetable-session">
            <h3>${escapeHTML(session.className)}</h3>

            ${
              session.subject
                ? `<p class="session-subject">${escapeHTML(session.subject)}</p>`
                : ""
            }

            <div class="session-time">
              <span>${escapeHTML(formatTime(session.startTime))}</span>
              <span>–</span>
              <span>${escapeHTML(formatTime(session.endTime))}</span>
            </div>
          </article>
        `).join("")
      : `<div class="timetable-empty-day">No classes</div>`;

    return `
      <section class="timetable-day ${isToday ? "is-today" : ""}">
        <div class="timetable-day-header">
          <span class="day-name">${escapeHTML(dayName)}</span>
          <span class="day-date">${escapeHTML(formatDate(date))}</span>
        </div>

        <div class="timetable-sessions">
          ${sessionHTML}
        </div>
      </section>
    `;
  }).join("");
}


/* --------------------------------
   WEEK NAVIGATION
--------------------------------- */

previousWeekButton.addEventListener("click", () => {
  selectedWeekStart.setDate(selectedWeekStart.getDate() - 7);
  renderTimetable();
});

nextWeekButton.addEventListener("click", () => {
  selectedWeekStart.setDate(selectedWeekStart.getDate() + 7);
  renderTimetable();
});

todayButton.addEventListener("click", () => {
  selectedWeekStart = getMonday(new Date());
  renderTimetable();
});


/* --------------------------------
   INITIALIZE PAGE
--------------------------------- */

onAuthStateChanged(auth, async user => {
  if (!user) {
    timetableStatus.textContent = "Please log in to view your timetable.";
    timetableGrid.hidden = true;
    return;
  }

  try {
    timetableStatus.hidden = false;
    timetableStatus.textContent = "Loading your timetable...";

    await loadTeacherProfile(user);
    await loadAssignedClasses();

    renderTimetable();

  } catch (error) {
    console.error("Teacher timetable error:", error);

    timetableGrid.hidden = true;
    timetableStatus.hidden = false;
    timetableStatus.textContent =
      error.message || "Unable to load your timetable.";
  }
});