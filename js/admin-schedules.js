
import { auth, db } from "./firebase-config.js";

import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  updateDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";

document.addEventListener("DOMContentLoaded", () => {
  const tableBody = document.getElementById("schedules-table-body");
  const searchInput = document.getElementById("schedule-search");
  const dateFilter = document.getElementById("schedule-date-filter");
  const message = document.getElementById("schedules-message");
  const addButton = document.getElementById("add-schedule-button");
  const formSection = document.getElementById("schedule-form-section");

  const summaryCards = document.querySelectorAll(".stats-grid .stat-card");

  let adminProfile = null;
  let classes = [];
  let sessions = [];

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

  function formatDate(value) {
    if (!value) return "—";

    const [year, month, day] = value.split("-").map(Number);

    return new Date(year, month - 1, day).toLocaleDateString(
      undefined,
      { day: "numeric", month: "short", year: "numeric" }
    );
  }

  function showMessage(text, type = "info") {
    if (!message) return;

    message.textContent = text;
    message.hidden = false;
    message.className = `form-message ${type}`;
  }

  function hideMessage() {
    if (!message) return;
    message.textContent = "";
    message.hidden = true;
  }

  function renderEmpty(text) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="8" class="empty-state">
          <strong>${escapeHTML(text)}</strong>
          <p>Sessions are read from the existing class records.</p>
        </td>
      </tr>
    `;
  }

  function expandClassSessions(classRecords) {
    const result = [];

    classRecords.forEach(item => {
      const classSessions = Array.isArray(item.sessions)
        ? item.sessions
        : [];

      classSessions.forEach((session, index) => {
        result.push({
          rowId: `${item.id}_${session.date}_${index}`,
          classId: item.id,
          className: item.className || "Unnamed class",
          subject: item.subject || "",
          teacherName: item.teacherName || "",
          teacherId: item.teacherId || "",
          date: session.date || "",
          day: session.day || "",
          startTime: session.startTime || "",
          endTime: session.endTime || "",
          status: session.status || item.status || "active",
          sessionIndex: index
        });
      });
    });

    return result.sort((a, b) =>
      a.date.localeCompare(b.date) ||
      a.startTime.localeCompare(b.startTime) ||
      a.className.localeCompare(b.className)
    );
  }

  function updateSummary() {
    if (summaryCards.length < 3) return;

    const today = localDateString();

    const todaySessions = sessions.filter(item =>
      item.date === today && item.status === "active"
    );

    const teacherIds = new Set(
      sessions
        .filter(item => item.status === "active" && item.teacherId)
        .map(item => item.teacherId)
    );

    summaryCards[0].querySelector("h3").textContent = sessions.length;
    summaryCards[0].querySelector(".stat-description").textContent =
      "Sessions from class records";

    summaryCards[1].querySelector("h3").textContent = todaySessions.length;
    summaryCards[1].querySelector(".stat-description").textContent =
      "Sessions scheduled for today";

    summaryCards[2].querySelector("h3").textContent = teacherIds.size;
    summaryCards[2].querySelector(".stat-description").textContent =
      "Teachers assigned to sessions";
  }

  function renderSessions() {
    const term = (searchInput?.value || "").trim().toLowerCase();
    const selectedDate = dateFilter?.value || "";

    const filtered = sessions.filter(item => {
      const searchable = [
        item.className,
        item.subject,
        item.teacherName,
        item.day,
        item.date
      ].join(" ").toLowerCase();

      return searchable.includes(term) &&
        (!selectedDate || item.date === selectedDate);
    });

    if (filtered.length === 0) {
      renderEmpty(
        term || selectedDate
          ? "No matching class sessions"
          : "No saved class sessions"
      );
      return;
    }

    tableBody.innerHTML = filtered.map(item => `
      <tr>
        <td>${escapeHTML(item.className)}</td>
        <td>${escapeHTML(item.className)}</td>
        <td>${escapeHTML(item.subject || "—")}</td>
        <td>${escapeHTML(item.teacherName || "Not assigned")}</td>
        <td>${escapeHTML(formatDate(item.date))}</td>
        <td>${escapeHTML(item.startTime || "—")} – ${escapeHTML(item.endTime || "—")}</td>
        <td>${escapeHTML(item.status)}</td>
        <td>
          <button
            type="button"
            class="btn btn-secondary"
            data-reschedule-class="${escapeHTML(item.classId)}"
          >Edit in Classes</button>
        </td>
      </tr>
    `).join("");
  }

  async function loadClassSessions() {
    const result = await getDocs(
      query(
        collection(db, "classes"),
        where("academyId", "==", adminProfile.academyId)
      )
    );

    classes = result.docs.map(snapshot => ({
      id: snapshot.id,
      ...snapshot.data()
    }));

    sessions = expandClassSessions(classes);
    renderSessions();
    updateSummary();
  }

  searchInput?.addEventListener("input", renderSessions);
  dateFilter?.addEventListener("change", renderSessions);

  // The class owns its sessions. Edit them from the Classes page.
  addButton?.addEventListener("click", () => {
    window.location.href = "./classes.html";
  });

  tableBody?.addEventListener("click", event => {
    const button = event.target.closest("[data-reschedule-class]");

    if (!button) return;

    // The current Classes page edits the entire class record.
    // Open that page rather than creating a duplicate schedule.
    window.location.href = "./classes.html";
  });

  if (formSection) {
    formSection.hidden = true;
  }

  onAuthStateChanged(auth, async user => {
    if (!user) {
      window.location.href = "../login.html";
      return;
    }

    try {
      const profileSnapshot = await getDoc(doc(db, "users", user.uid));

      if (!profileSnapshot.exists()) {
        throw new Error("Admin profile was not found.");
      }

      const profile = profileSnapshot.data();

      if (
        profile.role !== "admin" ||
        profile.isActive !== true ||
        !profile.academyId
      ) {
        throw new Error("An active academy admin account is required.");
      }

      adminProfile = profile;
      await loadClassSessions();
      hideMessage();
    } catch (error) {
      console.error("Could not load class sessions:", error);

      renderEmpty("Could not load sessions from class records.");

      showMessage(
        error.code === "permission-denied"
          ? "Firestore denied access. Check your classes read rules."
          : error.message || "Could not load class sessions.",
        "error"
      );
    }
  });
});
