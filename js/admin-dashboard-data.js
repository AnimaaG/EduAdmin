import { auth, db } from "./firebase-config.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";

import {
  collection,
  doc,
  getDoc,
  query,
  where,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

const money = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2
});

let peopleChart = null;
let attendanceChart = null;
let feeChart = null;
let unsubscribeFunctions = [];

const $ = (id) => document.getElementById(id);

function text(id, value) {
  const element = $(id);
  if (element) element.textContent = String(value);
}

function showMessage(id, value) {
  const element = $(id);
  if (!element) return;
  element.textContent = value;
  element.classList.add("visible");
}

function hideMessage(id) {
  const element = $(id);
  if (element) element.classList.remove("visible");
}

function localDateString() {
  const date = new Date();
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("-");
}

function dateText() {
  return new Intl.DateTimeFormat("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short"
  }).format(new Date());
}

function getDate(value) {
  if (value?.toDate) return value.toDate();
  if (value instanceof Date) return value;

  if (typeof value === "string" || typeof value === "number") {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date;
  }

  return null;
}

function timeAgo(value) {
  const date = getDate(value);
  if (!date) return "Recently";

  const minutes = Math.max(
    0,
    Math.floor((Date.now() - date.getTime()) / 60000)
  );

  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;

  const days = Math.floor(hours / 24);
  return days === 1 ? "Yesterday" : `${days} days ago`;
}

function node(tag, className, value) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (value !== undefined) element.textContent = value;
  return element;
}

function renderAcademy(academy, profile) {
  const name =
    academy?.academyName ||
    academy?.name ||
    academy?.instituteName ||
    profile.academyName ||
    "Your Academy";

  text("academy-name", name);
  text("academy-avatar", name.trim().charAt(0).toUpperCase() || "A");
  text(
    "academy-details",
    academy?.city || academy?.address || "Academy administrator"
  );
  text("welcome-title", `Welcome to ${name}`);

  if (academy?.slogan || academy?.tagline) {
    text("welcome-slogan", academy.slogan || academy.tagline);
  }
}

function renderPeopleChart(classes, teachers, students) {
  const canvas = $("people-overview-chart");

  if (!canvas || typeof Chart === "undefined") {
    showMessage("people-chart-message", "Chart could not be displayed.");
    return;
  }

  peopleChart?.destroy();

  peopleChart = new Chart(canvas, {
    type: "bar",
    data: {
      labels: ["Classes", "Teachers", "Students"],
      datasets: [{
        data: [classes, teachers, students],
        backgroundColor: ["#7663ed", "#77a7f8", "#40c6a0"],
        borderRadius: 7,
        maxBarThickness: 42
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (context) => `${context.parsed.y} records`
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          border: { display: false },
          ticks: { color: "#89869f", font: { size: 10 } }
        },
        y: {
          beginAtZero: true,
          ticks: { precision: 0, color: "#89869f", font: { size: 9 } },
          grid: { color: "#f0eef7" },
          border: { display: false }
        }
      }
    }
  });

  hideMessage("people-chart-message");
}

function renderAttendanceChart(present, absent, unmarked) {
  const canvas = $("attendance-chart");
  if (!canvas || typeof Chart === "undefined") return;

  attendanceChart?.destroy();

  attendanceChart = new Chart(canvas, {
        type: "doughnut",
    data: {
      labels: ["Present", "Absent", "Unmarked"],
      datasets: [{
        data: [present, absent, unmarked],
        backgroundColor: ["#40c6a0", "#ef7183", "#d9d9e8"],
        borderWidth: 0,
        spacing: 4,
        borderRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "69%",
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (context) => `${context.label}: ${context.raw}`
          }
        }
      }
    }
  });
}

function renderFeeChart(received, outstanding) {
  const canvas = $("fee-overview-chart");
  if (!canvas || typeof Chart === "undefined") return;

  feeChart?.destroy();

  feeChart = new Chart(canvas, {
    type: "doughnut",
    data: {
      labels: ["Received", "Outstanding"],
      datasets: [{
        data: [received, outstanding],
        backgroundColor: ["#40c6a0", "#f5b95d"],
        borderWidth: 0,
        spacing: 4,
        borderRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "69%",
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (context) =>
              `${context.label}: ${money.format(Number(context.raw) || 0)}`
          }
        }
      }
    }
  });

  if (received + outstanding === 0) {
    showMessage("fee-chart-message", "No fee amounts have been recorded yet.");
  } else {
    hideMessage("fee-chart-message");
  }
}

