
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

    const scheduleTotalCount = document.getElementById("schedule-total-count");
    const scheduleCompletedCount = document.getElementById("schedule-completed-count");
    const schedulePendingCount = document.getElementById("schedule-pending-count");
    const scheduleCancelledCount = document.getElementById("schedule-cancelled-count");
    const scheduleChart = document.getElementById("schedule-status-chart");
    const scheduleChartMessage = document.getElementById("schedule-chart-message");

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
      b.date.localeCompare(a.date) ||
      b.startTime.localeCompare(a.startTime) ||
      a.className.localeCompare(b.className)
    );

  }

function updateSummary() {
  const now = new Date();

  function isCancelled(item) {
    return String(item.status || "").toLowerCase() === "cancelled";
  }

  function hasFinished(item) {
    if (!item.date || !item.endTime) return false;

    const end = new Date(`${item.date}T${item.endTime}:00`);
    return !Number.isNaN(end.getTime()) && end < now;
  }

  const cancelled = sessions.filter(isCancelled);
  const completed = sessions.filter(item =>
    !isCancelled(item) && hasFinished(item)
  );
  const pending = sessions.filter(item =>
    !isCancelled(item) && !hasFinished(item)
  );

  if (scheduleTotalCount) scheduleTotalCount.textContent = sessions.length;
  if (scheduleCompletedCount) scheduleCompletedCount.textContent = completed.length;
  if (schedulePendingCount) schedulePendingCount.textContent = pending.length;
  if (scheduleCancelledCount) scheduleCancelledCount.textContent = cancelled.length;

  renderScheduleChart();
}

function renderScheduleChart() {
  if (!scheduleChart) return;

  const context = scheduleChart.getContext("2d");
  const width = scheduleChart.clientWidth;
  const height = scheduleChart.clientHeight;

  if (!context || !width || !height) return;

  const ratio = window.devicePixelRatio || 1;

  scheduleChart.width = width * ratio;
  scheduleChart.height = height * ratio;
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, width, height);

const today = new Date();
today.setHours(0, 0, 0, 0);

const dates = [];

for (let offset = -2; offset <= 3; offset++) {
  const date = new Date(today);
  date.setDate(today.getDate() + offset);
  dates.push(localDateString(date));
}

const validSessions = sessions.filter(item =>
  dates.includes(item.date)
);

  if (!dates.length) {
    if (scheduleChartMessage) {
      scheduleChartMessage.textContent = "No schedule records available.";
    }
    return;
  }

  const now = new Date();

  const completedByDate = dates.map(date =>
    validSessions.filter(item => {
      if (item.date !== date || item.status === "cancelled") return false;
      if (!item.endTime) return false;

      const end = new Date(`${item.date}T${item.endTime}:00`);
      return !Number.isNaN(end.getTime()) && end < now;
    }).length
  );

  const pendingByDate = dates.map(date =>
    validSessions.filter(item => {
      if (item.date !== date || item.status === "cancelled") return false;

      if (!item.endTime) return true;

      const end = new Date(`${item.date}T${item.endTime}:00`);
      return Number.isNaN(end.getTime()) || end >= now;
    }).length
  );

  const padding = { top: 20, right: 18, bottom: 42, left: 34 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const maxValue = Math.max(1, ...completedByDate, ...pendingByDate);
  const steps = Math.min(5, maxValue);
  const yMax = Math.max(1, Math.ceil(maxValue / steps) * steps);

  context.font = "11px sans-serif";
  context.textAlign = "right";
  context.textBaseline = "middle";
  context.strokeStyle = "#e3e8f0";
  context.fillStyle = "#68758b";
  context.lineWidth = 1;

  for (let i = 0; i <= steps; i++) {
    const value = (yMax / steps) * i;
    const y = padding.top + plotHeight - (value / yMax) * plotHeight;

    context.beginPath();
    context.moveTo(padding.left, y);
    context.lineTo(width - padding.right, y);
    context.stroke();

    context.fillText(String(Math.round(value)), padding.left - 8, y);
  }

  function drawLine(values, stroke) {
    context.strokeStyle = stroke;
    context.lineWidth = 2.5;
    context.beginPath();

    values.forEach((value, index) => {
      const x = dates.length === 1
        ? padding.left + plotWidth / 2
        : padding.left + (index / (dates.length - 1)) * plotWidth;

      const y = padding.top + plotHeight - (value / yMax) * plotHeight;

      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    });

    context.stroke();

    values.forEach((value, index) => {
      const x = dates.length === 1
        ? padding.left + plotWidth / 2
        : padding.left + (index / (dates.length - 1)) * plotWidth;

      const y = padding.top + plotHeight - (value / yMax) * plotHeight;

      context.fillStyle = stroke;
      context.beginPath();
      context.arc(x, y, 3.5, 0, Math.PI * 2);
      context.fill();
    });
  }

  drawLine(completedByDate, "#16a085");
  drawLine(pendingByDate, "#5276e8");

  context.fillStyle = "#68758b";
  context.textAlign = "center";
  context.textBaseline = "top";

  const labelCount = dates.length;

  for (let i = 0; i < labelCount; i++) {
    const index = labelCount === 1
      ? 0
      : Math.round(i * (dates.length - 1) / (labelCount - 1));

    const x = dates.length === 1
      ? padding.left + plotWidth / 2
      : padding.left + (index / (dates.length - 1)) * plotWidth;

    context.fillText(
      formatDate(dates[index]),
      x,
      padding.top + plotHeight + 10
    );
  }

  if (scheduleChartMessage) {
    scheduleChartMessage.textContent =
      "Completed and pending sessions by scheduled date.";
  }
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

    // Default view: show only the 10 latest schedules.
    // When searching or filtering by date, show all matching results.
    const displayed = (!term && !selectedDate)
      ? filtered.slice(0, 10)
      : filtered;

    if (displayed.length === 0) {
      renderEmpty(
        term || selectedDate
          ? "No matching class sessions"
          : "No saved class sessions"
      );
      return;
    }

    tableBody.innerHTML = displayed.map(item => `
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

  window.addEventListener("resize", renderScheduleChart);
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
