
import { auth, db } from "./firebase-config.js";

import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";

const $ = selector => document.querySelector(selector);

const dashboard = $(".dashboard-main");

if (!dashboard) {
  console.error("Student dashboard container was not found.");
} else {
  const cards = [
    $("#student-card-classes"),
    $("#student-card-upcoming"),
    $("#student-card-materials"),
    $("#student-card-attendance")
  ];

  const cardDescriptions = cards.map(card =>
    card?.parentElement?.querySelector(".stat-description")
  );

  const overviewDescription = $("#student-overview-description");
  const dashboardMessage = $("#student-dashboard-message");

  // Announcement elements
  const announcementList = $("#student-announcements-list");
  const announcementCount = $("#student-announcement-count");
  const announcementSubtitle = $("#student-announcements-subtitle");
  const announcementMessage = $("#student-announcements-message");

  let currentUser = null;
  let currentProfile = null;
  let announcementUnsubscribers = [];
  function setCard(index, value, description) {
    if (cards[index]) {
      cards[index].textContent = String(value);
    }

    if (cardDescriptions[index]) {
      cardDescriptions[index].textContent = description;
    }
  }

  function showDashboardMessage(message, type = "info") {
    if (!dashboardMessage) return;

    dashboardMessage.textContent = message;
    dashboardMessage.className = `form-message ${type}`;
    dashboardMessage.hidden = !message;

    dashboardMessage.setAttribute(
      "role",
      type === "error" ? "alert" : "status"
    );
  }

  function showAnnouncementMessage(message) {
    if (!announcementMessage) return;

    announcementMessage.textContent = message;
    announcementMessage.hidden = !message;
  }

  function localDateString(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
  }

  function studentName(profile, user) {
    return (
      profile.fullName ||
      profile.name ||
      profile.displayName ||
      user.displayName ||
      user.email ||
      "Student"
    );
  }

  function updateHeaderName(name) {
    document.querySelectorAll(
      "#account-name, [data-account-name], .account-name"
    ).forEach(node => {
      node.textContent = name;
    });
  }

  function makeElement(tag, className, text) {
    const element = document.createElement(tag);

    if (className) {
      element.className = className;
    }

    if (text !== undefined) {
      element.textContent = text;
    }

    return element;
  }

  function announcementDate(item) {
    const value =
      item.announcementDate ||
      item.createdAt ||
      item.timestamp ||
      item.date ||
      item.updatedAt;

    if (value && typeof value.toDate === "function") {
      return value.toDate();
    }

    if (value instanceof Date) {
      return value;
    }

    if (typeof value === "string" || typeof value === "number") {
      const date = new Date(value);

      if (!Number.isNaN(date.getTime())) {
        return date;
      }
    }

    return null;
  }

  function formatAnnouncementDate(item) {
    const date = announcementDate(item);

    if (!date) return "Date unavailable";

    return new Intl.DateTimeFormat("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    }).format(date);
  }

  function announcementTitle(item) {
    return (
      item.title ||
      item.subject ||
      item.heading ||
      "Announcement"
    );
  }

  function announcementBody(item) {
    return (
      item.message ||
      item.description ||
      item.body ||
      "No announcement details provided."
    );
  }

  function announcementTarget(item) {
    if (item.targetType === "class") {
      return item.className
        ? `Class: ${item.className}`
        : "Class announcement";
    }

    return "Academy-wide announcement";
  }

  function renderAnnouncementEmpty(title, description) {
    if (!announcementList) return;

    announcementList.replaceChildren();

    const empty = makeElement(
      "div",
      "student-notification-empty"
    );

    const icon = makeElement(
      "div",
      "student-notification-empty-icon",
      "i"
    );

    icon.setAttribute("aria-hidden", "true");

    const heading = makeElement("strong", "", title);
    const paragraph = makeElement("p", "", description);

    empty.append(icon, heading, paragraph);
    announcementList.appendChild(empty);
  }

function renderAnnouncements(announcements) {
  if (!announcementList) return;

  const sorted = [...announcements]
    .sort((a, b) => {
      const dateA = announcementDate(a)?.getTime() || 0;
      const dateB = announcementDate(b)?.getTime() || 0;

      return dateB - dateA;
    })
    .slice(0, 5); // Show only the latest 5

  if (announcementCount) {
    announcementCount.textContent = String(sorted.length);
    announcementCount.setAttribute(
      "aria-label",
      `${sorted.length} latest announcements`
    );
  }

  if (announcementSubtitle) {
    announcementSubtitle.textContent = sorted.length
      ? `Showing the latest ${sorted.length} announcement${sorted.length === 1 ? "" : "s"}.`
      : "There are no announcements right now.";
  }

  announcementList.setAttribute("aria-busy", "false");
  announcementList.replaceChildren();

  if (!sorted.length) {
    renderAnnouncementEmpty(
      "No announcements",
      "New academy announcements will appear here."
    );
    return;
  }

  sorted.forEach(item => {
    const row = makeElement(
      "article",
      "student-notification-item"
    );

    const icon = makeElement(
      "div",
      "student-notification-symbol",
      "i"
    );

    icon.setAttribute("aria-hidden", "true");

    const copy = makeElement(
      "div",
      "student-notification-copy"
    );

    const title = makeElement(
      "strong",
      "",
      announcementTitle(item)
    );

    const body = makeElement(
      "p",
      "",
      announcementBody(item)
    );

    const meta = makeElement(
      "div",
      "student-notification-meta"
    );

    const target = makeElement(
      "span",
      "student-notification-category",
      announcementTarget(item)
    );

    const date = makeElement(
      "span",
      "",
      formatAnnouncementDate(item)
    );

    meta.append(target, date);
    copy.append(title, body, meta);

    row.append(icon, copy);
    announcementList.appendChild(row);
  });
}

async function loadStudentAnnouncements(academyId) {
  if (!currentUser || !academyId || !announcementList) {
    showAnnouncementMessage(
      "Student or academy information is missing."
    );
    return;
  }

  // Stop previous live listeners.
  announcementUnsubscribers.forEach(unsubscribe => unsubscribe());
  announcementUnsubscribers = [];

  announcementList.setAttribute("aria-busy", "true");

  renderAnnouncementEmpty(
    "Loading announcements…",
    "Please wait while announcements are loaded."
  );

  const notificationsRef = collection(db, "notifications");
  const announcementsMap = new Map();

  function refreshAnnouncements() {
    const announcements = [...announcementsMap.values()];
    renderAnnouncements(announcements);
    showAnnouncementMessage("");
  }

  function handleListenerError(error) {
    console.error("Announcement listener error:", error);

    showAnnouncementMessage(
      error.code === "permission-denied"
        ? "Access denied. Check your Firestore announcement rules."
        : "Could not update announcements. Please try again."
    );

    announcementList.setAttribute("aria-busy", "false");
  }

  try {
    // 1. Academy-wide announcements.
    const academyQuery = query(
      notificationsRef,
      where("academyId", "==", academyId),
      where("recipientRole", "==", "student"),
      where("type", "==", "announcement"),
      where("targetType", "==", "academy")
    );

    const academyUnsubscribe = onSnapshot(
      academyQuery,
      snapshot => {
        snapshot.docChanges().forEach(change => {
          if (change.type === "removed") {
            announcementsMap.delete(change.doc.id);
          } else {
            announcementsMap.set(change.doc.id, {
              id: change.doc.id,
              ...change.doc.data()
            });
          }
        });

        refreshAnnouncements();
        announcementList.setAttribute("aria-busy", "false");
      },
      handleListenerError
    );

    announcementUnsubscribers.push(academyUnsubscribe);

    // 2. Individual announcements for this student.
    const directQuery = query(
      notificationsRef,
      where("academyId", "==", academyId),
      where("studentId", "==", currentUser.uid)
    );

    const directUnsubscribe = onSnapshot(
      directQuery,
      snapshot => {
        snapshot.docChanges().forEach(change => {
          if (change.type === "removed") {
            announcementsMap.delete(change.doc.id);
            return;
          }

          const data = change.doc.data();

          if (data.type === "announcement") {
            announcementsMap.set(change.doc.id, {
              id: change.doc.id,
              ...data
            });
          }
        });

        refreshAnnouncements();
        announcementList.setAttribute("aria-busy", "false");
      },
      handleListenerError
    );

    announcementUnsubscribers.push(directUnsubscribe);

    // 3. Find classes in this academy where this student is enrolled.
    const classesQuery = query(
      collection(db, "classes"),
      where("academyId", "==", academyId)
    );

    const classesSnapshot = await getDocs(classesQuery);

    const enrolledClasses = classesSnapshot.docs
      .map(classDoc => ({
        id: classDoc.id,
        ...classDoc.data()
      }))
      .filter(classData =>
        classData.status === "active" &&
        Array.isArray(classData.studentIds) &&
        classData.studentIds.includes(currentUser.uid)
      );

    // 4. Listen to each enrolled class's announcements.
    enrolledClasses.forEach(classData => {
      const classAnnouncementQuery = query(
        notificationsRef,
        where("academyId", "==", academyId),
        where("recipientRole", "==", "student"),
        where("type", "==", "announcement"),
        where("targetType", "==", "class"),
        where("classId", "==", classData.id)
      );

      const unsubscribe = onSnapshot(
        classAnnouncementQuery,
        snapshot => {
          snapshot.docChanges().forEach(change => {
            if (change.type === "removed") {
              announcementsMap.delete(change.doc.id);
            } else {
              announcementsMap.set(change.doc.id, {
                id: change.doc.id,
                ...change.doc.data()
              });
            }
          });

          refreshAnnouncements();
          announcementList.setAttribute("aria-busy", "false");
        },
        handleListenerError
      );

      announcementUnsubscribers.push(unsubscribe);
    });

    // Render an empty state if there are no announcements.
    refreshAnnouncements();
    announcementList.setAttribute("aria-busy", "false");

  } catch (error) {
    console.error("Could not load student announcements:", error);

    announcementList.setAttribute("aria-busy", "false");

    renderAnnouncementEmpty(
      "Announcements unavailable",
      "Please try again later."
    );

    showAnnouncementMessage(
      error.code === "permission-denied"
        ? "Firestore denied access. Check your student announcement rules."
        : "Could not load announcements."
    );
  }
}

  async function loadStudentDashboard(user) {
    showDashboardMessage("Loading your student account…");

    try {
      const profileSnapshot = await getDoc(
        doc(db, "users", user.uid)
      );

      if (!profileSnapshot.exists()) {
        throw new Error("Your student profile was not found.");
      }

      const profile = profileSnapshot.data();

      if (
        profile.role !== "student" ||
        profile.isActive !== true ||
        !profile.academyId
      ) {
        throw new Error(
          "Your account is not an active student account linked to an academy."
        );
      }

      currentUser = user;
      currentProfile = profile;

      const academyId = profile.academyId;
      const name = studentName(profile, user);

      updateHeaderName(name);

      if (overviewDescription) {
        overviewDescription.textContent =
          `Welcome, ${name}. Here is your current learning overview.`;
      }

      // Load announcements
      await loadStudentAnnouncements(academyId);

      // Load active academy classes
      const classesSnapshot = await getDocs(
        query(
          collection(db, "classes"),
          where("academyId", "==", academyId)
        )
      );

      const classes = classesSnapshot.docs
        .map(snapshot => ({
          id: snapshot.id,
          ...snapshot.data()
        }))
        .filter(item => item.status === "active");

      const today = localDateString();

      const sessions = classes.flatMap(item =>
        (Array.isArray(item.sessions) ? item.sessions : [])
          .filter(session =>
            session.date &&
            session.status !== "cancelled"
          )
          .map(session => ({
            classId: item.id,
            className: item.className || "Class",
            subject: item.subject || "",
            date: session.date,
            startTime: session.startTime || "",
            endTime: session.endTime || "",
            status: session.status || item.status
          }))
      );

      const upcoming = sessions
        .filter(session => session.date >= today)
        .sort((a, b) =>
          a.date.localeCompare(b.date) ||
          a.startTime.localeCompare(b.startTime)
        );

      setCard(
        0,
        classes.length,
        "Active classes in your academy"
      );

      setCard(
        1,
        upcoming.length,
        "Upcoming scheduled sessions"
      );

      setCard(
        2,
        "—",
        "Study material count is not connected yet"
      );

      setCard(
        3,
        "—",
        "Loading attendance records…"
      );

      // Load attendance
      try {
        const attendanceSnapshot = await getDocs(
          query(
            collection(db, "attendance"),
            where("academyId", "==", academyId),
            where("studentId", "==", user.uid)
          )
        );

        const attendance = attendanceSnapshot.docs.map(
          item => item.data()
        );

        const marked = attendance.filter(item =>
          ["present", "absent", "late", "excused"].includes(
            String(item.status || "").toLowerCase()
          )
        );

        const present = marked.filter(item =>
          ["present", "late"].includes(
            String(item.status || "").toLowerCase()
          )
        ).length;

        const percentage = marked.length
          ? Math.round((present / marked.length) * 100)
          : null;

        setCard(
          3,
          percentage === null ? "—" : `${percentage}%`,
          marked.length
            ? `${present} present/late out of ${marked.length} marked sessions`
            : "No marked attendance records yet"
        );

      } catch (error) {
        console.error(
          "Student attendance overview could not be loaded:",
          error
        );

        setCard(
          3,
          "—",
          error.code === "permission-denied"
            ? "Attendance access is not enabled in Firestore rules"
            : "Attendance could not be loaded"
        );
      }

      showDashboardMessage(
        `Signed in as ${name}. Your academy account is connected.`,
        "success"
      );

    } catch (error) {
      console.error(
        "Student dashboard load failed:",
        error
      );

      showDashboardMessage(
        error.code === "permission-denied"
          ? "Firestore denied access. Check the student profile and academy-scoped read rules."
          : error.message || "Could not load your student dashboard.",
        "error"
      );
    }
  }

  onAuthStateChanged(auth, user => {
    if (!user) {
      window.location.href = "../login.html";
      return;
    }

    loadStudentDashboard(user);
  });
}