function renderActivity(records) {
  const list = $("recent-activity-list");
  if (!list) return;

  list.replaceChildren();

  if (!records.length) {
    list.append(node("div", "ui-empty", "No recent activity has been recorded."));
    return;
  }

  records.slice(0, 5).forEach((record) => {
    const row = node("div", "ui-activity-row");
    const icon = node("span", "ui-activity-icon", record.symbol || "•");
    const copy = node("div", "ui-activity-copy");
    const title = node("strong", "", record.title);
    const detail = node("small", "", record.detail || "Academy update");
    const time = node("span", "ui-activity-time", timeAgo(record.date));

    copy.append(title, detail);
    row.append(icon, copy, time);
    list.append(row);
  });
}
// ============================================
// CLASS CALENDAR
// Uses existing classes collection and sessions
// ============================================

let calendarClasses = [];
let calendarSelectedDate = localDateString();

let calendarDisplayedMonth = (() => {
  const today = new Date();
  return new Date(today.getFullYear(), today.getMonth(), 1);
})();

function calendarDateKey(year, month, day) {
  return [
    year,
    String(month + 1).padStart(2, "0"),
    String(day).padStart(2, "0")
  ].join("-");
}

function getCalendarSessions(classes) {
  const byDate = new Map();

  classes.forEach((classItem) => {
    const sessions = Array.isArray(classItem.sessions)
      ? classItem.sessions
      : [];

    sessions.forEach((session) => {
      if (!session.date) return;

      if (!byDate.has(session.date)) {
        byDate.set(session.date, []);
      }

      byDate.get(session.date).push({
        className:
          classItem.className ||
          classItem.name ||
          "Class",

        subject: classItem.subject || "",

        teacher: classItem.teacherName || "",

        startTime: session.startTime || "",

        endTime: session.endTime || ""
      });
    });
  });

  byDate.forEach((sessions) => {
    sessions.sort((a, b) =>
      a.startTime.localeCompare(b.startTime)
    );
  });

  return byDate;
}

function renderCalendarSelectedDay(byDate) {
  const heading = $("calendar-selected-date");
  const summary = $("calendar-selected-summary");
  const list = $("calendar-selected-classes");

  if (!heading || !summary || !list) return;

  const selectedDate = new Date(
    `${calendarSelectedDate}T12:00:00`
  );

  heading.textContent = new Intl.DateTimeFormat("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "short",
    year: "numeric"
  }).format(selectedDate);

  const sessions = byDate.get(calendarSelectedDate) || [];

  summary.textContent = sessions.length
    ? `${sessions.length} scheduled session${sessions.length === 1 ? "" : "s"}`
    : "No classes scheduled on this date.";

  list.replaceChildren();
    if (!sessions.length) {
    list.append(
      node("div", "ui-empty", "No classes scheduled for this date.")
    );
    return;
  }

  sessions.forEach((session) => {
    const row = node("div", "ui-calendar-session");

    const timeText = session.startTime
      ? `${session.startTime}${
          session.endTime ? ` – ${session.endTime}` : ""
        }`
      : "Scheduled";

    const time = node(
      "span",
      "ui-calendar-session-time",
      timeText
    );

    const copy = node("div", "ui-calendar-session-copy");

    const details = [
      session.subject,
      session.teacher
    ].filter(Boolean).join(" · ");

    copy.append(
      node("strong", "", session.className),
      node("small", "", details || "Class session")
    );

    row.append(time, copy);
    list.append(row);
  });
}

