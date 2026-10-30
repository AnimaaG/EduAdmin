import { auth, db } from "./firebase-config.js";

import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where
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

  const notificationList = $("#student-notifications-list");
  const notificationCount = $("#student-unread-count");
  const notificationSubtitle = $("#student-notifications-subtitle");
  const notificationMessage = $("#student-notification-message");

  let currentUser = null;
  let currentProfile = null;
  let stopNotifications = null;
  let notificationDocuments = [];
  const busyNotificationIds = new Set();
  

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

  function showNotificationMessage(message) {
    if (!notificationMessage) return;

    notificationMessage.textContent = message;
    notificationMessage.hidden = !message;
  }

  function localDateString(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
  }

  function studentName(profile, user) {
    return profile.fullName ||
      profile.name ||
      profile.displayName ||
      user.displayName ||
      user.email ||
      "Student";
  }

  function updateHeaderName(name) {
    document.querySelectorAll(
      "#account-name, [data-account-name], .account-name"
    ).forEach(node => {
      node.textContent = name;
    });
  }

  function notificationIsRead(item) {
    return item.read === true || item.isRead === true;
  }

  function notificationType(item) {
    const rawType = String(
      item.type || item.category || item.eventType || "general"
    ).toLowerCase();

    if (
      rawType.includes("fee") ||
      rawType.includes("payment")
    ) {
      return "payment";
    }

    if (
      rawType.includes("schedule") ||
      rawType.includes("class")
    ) {
      return "class";
    }

    if (
      rawType.includes("material") ||
      rawType.includes("study")
    ) {
      return "material";
    }

    if (rawType.includes("attendance")) {
      return "attendance";
    }

    return "general";
  }

  function notificationTypeLabel(item) {
    const type = notificationType(item);

    const labels = {
      payment: "Fees & payments",
      class: "Classes & schedules",
      material: "Study materials",
      attendance: "Attendance",
      general: "General update"
    };

    return labels[type];
  }

  function notificationIcon(item) {
    const type = notificationType(item);

    const icons = {
      payment: "₹",
      class: "▦",
      material: "▤",
      attendance: "✓",
      general: "i"
    };

    return icons[type];
  }

  function notificationTitle(item) {
    return item.title ||
      item.heading ||
      item.subject ||
      "Learning update";
  }

  function notificationBody(item) {
    return item.message ||
      item.description ||
      item.body ||
      "There is an update to review.";
  }

  function notificationDate(item) {
    const value =
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

  function formatNotificationDate(item) {
    const date = notificationDate(item);

    if (!date) return "Date unavailable";

    return new Intl.DateTimeFormat("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    }).format(date);
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

  /*
   * Supports notifications addressed directly to this student:
   * recipientId, studentId, userId or recipientUid.
   *
   * Also supports academy-wide student announcements with
   * recipientRole: "student" and no individual recipient ID.
   */
  function belongsToCurrentStudent(item) {
    if (!currentUser || !currentProfile) return false;

    const uid = currentUser.uid;
    const email = String(currentUser.email || "").toLowerCase();

    const recipientIds = [
      item.recipientId,
      item.studentId,
      item.userId,
      item.recipientUid,
      item.uid
    ]
      .filter(value => value !== undefined && value !== null)
      .map(String);

    const recipientEmails = [
      item.recipientEmail,
      item.studentEmail,
      item.email
    ]
      .filter(Boolean)
      .map(value => String(value).toLowerCase());

    const isDirectRecipient =
      recipientIds.includes(uid) ||
      (email && recipientEmails.includes(email));

    if (isDirectRecipient) return true;

    const hasIndividualRecipient =
      recipientIds.length > 0 ||
      recipientEmails.length > 0;

    const recipientRole = String(
      item.recipientRole || item.targetRole || ""
    ).toLowerCase();

    const isStudentBroadcast =
      recipientRole === "student" &&
      !hasIndividualRecipient;

    return isStudentBroadcast;
  }

  function renderNotificationEmpty(title, description) {
    if (!notificationList) return;

    notificationList.replaceChildren();

    const empty = makeElement(
      "div",
      "student-notification-empty"
    );

    const icon = makeElement(
      "div",
      "student-notification-empty-icon",
      "✓"
    );

    icon.setAttribute("aria-hidden", "true");

    const heading = makeElement("strong", "", title);
    const paragraph = makeElement("p", "", description);

    empty.append(icon, heading, paragraph);
    notificationList.appendChild(empty);
  }

  function renderNotifications() {
    if (!notificationList) return;

    const unread = notificationDocuments
      .filter(item =>
        belongsToCurrentStudent(item) &&
        !notificationIsRead(item)
      )
      .sort((a, b) => {
        const dateA = notificationDate(a)?.getTime() || 0;
        const dateB = notificationDate(b)?.getTime() || 0;

        return dateB - dateA;
      });

    if (notificationCount) {
      notificationCount.textContent = String(unread.length);
      notificationCount.setAttribute(
        "aria-label",
        `${unread.length} unread notifications`
      );
    }

    if (notificationSubtitle) {
      notificationSubtitle.textContent = unread.length
        ? `You have ${unread.length} unread notification${unread.length === 1 ? "" : "s"}.`
        : "You're all caught up with your learning updates.";
    }

    notificationList.setAttribute("aria-busy", "false");
    notificationList.replaceChildren();

    if (!unread.length) {
      renderNotificationEmpty(
        "No notifications",
        "You have no pending notifications right now."
      );
      return;
    }

    // No slice/limit: show every unread notification.
    unread.forEach(item => {
      const row = makeElement(
        "article",
        "student-notification-item is-unread"
      );

      const icon = makeElement(
        "div",
        "student-notification-symbol",
        notificationIcon(item)
      );

      icon.setAttribute("aria-hidden", "true");

      const copy = makeElement(
        "div",
        "student-notification-copy"
      );

      const title = makeElement(
        "strong",
        "",
        notificationTitle(item)
      );

      const body = makeElement(
        "p",
        "",
        notificationBody(item)
      );

      const meta = makeElement(
        "div",
        "student-notification-meta"
      );

      const category = makeElement(
        "span",
        "student-notification-category",
        notificationTypeLabel(item)
      );

      const date = makeElement(
        "span",
        "",
        formatNotificationDate(item)
      );

      meta.append(category, date);
      copy.append(title, body, meta);

      const actions = makeElement(
        "div",
        "student-notification-actions"
      );

      const readButton = makeElement(
        "button",
        "student-notification-read",
        busyNotificationIds.has(item.id)
          ? "Marking…"
          : "Mark as read"
      );

      readButton.type = "button";
      readButton.disabled = busyNotificationIds.has(item.id);
      readButton.addEventListener("click", () => {
        markNotificationRead(item);
      });

      actions.appendChild(readButton);
      row.append(icon, copy, actions);
      notificationList.appendChild(row);
    });
  }

  async function markNotificationRead(item) {
    if (!item?.id || busyNotificationIds.has(item.id)) return;

    busyNotificationIds.add(item.id);
    showNotificationMessage("");
    renderNotifications();

    try {
      await updateDoc(
        doc(db, "notifications", item.id),
        {
          read: true,
          isRead: true,
          readAt: serverTimestamp()
        }
      );

      /*
       * The Firestore listener will refresh the list.
       * The local update below makes the interface responsive
       * while the listener processes the server change.
       */
      notificationDocuments = notificationDocuments.map(existing =>
        existing.id === item.id
          ? { ...existing, read: true, isRead: true }
          : existing
      );

      showNotificationMessage("");
    } catch (error) {
      console.error(
        "Could not mark student notification as read:",
        error
      );

      showNotificationMessage(
        error.code === "permission-denied"
          ? "You do not have permission to update this notification. Check the Firestore rules for student notifications."
          : "Could not mark this notification as read. Please try again."
      );
    } finally {
      busyNotificationIds.delete(item.id);
      renderNotifications();
    }
  }

function startNotificationListener(academyId) {
  if (typeof stopNotifications === "function") {
    stopNotifications();
    stopNotifications = null;
  }

  if (!currentUser || !academyId) {
    showNotificationMessage("Student or academy information is missing.");
    return;
  }

  if (notificationList) {
    notificationList.setAttribute("aria-busy", "true");
    renderNotificationEmpty(
      "Loading notifications…",
      "Please wait while we check for updates."
    );
  }

  let studentNotifications = [];
  let academyAnnouncements = [];

  const studentQuery = query(
    collection(db, "notifications"),
    where("academyId", "==", academyId),
    where("studentId", "==", currentUser.uid)
  );

  /*
   * Academy-wide announcements must explicitly use:
   * targetType: "academy"
   * recipientRole: "student"
   *
   * This avoids treating another student's individual notification
   * as a notification for every student in the academy.
   */
  const announcementQuery = query(
    collection(db, "notifications"),
    where("academyId", "==", academyId),
    where("recipientRole", "==", "student"),
    where("targetType", "==", "academy")
  );

  function mergeNotifications() {
    const unique = new Map();

    [...studentNotifications, ...academyAnnouncements].forEach(item => {
      unique.set(item.id, item);
    });

    notificationDocuments = [...unique.values()];
    renderNotifications();

    if (notificationList) {
      notificationList.setAttribute("aria-busy", "false");
    }
  }

  const unsubscribeStudent = onSnapshot(
    studentQuery,
    snapshot => {
      studentNotifications = snapshot.docs.map(document => ({
        id: document.id,
        ...document.data()
      }));

      showNotificationMessage("");
      mergeNotifications();
    },
    error => {
      console.error("Student-specific notifications failed:", error);

      studentNotifications = [];
      mergeNotifications();

      showNotificationMessage(
        "Could not load your individual notifications. Check Firestore rules and indexes."
      );
    }
  );

  const unsubscribeAnnouncements = onSnapshot(
    announcementQuery,
    snapshot => {
      academyAnnouncements = snapshot.docs.map(document => ({
        id: document.id,
        ...document.data()
      }));

      showNotificationMessage("");
      mergeNotifications();
    },
    error => {
      console.error("Academy announcements failed:", error);

      academyAnnouncements = [];
      mergeNotifications();

      showNotificationMessage(
        "Could not load academy announcements. Check Firestore rules and indexes."
      );
    }
  );

  stopNotifications = () => {
    unsubscribeStudent();
    unsubscribeAnnouncements();
  };
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

      startNotificationListener(academyId);

      // Classes and their sessions are stored together by the admin portal.
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

      // Study material count remains unconnected until its schema
      // and student access rules are confirmed.
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
      if (typeof stopNotifications === "function") {
        stopNotifications();
      }

      window.location.href = "../login.html";
      return;
    }

    loadStudentDashboard(user);
  });

  window.addEventListener("beforeunload", () => {
    if (typeof stopNotifications === "function") {
      stopNotifications();
    }
  });
}