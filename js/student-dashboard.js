
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

const $ = (selector) => document.querySelector(selector);

const dashboard = $(".dashboard-main");

if (!dashboard) {
  console.error("Student dashboard container was not found.");
} else {
  const cards = [...dashboard.querySelectorAll(".stats-grid .stat-card")];
  const overviewDescription = dashboard.querySelector(
    ".dashboard-section .section-heading p"
  );
  const updatesSection = [...dashboard.querySelectorAll(".dashboard-section")]
    .find(section => section.querySelector("h2")?.textContent.trim() === "Recent Updates");
  const accountMessage = [...dashboard.querySelectorAll(".dashboard-section")]
    .find(section => section.querySelector("h2")?.textContent.trim() === "Account Status")
    ?.querySelector(".form-message");

  function setCard(index, value, description) {
    if (!cards[index]) return;

    const heading = cards[index].querySelector("h3");
    const detail = cards[index].querySelector(".stat-description");

    if (heading) heading.textContent = String(value);
    if (detail) detail.textContent = description;
  }

  function showAccountMessage(message, type = "info") {
    if (!accountMessage) return;

    accountMessage.textContent = message;
    accountMessage.className = `form-message ${type}`;
    accountMessage.setAttribute(
      "role",
      type === "error" ? "alert" : "status"
    );
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
    const nameNodes = [
      ...document.querySelectorAll(
        "#account-name, [data-account-name], .account-name"
      )
    ];

    nameNodes.forEach(node => {
      node.textContent = name;
    });
  }


function renderUpdates(items) {
  if (!updatesSection) return;

  const oldState = updatesSection.querySelector(".empty-state");
  if (!oldState) return;

  oldState.replaceChildren();

  if (!items.length) {
    const title = document.createElement("strong");
    title.textContent = "No upcoming classes";

    const description = document.createElement("p");
    description.textContent =
      "Your upcoming classes will appear here when they are scheduled.";

    oldState.append(title, description);
    oldState.setAttribute("role", "status");
    return;
  }

  const list = document.createElement("div");
  list.className = "upcoming-class-list";

  items.slice(0, 4).forEach(item => {
    const row = document.createElement("div");
    row.className = "upcoming-class-item";

    const details = document.createElement("div");
    details.className = "upcoming-class-details";

    const name = document.createElement("strong");
    name.textContent = item.className;

    const subject = document.createElement("span");
    subject.textContent = item.subject || "Class";

    const time = document.createElement("span");
    time.textContent = [
      item.date,
      item.startTime,
      item.endTime ? `– ${item.endTime}` : ""
    ].filter(Boolean).join(" ");

    details.append(name, subject);

    row.append(details, time);
    list.appendChild(row);
  });

  oldState.appendChild(list);
  oldState.setAttribute("role", "status");
}


  async function loadStudentDashboard(user) {
    showAccountMessage("Loading your student account…");

    try {
      const profileSnapshot = await getDoc(doc(db, "users", user.uid));

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

      const academyId = profile.academyId;
      const name = studentName(profile, user);

      updateHeaderName(name);

      if (overviewDescription) {
        overviewDescription.textContent =
          `Welcome, ${name}. Here is your current learning overview.`;
      }

      // Classes and their sessions are stored together by the admin portal.
      const classesSnapshot = await getDocs(
        query(
          collection(db, "classes"),
          where("academyId", "==", academyId)
        )
      );

      const classes = classesSnapshot.docs
        .map(snapshot => ({ id: snapshot.id, ...snapshot.data() }))
        .filter(item => item.status === "active");

      const today = localDateString();

      const sessions = classes.flatMap(item =>
        (Array.isArray(item.sessions) ? item.sessions : [])
          .filter(session => session.date && session.status !== "cancelled")
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

      setCard(0, classes.length, "Active classes in your academy");
      setCard(1, upcoming.length, "Upcoming scheduled sessions");

      setCard(2, "—", "Learning resources");
      setCard(3, "—", "Attendance overview");
      renderUpdates(upcoming);

      try {
        const attendanceSnapshot = await getDocs(
          query(
            collection(db, "attendance"),
            where("academyId", "==", academyId),
            where("studentId", "==", user.uid)
          )
        );

        const attendance = attendanceSnapshot.docs.map(item => item.data());
        const marked = attendance.filter(item =>
          ["present", "absent", "late", "excused"].includes(item.status)
        );
        const present = marked.filter(item =>
          ["present", "late"].includes(item.status)
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
        if (error.code === "permission-denied") {
          setCard(3, "—", "Student attendance access is not enabled in Firestore rules");
        } else {
          throw error;
        }
      }

      showAccountMessage(
        `Signed in as ${name}. Your academy account is connected.`,
        "success"
      );
    } catch (error) {
      console.error("Student dashboard load failed:", error);

      showAccountMessage(
        error.code === "permission-denied"
          ? "Firestore denied access. Check the student profile and academy-scoped class read rules."
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