function renderClassCalendar(classes) {
  calendarClasses = classes;

  const grid = $("class-calendar-grid");
  const title = $("calendar-month-title");

  if (!grid || !title) return;

  const year = calendarDisplayedMonth.getFullYear();
  const month = calendarDisplayedMonth.getMonth();

  const firstDay = new Date(year, month, 1);

  // Convert Sunday-first JavaScript numbering to Monday-first.
  const offset = (firstDay.getDay() + 6) % 7;

  const daysInMonth = new Date(
    year,
    month + 1,
    0
  ).getDate();

  const byDate = getCalendarSessions(classes);

  title.textContent = new Intl.DateTimeFormat("en-IN", {
    month: "long",
    year: "numeric"
  }).format(calendarDisplayedMonth);

  grid.replaceChildren();

  for (let i = 0; i < offset; i++) {
    grid.append(
      node("span", "ui-calendar-day is-empty", "")
    );
  }

  const todayKey = localDateString();

  for (let day = 1; day <= daysInMonth; day++) {
    const dateKey = calendarDateKey(year, month, day);

    const hasClasses = (byDate.get(dateKey) || []).length > 0;

    const button = node(
      "button",
      "ui-calendar-day",
      String(day)
    );

    button.type = "button";

    button.setAttribute(
      "aria-label",
      `${dateKey}${hasClasses ? ", classes scheduled" : ", no classes scheduled"}`
    );

    if (dateKey === todayKey) {
      button.classList.add("is-today");
    }

    if (dateKey === calendarSelectedDate) {
      button.classList.add("is-selected");
    }

    if (hasClasses) {
      button.classList.add("has-classes");
    }

    button.append(
      node("span", "ui-calendar-day-dot", "")
    );

    button.addEventListener("click", () => {
      calendarSelectedDate = dateKey;
      renderClassCalendar(calendarClasses);
    });

    grid.append(button);
  }

  renderCalendarSelectedDay(byDate);
}

function setupClassCalendar() {
  const previousButton = $("calendar-prev");
  const nextButton = $("calendar-next");

  if (
    previousButton &&
    previousButton.dataset.calendarReady !== "true"
  ) {
    previousButton.dataset.calendarReady = "true";

    previousButton.addEventListener("click", () => {
      calendarDisplayedMonth = new Date(
        calendarDisplayedMonth.getFullYear(),
        calendarDisplayedMonth.getMonth() - 1,
        1
      );

      renderClassCalendar(calendarClasses);
    });
  }

  if (
    nextButton &&
    nextButton.dataset.calendarReady !== "true"
  ) {
    nextButton.dataset.calendarReady = "true";

    nextButton.addEventListener("click", () => {
      calendarDisplayedMonth = new Date(
        calendarDisplayedMonth.getFullYear(),
        calendarDisplayedMonth.getMonth() + 1,
        1
      );

      renderClassCalendar(calendarClasses);
    });
  }
}

function renderSchedules(classes) {
  const list = $("today-schedules-list");
  if (!list) return;

  list.replaceChildren();

  const today = localDateString();
  const sessions = [];

  classes.forEach((classItem) => {
    const classSessions = Array.isArray(classItem.sessions)
      ? classItem.sessions
      : [];

    classSessions.forEach((session) => {
      if (session.date !== today) return;

      sessions.push({
        className: classItem.className || classItem.name || "Class",
        subject: classItem.subject || "",
        teacher: classItem.teacherName || "",
        startTime: session.startTime || "",
        endTime: session.endTime || ""
      });
    });
  });

  sessions.sort((a, b) => a.startTime.localeCompare(b.startTime));

if (!sessions.length) {
  const message = node(
    "div",
    "ui-empty",
    "Day off — no classes are scheduled for today."
  );

  list.append(message);
  return;
}

  sessions.forEach((session) => {
    const row = node("div", "ui-schedule-row");
    const time = node(
      "div",
      "ui-time",
      session.startTime || "Scheduled"
    );
    const copy = node("div", "ui-schedule-copy");

    const title = node(
      "strong",
      "",
      `${session.className}${session.subject ? ` · ${session.subject}` : ""}`
    );

    const detail = [
      session.teacher,
      session.endTime ? `Until ${session.endTime}` : ""
    ].filter(Boolean).join(" · ");

    copy.append(title, node("small", "", detail || "Scheduled session"));
    row.append(time, copy);
    list.append(row);
  });
}

function statusOf(record) {
  return String(record.status || "").trim().toLowerCase();
}

