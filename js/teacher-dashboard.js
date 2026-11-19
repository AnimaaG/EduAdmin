import { auth, db } from "./firebase-config.js";

import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  where
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";


document.addEventListener("DOMContentLoaded", () => {
  "use strict";

  const message = document.getElementById("teacher-dashboard-message");
  const teacherNameElement = document.getElementById("teacher-name");
  const teacherAvatar = document.getElementById("teacher-profile-avatar");
  const teacherSubtitle = document.getElementById("teacher-profile-subtitle");
  const welcomeHeading = document.getElementById("teacher-welcome-heading");
  const welcomeDescription = document.getElementById("teacher-welcome-description");
  const emailElement = document.getElementById("teacher-email");
  const phoneElement = document.getElementById("teacher-phone");
  const subjectElement = document.getElementById("teacher-subject");
  const employeeIdElement = document.getElementById("teacher-employee-id");
  const totalClassesElement = document.getElementById("teacher-total-classes");
  const classesStatusElement = document.getElementById("teacher-classes-status");
  const todaySessionsElement = document.getElementById("teacher-today-sessions");
  const upcomingSessionsElement = document.getElementById("teacher-upcoming-sessions");
  const attendanceCountElement = document.getElementById("teacher-attendance-count");
  const attendanceStatusElement = document.getElementById("teacher-attendance-status");
  const todayDateElement = document.getElementById("teacher-today-date");
  const todayScheduleContainer = document.getElementById("teacher-today-schedule");
  const assignedClassesContainer = document.getElementById("teacher-assigned-classes");

  let currentTeacher = null;
  let assignedClasses = [];
  let todayAttendance = [];
  let stopClassesListener = null;
  let stopAttendanceListener = null;
  let initializedUid = null;

  function localDateString(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function parseLocalDate(dateString) {
    if (!dateString) return null;
    const parts = dateString.split("-").map(Number);
    if (parts.length !== 3 || parts.some(Number.isNaN)) return null;
    return new Date(parts[0], parts[1] - 1, parts[2]);
  }

  function formatDate(dateString, options = {}) {
    const date = parseLocalDate(dateString);
    if (!date) return dateString || "—";
    return date.toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
      ...options
    });
  }

  function formatTime(time) {
    if (!time) return "Time not set";
    const parts = String(time).split(":");
    if (parts.length < 2) return time;
    let hours = Number(parts[0]);
    const minutes = parts[1];
    if (!Number.isFinite(hours)) return time;
    const suffix = hours >= 12 ? "PM" : "AM";
    hours = hours % 12 || 12;
    return `${hours}:${minutes} ${suffix}`;
  }

  function formatTimeRange(startTime, endTime) {
    if (!startTime && !endTime) return "Time not set";
    if (!endTime) return formatTime(startTime);
    if (!startTime) return formatTime(endTime);
    return `${formatTime(startTime)} – ${formatTime(endTime)}`;
  }

  function showMessage(text, type = "info") {
    if (!message) return;
    message.textContent = text;
    message.className = `message teacher-dashboard-message ${type}`;
    message.hidden = false;
  }

  function hideMessage() {
    if (!message) return;
    message.textContent = "";
    message.hidden = true;
  }

  function setText(element, value) {
    if (!element) return;
    element.textContent = value === undefined || value === null || value === "" ? "—" : String(value);
  }

  function createElement(tag, className = "", text = "") {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined && text !== null) element.textContent = String(text);
    return element;
  }

  function showEmptyState(container, heading, description) {
    if (!container) return;
    const empty = createElement("div", "empty-state");
    empty.append(createElement("h3", "", heading), createElement("p", "", description));
    container.replaceChildren(empty);
  }

  function teacherDisplayName(profile, user) {
    return profile.fullName || profile.name || profile.displayName || user.displayName || user.email || "Teacher";
  }

  function renderTeacherProfile(profile, user) {
    const name = teacherDisplayName(profile, user);
    setText(teacherNameElement, name);
    setText(teacherSubtitle, profile.designation || profile.qualification || "Teacher");
    setText(emailElement, profile.email || user.email);
    setText(phoneElement, profile.phone || profile.phoneNumber || profile.mobile);
    setText(subjectElement, profile.subject || profile.specialization);
    setText(employeeIdElement, profile.employeeId || profile.teacherId);

    if (teacherAvatar) {
      teacherAvatar.textContent = name.trim().charAt(0).toUpperCase();
    }

    setText(welcomeHeading, `Welcome, ${name}`);
    setText(welcomeDescription, "Here is your teaching schedule and assigned class overview.");

    if (todayDateElement) {
      todayDateElement.textContent = formatDate(localDateString(), {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric"
      });
    }
  }

  function getClassSessions(classItem) {
    const subjects = Array.isArray(classItem.subjects) ? classItem.subjects : [];
    const teacherSubjects = subjects.filter(subj => subj.teacherId === currentTeacher.uid);
    const result = [];

    teacherSubjects.forEach(subj => {
      const sessions = Array.isArray(subj.sessions) ? subj.sessions : [];
      sessions.forEach(session => {
        if (session && session.date && String(session.status || "").toLowerCase() !== "cancelled" && String(session.status || "").toLowerCase() !== "canceled") {
          result.push({
            classId: classItem.id,
            className: classItem.className || classItem.name || "Class",
            subject: subj.subjectName || "",
            date: session.date,
            startTime: session.startTime || "",
            endTime: session.endTime || "",
            status: session.status || classItem.status || "active"
          });
        }
      });
    });

    return result;
  }

  function getAllSessions() {
    return assignedClasses.flatMap(getClassSessions);
  }

  function updateSummary() {
    const today = localDateString();
    const sessions = getAllSessions();

    const todaySessions = sessions.filter(session => session.date === today).sort((a, b) => a.startTime.localeCompare(b.startTime));
    const upcomingSessions = sessions.filter(session => session.date > today);

    setText(totalClassesElement, assignedClasses.length);
    setText(classesStatusElement, assignedClasses.length ? "Your active assigned classes" : "No active classes assigned");
    setText(todaySessionsElement, todaySessions.length);
    setText(upcomingSessionsElement, upcomingSessions.length);

    const marked = todayAttendance.length;
    setText(attendanceCountElement, marked);
    setText(attendanceStatusElement, marked ? `${marked} attendance record(s) marked today` : "No attendance records marked today");
  }

  function renderTodaySchedule() {
    if (!todayScheduleContainer) return;

    const today = localDateString();
    const sessions = getAllSessions()
      .filter(session => session.date === today)
      .sort((a, b) => a.startTime.localeCompare(b.startTime));

    todayScheduleContainer.replaceChildren();

    if (!sessions.length) {
      showEmptyState(todayScheduleContainer, "No classes scheduled today", "You do not have any scheduled sessions for today.");
      return;
    }

    sessions.forEach(session => {
      const row = createElement("article", "teacher-list-item");
      const details = createElement("div");
      const title = createElement("strong", "", session.className);
      const subject = createElement("small", "", session.subject || "Subject not specified");
      const date = createElement("small", "", formatDate(session.date, { weekday: "short", day: "numeric", month: "short" }));
      details.append(title, subject, date);

      const time = createElement("div", "teacher-list-time", formatTimeRange(session.startTime, session.endTime));
      row.append(details, time);
      todayScheduleContainer.appendChild(row);
    });
  }

  function renderAssignedClasses() {
    if (!assignedClassesContainer) return;
    assignedClassesContainer.replaceChildren();

    if (!assignedClasses.length) {
      showEmptyState(assignedClassesContainer, "No classes assigned", "Contact your academy administrator to get classes assigned.");
      return;
    }

    assignedClasses.forEach(classItem => {
      const row = createElement("article", "teacher-list-item");
      const details = createElement("div");
      const name = createElement("strong", "", classItem.className || classItem.name || "Class");
      
      const teacherSubjects = (classItem.subjects || []).filter(s => s.teacherId === currentTeacher.uid);
      const subjectNames = teacherSubjects.map(s => s.subjectName).join(", ");

      const subject = createElement("small", "", `Subject(s): ${subjectNames || "Not specified"}`);
      const sessionCount = teacherSubjects.reduce((acc, s) => acc + (s.sessions || []).length, 0);
      const scheduleText = createElement("small", "", `${sessionCount} scheduled session(s)`);
      const status = createElement("span", "teacher-status", classItem.status || "active");

      details.append(name, subject, scheduleText);
      row.append(details, status);
      assignedClassesContainer.appendChild(row);
    });
  }

  function listenToAssignedClasses() {
    const classesQuery = query(
      collection(db, "classes"),
      where("academyId", "==", currentTeacher.academyId)
    );

    stopClassesListener = onSnapshot(
      classesQuery,
      snapshot => {
        assignedClasses = snapshot.docs
          .map(document => ({ id: document.id, ...document.data() }))
          .filter(item => {
            if (String(item.status || "").toLowerCase() !== "active") return false;
            const subjects = Array.isArray(item.subjects) ? item.subjects : [];
            return subjects.some(subj => subj.teacherId === currentTeacher.uid);
          });

        renderAssignedClasses();
        renderTodaySchedule();
        updateSummary();
        hideMessage();
      },
      error => {
        console.error("Teacher assigned classes could not be loaded:", error);
        assignedClasses = [];
        renderAssignedClasses();
        renderTodaySchedule();
        updateSummary();
        showMessage(error.code === "permission-denied" ? "Firestore denied access to your assigned classes." : "Could not load your assigned classes.", "error");
      }
    );
  }

  function listenToTodayAttendance() {
    const attendanceQuery = query(
      collection(db, "attendance"),
      where("academyId", "==", currentTeacher.academyId),
      where("teacherId", "==", currentTeacher.uid),
      where("date", "==", localDateString())
    );

    stopAttendanceListener = onSnapshot(
      attendanceQuery,
      snapshot => {
        todayAttendance = snapshot.docs.map(document => ({ id: document.id, ...document.data() }));
        updateSummary();
      },
      error => {
        console.error("Teacher attendance summary could not be loaded:", error);
        todayAttendance = [];
        updateSummary();
      }
    );
  }

  function stopListeners() {
    if (typeof stopClassesListener === "function") { stopClassesListener(); stopClassesListener = null; }
    if (typeof stopAttendanceListener === "function") { stopAttendanceListener(); stopAttendanceListener = null; }
  }

  async function initializeDashboard(user) {
    if (initializedUid === user.uid) return;
    initializedUid = user.uid;
    stopListeners();
    showMessage("Loading your teacher information...", "info");

    try {
      const profileSnapshot = await getDoc(doc(db, "users", user.uid));
      if (!profileSnapshot.exists()) throw new Error("Your teacher profile could not be found.");

      const profile = profileSnapshot.data();
      if (profile.role !== "teacher" || profile.isActive !== true || !profile.academyId) {
        throw new Error("An active teacher account linked to an academy is required.");
      }

      currentTeacher = { uid: user.uid, ...profile };
      window.currentTeacher = currentTeacher;

      renderTeacherProfile(profile, user);
      listenToAssignedClasses();
      listenToTodayAttendance();
      hideMessage();
    } catch (error) {
      console.error("Teacher dashboard initialization failed:", error);
      initializedUid = null;
      showMessage(error.message || "Could not initialize your teacher dashboard.", "error");
    }
  }

  onAuthStateChanged(auth, user => {
    if (!user) {
      stopListeners();
      window.location.href = "../../login.html";
      return;
    }
    initializeDashboard(user);
  });

  window.addEventListener("beforeunload", stopListeners);
});