function isPresent(record) {
  return ["present", "checked-in", "checked_in", "late"].includes(statusOf(record));
}

function isAbsent(record) {
  return statusOf(record) === "absent";
}
function renderClassAttendance(classes, attendance, students) {
  const list = $("class-attendance-list");
  if (!list) return;

  list.replaceChildren();

  if (!classes.length) {
    list.append(node("div", "ui-empty", "No class records have been added."));
    return;
  }

  classes.slice(0, 8).forEach((classItem) => {
    const classRecords = attendance.filter(
      (record) => record.classId === classItem.id
    );

    const uniqueStudentIds = new Set(
      classRecords.map((record) => record.studentId).filter(Boolean)
    );

    const present = classRecords.filter(isPresent).length;
    const absent = classRecords.filter(isAbsent).length;
    const marked = uniqueStudentIds.size;

    // The full active student count is not necessarily the class roster.
    // Use marked records as the known class population unless a roster count exists.
    const knownClassTotal = Number(classItem.studentCount) ||
      Number(classItem.totalStudents) ||
      marked;

    const total = Math.max(knownClassTotal, marked);
    const unmarked = Math.max(total - marked, 0);
    const denominator = Math.max(present + absent + unmarked, 1);

    const row = node("article", "ui-class-card");
    const top = node("div", "ui-class-top");
    const avatar = node(
      "span",
      "ui-class-avatar",
      String(classItem.className || classItem.name || "C").trim().charAt(0).toUpperCase()
    );

    const copy = node("div", "ui-class-copy");
    copy.append(
      node("strong", "", classItem.className || classItem.name || "Class"),
      node("small", "", classItem.subject || "Class attendance")
    );

    const count = node("span", "ui-class-count", `${total} students`);
    top.append(avatar, copy, count);

    const progress = node("div", "ui-progress");
    const presentBar = node("span", "");
    const absentBar = node("span", "");
    const unmarkedBar = node("span", "");

    presentBar.style.width = `${present / denominator * 100}%`;
    presentBar.style.background = "#40c6a0";

    absentBar.style.width = `${absent / denominator * 100}%`;
    absentBar.style.background = "#ef7183";

    unmarkedBar.style.width = `${unmarked / denominator * 100}%`;
    unmarkedBar.style.background = "#d9d9e8";

    progress.append(presentBar, absentBar, unmarkedBar);

    const legend = node("div", "ui-class-legend");
    legend.append(
      node("span", "", `${present} present`),
      node("span", "", `${absent} absent`),
      node("span", "", `${unmarked} unmarked`)
    );

    row.append(top, progress, legend);
    list.append(row);
  });
}

function calculateFinance(fees) {
  let total = 0;
  let received = 0;

  fees.forEach((fee) => {
    const amount = Math.max(Number(fee.amount) || 0, 0);
    const paid = Math.min(Math.max(Number(fee.amountPaid) || 0, 0), amount);

    total += amount;
    received += paid;
  });

  total = Math.round(total * 100) / 100;
  received = Math.round(received * 100) / 100;

  return {
    total,
    received,
    outstanding: Math.max(0, Math.round((total - received) * 100) / 100)
  };
}

function stopListeners() {
  unsubscribeFunctions.forEach((unsubscribe) => unsubscribe());
  unsubscribeFunctions = [];

  peopleChart?.destroy();
  attendanceChart?.destroy();
  feeChart?.destroy();

  peopleChart = null;
  attendanceChart = null;
  feeChart = null;
}

function startDashboard(profile) {
  stopListeners();
  setupClassCalendar();
  const academyId = profile.academyId;
  const users = collection(db, "users");
  const classesCollection = collection(db, "classes");
  const feesCollection = collection(db, "fees");
  const attendanceCollection = collection(db, "attendance");

  let students = 0;
  let teachers = 0;
  let classes = [];
  let fees = [];
  let attendance = [];

  const refreshOverview = () => {
    text("total-classes", classes.length);
    text("total-teachers", teachers);
    text("total-students", students);

    text("chart-total-classes", classes.length);
    text("chart-total-teachers", teachers);
    text("chart-total-students", students);

    text("classes-status", "Current class records");
    text("teachers-status", "Active teachers");
    text("students-status", "Active students");

        renderPeopleChart(classes.length, teachers, students);
        renderClassCalendar(classes);
        renderSchedules(classes);
        renderClassAttendance(classes, attendance, students);
  };

  const refreshAttendance = () => {
    const present = attendance.filter(isPresent).length;
    const absent = attendance.filter(isAbsent).length;

    // Count unique students who have an attendance record today.
    const markedStudents = new Set(
      attendance.map((record) => record.studentId).filter(Boolean)
    ).size;

    const unmarked = Math.max(students - markedStudents, 0);

    text("today-present", present);
    text("today-absent", absent);
    text("today-unmarked", unmarked);
    text("attendance-date", `Attendance summary · ${dateText()}`);

    renderAttendanceChart(present, absent, unmarked);
    renderClassAttendance(classes, attendance, students);
  };

  unsubscribeFunctions.push(onSnapshot(
    query(
      users,
      where("academyId", "==", academyId),
      where("role", "==", "student"),
      where("isActive", "==", true)
    ),
    (snapshot) => {
      students = snapshot.size;
      refreshOverview();
      refreshAttendance();
    },
    (error) => {
      console.error("Student records unavailable:", error);
      text("students-status", "Unable to load");
      showMessage("people-chart-message", "Student records could not be loaded.");
    }
  ));

  unsubscribeFunctions.push(onSnapshot(
    query(
      users,
      where("academyId", "==", academyId),
      where("role", "==", "teacher"),
      where("isActive", "==", true)
    ),
    (snapshot) => {
      teachers = snapshot.size;
      refreshOverview();
    },
    (error) => {
      console.error("Teacher records unavailable:", error);
      text("teachers-status", "Unable to load");
    }
  ));

  unsubscribeFunctions.push(onSnapshot(
    query(classesCollection, where("academyId", "==", academyId)),
    (snapshot) => {
      classes = snapshot.docs.map((item) => ({
        id: item.id,
        ...item.data()
      }));
      refreshOverview();
    },
    (error) => {
      console.error("Class records unavailable:", error);
      text("classes-status", "Unable to load");
      showMessage("people-chart-message", "Class records could not be loaded.");
      showMessage("schedule-message", "Schedules could not be loaded.");
    }
  ));
    unsubscribeFunctions.push(onSnapshot(
    query(feesCollection, where("academyId", "==", academyId)),
    (snapshot) => {
      fees = snapshot.docs.map((item) => item.data());

      const finance = calculateFinance(fees);

      text("total-fees", money.format(finance.total));
      text("collected-fees", money.format(finance.received));
      text("finance-outstanding", money.format(finance.outstanding));

      renderFeeChart(finance.received, finance.outstanding);
    },
    (error) => {
      console.error("Fee records unavailable:", error);
      showMessage("fee-chart-message", "Fee records could not be loaded.");
    }
  ));

  text("attendance-date", `Attendance summary · ${dateText()}`);

  unsubscribeFunctions.push(onSnapshot(
    query(
      attendanceCollection,
      where("academyId", "==", academyId),
      where("date", "==", localDateString())
    ),
    (snapshot) => {
      attendance = snapshot.docs.map((item) => ({
        id: item.id,
        ...item.data()
      }));

      refreshAttendance();
      refreshOverview();
    },
    (error) => {
      console.error("Attendance records unavailable:", error);
      showMessage("attendance-message", "Today's attendance could not be loaded.");
    }
  ));

  // Keep the latest activity from both the activity log and payment records.
  let activityLogRecords = [];
  let paymentActivityRecords = [];

  function refreshRecentActivity() {
    const records = [
      ...activityLogRecords,
      ...paymentActivityRecords
    ];

    records.sort((a, b) => {
      const dateA = getDate(a.date)?.getTime() || 0;
      const dateB = getDate(b.date)?.getTime() || 0;
      return dateB - dateA;
    });

    renderActivity(records.slice(0, 5));
  }

  // Existing activity records: students, teachers, classes, attendance and fees.
  unsubscribeFunctions.push(onSnapshot(
    query(
      collection(db, "activityLogs"),
      where("academyId", "==", academyId)
    ),
    (snapshot) => {
      activityLogRecords = snapshot.docs.map((item) => {
        const data = item.data();
        const actionType = String(data.actionType || "").toLowerCase();

        return {
          id: item.id,
          title: String(
            data.title ||
            data.action ||
            data.message ||
            data.description ||
            "Academy update"
          ),
          detail: String(
            data.details ||
            data.detail ||
            data.fullName ||
            data.studentName ||
            data.teacherName ||
            data.className ||
            data.email ||
            "Recorded activity"
          ),
          date: data.createdAt || data.timestamp || data.date || null,
          symbol:
            actionType === "payment" || actionType === "fee" ? "₹" :
            actionType === "attendance" ? "A" :
            actionType === "student" ? "S" :
            actionType === "teacher" ? "T" :
            actionType === "class" ? "C" :
            "•"
        };
      });

      refreshRecentActivity();
      hideMessage("activity-message");
    },
    (error) => {
      console.error("Activity feed unavailable:", error);
      activityLogRecords = [];
      refreshRecentActivity();
      showMessage(
        "activity-message",
        "Admin activity could not be loaded. Check Firestore permissions for activityLogs."
      );
    }
  ));
    // Show payment submissions and their current approval/rejection status.
  unsubscribeFunctions.push(onSnapshot(
    query(
      collection(db, "paymentSubmissions"),
      where("academyId", "==", academyId)
    ),
    (snapshot) => {
      paymentActivityRecords = snapshot.docs
        .map((item) => {
          const payment = item.data();
          const status = String(payment.status || "pending")
            .trim()
            .toLowerCase();

          let title;
          let date;

          if (status === "approved") {
            title = "Payment approved";
            date = payment.reviewedAt || payment.createdAt || payment.paymentDate;
          } else if (status === "rejected") {
            title = "Payment rejected";
            date = payment.reviewedAt || payment.createdAt || payment.paymentDate;
          } else if (status === "pending") {
            title = "Payment submitted";
            date = payment.createdAt || payment.paymentDate;
          } else {
            return null;
          }

          const amount = Number(payment.amount) || 0;
          const studentName = payment.studentName || "Student";
          const feeType = payment.feeType || payment.description || "Fee payment";

          return {
            id: `payment-${item.id}-${status}`,
            title,
            detail: `${studentName} · ${feeType} · ${money.format(amount)}`,
            date,
            symbol: "₹"
          };
        })
        .filter(Boolean);

      refreshRecentActivity();
      hideMessage("activity-message");
    },
    (error) => {
      console.error("Payment activity unavailable:", error);
      paymentActivityRecords = [];
      refreshRecentActivity();
      showMessage(
        "activity-message",
        "Payment activity could not be loaded. Check Firestore permissions for paymentSubmissions."
      );
    }
  ));

  unsubscribeFunctions.push(onSnapshot(
    doc(db, "academies", academyId),
    (snapshot) => {
      renderAcademy(snapshot.exists() ? snapshot.data() : {}, profile);
    },
    (error) => {
      console.warn("Academy profile unavailable:", error);
      renderAcademy({}, profile);
    }
  ));
}

document.addEventListener("DOMContentLoaded", () => {
  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      window.location.href = "../../login.html";
      return;
    }

    try {
      const profileSnapshot = await getDoc(doc(db, "users", user.uid));

      if (!profileSnapshot.exists()) {
        throw new Error("User profile was not found.");
      }

      const profile = profileSnapshot.data();

      if (
        profile.role !== "admin" ||
        profile.isActive !== true ||
        !profile.academyId
      ) {
        window.location.href = "../../login.html";
        return;
      }

      startDashboard(profile);
    } catch (error) {
      console.error("Dashboard initialization failed:", error);

      [
        "students-status",
        "teachers-status",
        "classes-status"
      ].forEach((id) => text(id, "Unable to load"));

      showMessage("people-chart-message", "Academy records could not be loaded.");
      showMessage("fee-chart-message", "Finance data could not be loaded.");
      showMessage("attendance-message", "Attendance data could not be loaded.");
      showMessage("activity-message", "Activity data could not be loaded.");
    }
  });
});