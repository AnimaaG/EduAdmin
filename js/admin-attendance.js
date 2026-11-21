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

document.addEventListener("DOMContentLoaded", () => {
  const pageDate = document.getElementById("attendance-page-date");
  const selectedDateLabel = document.getElementById("attendance-selected-date-label");
  const sessionDetails = document.getElementById("attendance-session-details");
  const dateInput = document.getElementById("attendance-date");
  const changeDateButton = document.getElementById("change-attendance-date-button");
  const downloadButton = document.getElementById("download-attendance-button");
  const classesContainer = document.getElementById("attendance-classes-container");

  const searchIndividualButton = document.getElementById("search-individual-button");
  const individualSearchPanel = document.getElementById("individual-search-panel");
  const individualStudentSearch = document.getElementById("individual-student-search");
  const individualStudentSelect = document.getElementById("individual-student-select");
  const individualStudentDetails = document.getElementById("individual-student-details");
  const individualMonth = document.getElementById("individual-month");
  const showMonthlyAttendanceButton = document.getElementById("show-monthly-attendance-button");

  const downloadPanel = document.getElementById("attendance-download-panel");
  const downloadReportType = document.getElementById("download-report-type");
  const downloadStudentSelect = document.getElementById("download-student-select");
  const downloadMonth = document.getElementById("download-month");
  const downloadStartDate = document.getElementById("download-start-date");
  const downloadEndDate = document.getElementById("download-end-date");
  const exportAttendanceButton = document.getElementById("export-attendance-button");

  if (
    !pageDate || !selectedDateLabel || !sessionDetails || !dateInput ||
    !changeDateButton || !downloadButton || !classesContainer
  ) {
    console.error("Attendance page is missing required elements.");
    return;
  }

  let academyId = null;
  let studentDirectory = [];
  let loading = false;
  const today = getLocalDateString(new Date());

  dateInput.value = today;
  dateInput.max = today;
  const currentMonth = today.slice(0, 7);

  if (individualMonth) individualMonth.value = currentMonth;
  if (downloadMonth) downloadMonth.value = currentMonth;
  if (downloadStartDate) downloadStartDate.value = `${currentMonth}-01`;
  if (downloadEndDate) downloadEndDate.value = today;

  pageDate.textContent = formatDate(today);
  selectedDateLabel.textContent = "Today's attendance";
  sessionDetails.textContent = "Loading class-wise attendance...";

  changeDateButton.addEventListener("click", () => {
    dateInput.hidden = false;
    try {
      if (typeof dateInput.showPicker === "function") {
        dateInput.showPicker();
      } else {
        dateInput.focus();
        dateInput.click();
      }
    } catch {
      dateInput.focus();
      dateInput.click();
    }
  });

  dateInput.addEventListener("change", async () => {
    if (dateInput.value) await loadAttendance(dateInput.value);
  });

  downloadButton.addEventListener("click", () => {
    if (!downloadPanel) return;
    const open = downloadPanel.hidden;
    downloadPanel.hidden = !open;
    downloadButton.setAttribute("aria-expanded", String(open));
    if (open) populateDownloadStudentSelect();
  });

  exportAttendanceButton?.addEventListener("click", async () => {
    await exportSelectedReport();
    if (downloadPanel) downloadPanel.hidden = true;
    downloadButton?.setAttribute("aria-expanded", "false");
  });

  showMonthlyAttendanceButton?.addEventListener("click", async () => {
    const studentId = individualStudentSelect?.value;
    const month = individualMonth?.value;
    if (!studentId || !month) {
      showMessage("Select both a student and a month first.");
      return;
    }
    await loadIndividualMonthlyAttendance(studentId, month);
    if (individualSearchPanel) individualSearchPanel.hidden = true;
    searchIndividualButton?.setAttribute("aria-expanded", "false");
  });

  if (searchIndividualButton && individualSearchPanel) {
    searchIndividualButton.addEventListener("click", () => {
      const open = individualSearchPanel.hidden;
      individualSearchPanel.hidden = !open;
      searchIndividualButton.setAttribute("aria-expanded", String(open));
      if (open) {
        populateIndividualStudentSelect();
        individualStudentSearch?.focus();
      }
    });
  }

  individualStudentSearch?.addEventListener("input", () => {
    const term = individualStudentSearch.value.trim().toLowerCase();
    const filtered = studentDirectory.filter(s =>
      `${s.studentName} ${s.email}`.toLowerCase().includes(term)
    );
    if (individualStudentSelect) {
      individualStudentSelect.innerHTML = '<option value="">Select a student</option>';
      filtered.forEach(s => {
        const opt = document.createElement("option");
        opt.value = s.studentId;
        opt.textContent = `${s.studentName} (${s.email || "No email"})`;
        individualStudentSelect.appendChild(opt);
      });
    }
  });

  onAuthStateChanged(auth, async user => {
    if (!user) {
      showMessage("Please sign in to view attendance.");
      return;
    }
    try {
      const profileSnapshot = await getDoc(doc(db, "users", user.uid));
      if (!profileSnapshot.exists()) {
        showMessage("Your administrator profile was not found.");
        return;
      }
      const profile = profileSnapshot.data();
      if (profile.role !== "admin" || profile.isActive !== true || !profile.academyId) {
        showMessage("You do not have permission to view this attendance.");
        return;
      }
      academyId = profile.academyId;
      await loadAttendance(dateInput.value || today);
    } catch (error) {
      console.error("Attendance authentication error:", error);
      showMessage("Unable to verify your administrator profile.");
    }
  });

  function isStudentAssigned(student, classItem) {
    const studentClassIds = new Set();
    if (student.classId) studentClassIds.add(String(student.classId));
    if (student.assignedClassId) studentClassIds.add(String(student.assignedClassId));
    if (Array.isArray(student.classIds)) student.classIds.forEach(id => studentClassIds.add(String(id)));

    const classIdStr = String(classItem.id);
    const classNameStr = String(classItem.className || classItem.name || "").trim().toLowerCase();
    const studentClassName = String(student.className || student.class || "").trim().toLowerCase();

    return (
      studentClassIds.has(classIdStr) ||
      (Array.isArray(classItem.studentIds) && classItem.studentIds.includes(student.id)) ||
      (studentClassName && classNameStr && studentClassName === classNameStr)
    );
  }

  function hasClassOnDate(classItem, dateStr) {
    const subjects = Array.isArray(classItem.subjects) ? classItem.subjects : [];
    const inSubjects = subjects.some(subj =>
      Array.isArray(subj.sessions) && subj.sessions.some(s => s && s.date === dateStr && s.status !== "cancelled")
    );
    if (inSubjects) return true;
    const rootSessions = Array.isArray(classItem.sessions) ? classItem.sessions : [];
    return rootSessions.some(s => s && s.date === dateStr && s.status !== "cancelled");
  }

  async function loadAttendance(selectedDate) {
    if (!academyId || loading) return;
    loading = true;
    setLoadingState(true);

    pageDate.textContent = formatDate(selectedDate);
    selectedDateLabel.textContent =
      selectedDate === today ? "Today's attendance" : `Attendance for ${formatDate(selectedDate)}`;
    sessionDetails.textContent = "Loading class-wise attendance...";
    classesContainer.innerHTML = `
      <div class="attendance-empty-state">
        <h3>Loading attendance</h3>
        <p>Please wait while attendance records are retrieved.</p>
      </div>
    `;

    try {
      const [classesSnapshot, studentsSnapshot, attendanceSnapshot] = await Promise.all([
        getDocs(query(collection(db, "classes"), where("academyId", "==", academyId))),
        getDocs(query(
          collection(db, "users"),
          where("academyId", "==", academyId),
          where("role", "==", "student"),
          where("isActive", "==", true)
        )),
        getDocs(query(
          collection(db, "attendance"),
          where("academyId", "==", academyId),
          where("date", "==", selectedDate)
        ))
      ]);

      const classes = classesSnapshot.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(c => c.status === "active");

      const students = studentsSnapshot.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => getStudentName(a).localeCompare(getStudentName(b)));

      studentDirectory = students.map(s => ({
        studentId: s.id,
        studentName: getStudentName(s),
        email: s.email || ""
      }));

      populateIndividualStudentSelect();
      populateDownloadStudentSelect();

      const dayRecords = attendanceSnapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      const scheduledClasses = classes.filter(c => hasClassOnDate(c, selectedDate));

      if (!scheduledClasses.length) {
        renderWeeklySchedule(classes, selectedDate);
        return;
      }

      const classResults = scheduledClasses.map(cls => {
        const assigned = students.filter(s => isStudentAssigned(s, cls));
        const targetStudents = assigned.length ? assigned : students;
        const classRecMap = new Map();
        dayRecords
          .filter(r => r.classId === cls.id)
          .forEach(r => classRecMap.set(r.studentId, r));

        const records = targetStudents.map(s => {
          const rec = classRecMap.get(s.id) || null;
          return {
            studentId: s.id,
            studentName: rec?.studentName || getStudentName(s),
            email: s.email || "—",
            status: rec ? normalizeStatus(rec.status) : "not-marked",
            punchedAt: rec ? (rec.punchedAt || rec.createdAt || null) : null,
            markedBy: rec ? (rec.markedByRole === "student" ? "Student" : `Teacher (${rec.teacherName || "Teacher"})`) : "—",
            editHistoryText: rec ? formatEditHistoryText(rec) : "—"
          };
        });

        return {
          classId: cls.id,
          className: cls.className || cls.name || "Class",
          records
        };
      });

      renderAttendance(classResults);
    } catch (error) {
      console.error("Failed to load attendance:", error);
      showMessage(getErrorMessage(error));
    } finally {
      loading = false;
      setLoadingState(false);
    }
  }

  function renderAttendance(classResults) {
    const totalStudents = classResults.reduce((acc, c) => acc + c.records.length, 0);
    sessionDetails.textContent = `${classResults.length} class(es) · ${totalStudents} student entry(ies)`;

    classesContainer.innerHTML = classResults.map(cls => {
      const present = countStatus(cls.records, "present");
      const absent = countStatus(cls.records, "absent");
      const late = countStatus(cls.records, "late");

      const rows = cls.records.map(rec => `
        <tr>
          <td><strong>${escapeHTML(rec.studentName)}</strong></td>
          <td>${escapeHTML(rec.email)}</td>
          <td><span class="attendance-status attendance-status-${escapeHTML(rec.status)}">${escapeHTML(rec.status === "not-marked" ? "Not Marked" : rec.status)}</span></td>
          <td>${escapeHTML(formatTimestamp(rec.punchedAt))}</td>
          <td>${escapeHTML(rec.markedBy)}</td>
          <td>${rec.editHistoryText}</td>
        </tr>
      `).join("");

      return `
        <section class="attendance-class-section">
          <div class="attendance-class-heading">
            <div>
              <h3>${escapeHTML(cls.className)}</h3>
              <p>Daily class-wise attendance</p>
            </div>
            <div class="attendance-counts">
              <span>Total: ${cls.records.length}</span>
              <span>Present: ${present}</span>
              <span>Absent: ${absent}</span>
              <span>Late: ${late}</span>
            </div>
          </div>

          <div class="attendance-table-wrapper">
            <table class="attendance-table">
              <thead>
                <tr>
                  <th>Student Name</th>
                  <th>Email</th>
                  <th>Status</th>
                  <th>Punch Time</th>
                  <th>Marked By</th>
                  <th>Original / Updated History</th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
        </section>
      `;
    }).join("");
  }

  function renderWeeklySchedule(classes, dateStr) {
    const start = getStartOfWeek(dateStr);
    const weekDates = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      return getLocalDateString(d);
    });

    pageDate.textContent = `${formatDate(weekDates[0])} – ${formatDate(weekDates[6])}`;
    selectedDateLabel.textContent = "Weekly class schedule";
    sessionDetails.textContent = `No schedule for ${formatDate(dateStr)}.`;

    const rows = [];
    classes.forEach(cls => {
      const subjects = Array.isArray(cls.subjects) ? cls.subjects : [];
      subjects.forEach(subj => {
        (subj.sessions || []).forEach(s => {
          if (s && weekDates.includes(s.date) && s.status !== "cancelled") {
            rows.push(`
              <tr>
                <td>${escapeHTML(formatDate(s.date))}</td>
                <td>${escapeHTML(cls.className || cls.name || "Class")}</td>
                <td>${escapeHTML(subj.subjectName || "—")}</td>
                <td>${escapeHTML(s.startTime || "—")} – ${escapeHTML(s.endTime || "—")}</td>
              </tr>
            `);
          }
        });
      });
    });

    classesContainer.innerHTML = rows.length
      ? `
        <section class="attendance-class-section">
          <div class="attendance-class-heading"><h3>This Week's Classes</h3></div>
          <div class="attendance-table-wrapper">
            <table class="attendance-table">
              <thead><tr><th>Date</th><th>Class</th><th>Subject</th><th>Time</th></tr></thead>
              <tbody>${rows.join("")}</tbody>
            </table>
          </div>
        </section>
      `
      : `<div class="attendance-empty-state"><h3>No classes scheduled this week</h3></div>`;
  }

  async function loadIndividualMonthlyAttendance(studentId, month) {
    if (!academyId) return;
    const [year, monthNumber] = month.split("-").map(Number);
    const startDate = `${month}-01`;
    const endDate = getLocalDateString(new Date(year, monthNumber, 0));

    const snap = await getDocs(query(
      collection(db, "attendance"),
      where("academyId", "==", academyId),
      where("studentId", "==", studentId)
    ));

    const rows = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(r => typeof r.date === "string" && r.date >= startDate && r.date <= endDate)
      .sort((a, b) => String(a.date).localeCompare(String(b.date)));

    const student = studentDirectory.find(s => s.studentId === studentId);
    const studentName = student?.studentName || "Student";

    pageDate.textContent = `${formatDate(startDate)} – ${formatDate(endDate)}`;
    selectedDateLabel.textContent = `${studentName} — Monthly Attendance`;
    sessionDetails.textContent = `${rows.length} record(s) in ${month}`;

    if (!rows.length) {
      classesContainer.innerHTML = `<div class="attendance-empty-state"><h3>No records found</h3></div>`;
      return;
    }

    classesContainer.innerHTML = `
      <section class="attendance-class-section">
        <div class="attendance-monthly-heading">
          <h3>${escapeHTML(studentName)} — ${escapeHTML(month)}</h3>
        </div>
        <div class="attendance-table-wrapper">
          <table class="attendance-monthly-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Class</th>
                <th>Status</th>
                <th>Punch Time</th>
                <th>Marked By</th>
                <th>Original / Updated History</th>
              </tr>
            </thead>
            <tbody>
              ${rows.map(r => `
                <tr>
                  <td>${escapeHTML(formatDate(r.date))}</td>
                  <td>${escapeHTML(r.className || "—")}</td>
                  <td>${escapeHTML(capitalize(r.status || "present"))}</td>
                  <td>${escapeHTML(formatTimestamp(r.punchedAt || r.createdAt))}</td>
                  <td>${escapeHTML(r.markedByRole === "student" ? "Student" : `Teacher (${r.teacherName || "Teacher"})`)}</td>
                  <td>${formatEditHistoryText(r)}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      </section>
    `;
  }

  async function exportSelectedReport() {
    if (!academyId) return;
    const reportType = downloadReportType?.value || "all-month";
    const selectedStudentId = downloadStudentSelect?.value || "";
    const selectedMonth = downloadMonth?.value || currentMonth;
    let startDate = `${selectedMonth}-01`;
    const [y, m] = selectedMonth.split("-").map(Number);
    let endDate = getLocalDateString(new Date(y, m, 0));
    let studentId = "";

    if (reportType === "student-month" || reportType === "student-current-month") {
      studentId = selectedStudentId;
      if (reportType === "student-current-month") {
        const cur = getLocalDateString(new Date()).slice(0, 7);
        const [cy, cm] = cur.split("-").map(Number);
        startDate = `${cur}-01`;
        endDate = getLocalDateString(new Date(cy, cm, 0));
      }
    } else if (reportType === "all-range") {
      startDate = downloadStartDate?.value || startDate;
      endDate = downloadEndDate?.value || endDate;
    }

    const snap = await getDocs(query(collection(db, "attendance"), where("academyId", "==", academyId)));
    const rows = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(r =>
        typeof r.date === "string" &&
        r.date >= startDate &&
        r.date <= endDate &&
        (!studentId || r.studentId === studentId)
      );

    if (!rows.length) {
      showMessage("No attendance records found for those filters.");
      return;
    }

    const headers = ["Date", "Student Name", "Class", "Status", "Punch Time", "Marked By", "Original Status"];
    const csvRows = [
      headers,
      ...rows.map(r => [
        r.date || "",
        r.studentName || "",
        r.className || "",
        capitalize(r.status || "present"),
        formatTimestamp(r.punchedAt || r.createdAt),
        r.markedByRole === "student" ? "Student" : (r.teacherName || "Teacher"),
        capitalize(r.originalStatus || r.status || "present")
      ])
    ];

    const csv = "\uFEFF" + csvRows.map(row => row.map(csvEscape).join(",")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `attendance-${startDate}-to-${endDate}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function populateIndividualStudentSelect() { updateStudentDropdown(individualStudentSelect); }
  function populateDownloadStudentSelect() { updateStudentDropdown(downloadStudentSelect); }

  function updateStudentDropdown(selectElement) {
    if (!selectElement) return;
    const prev = selectElement.value;
    selectElement.innerHTML = '<option value="">Select a student</option>';
    studentDirectory.forEach(s => {
      const opt = document.createElement("option");
      opt.value = s.studentId;
      opt.textContent = `${s.studentName} (${s.email || "No email"})`;
      selectElement.appendChild(opt);
    });
    if (prev && studentDirectory.some(s => s.studentId === prev)) selectElement.value = prev;
  }

  function formatEditHistoryText(record) {
    const edits = Array.isArray(record.editHistory) ? record.editHistory : [];
    if (!edits.length) return `Original: ${escapeHTML(capitalize(record.status || "present"))}`;
    const firstEdit = edits[0];
    const latestEdit = edits[edits.length - 1];
    return `Original: <strong>${escapeHTML(capitalize(firstEdit.previousStatus || record.originalStatus || "present"))}</strong> → Updated: <strong>${escapeHTML(capitalize(latestEdit.newStatus || record.status || "present"))}</strong> (${escapeHTML(formatTimestamp(latestEdit.editedAt || record.updatedAt))})`;
  }

  function setLoadingState(isLoading) {
    changeDateButton.disabled = isLoading;
    downloadButton.disabled = isLoading;
  }

  function showMessage(msg) {
    sessionDetails.textContent = msg;
    classesContainer.innerHTML = `<div class="attendance-empty-state"><p>${escapeHTML(msg)}</p></div>`;
  }

  function getStudentName(s) {
    return s.fullName || s.name || [s.firstName, s.lastName].filter(Boolean).join(" ") || s.email || "Unnamed student";
  }

  function normalizeStatus(st) {
    const v = String(st || "absent").toLowerCase();
    return ["present", "absent", "late", "excused"].includes(v) ? v : "other";
  }

  function countStatus(recs, st) {
    return recs.filter(r => normalizeStatus(r.status) === st).length;
  }

  function toDate(value) {
    if (!value) return null;
    if (typeof value.toDate === "function") return value.toDate();
    if (value instanceof Date) return value;
    if (typeof value === "number" || typeof value === "string") {
      const d = new Date(value);
      return Number.isNaN(d.getTime()) ? null : d;
    }
    if (typeof value === "object" && Number.isFinite(value.seconds)) return new Date(value.seconds * 1000);
    return null;
  }

  function formatTimestamp(value) {
    const d = toDate(value);
    if (!d) return "—";
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  }

  function getLocalDateString(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }

  function formatDate(dateString) {
    const [y, m, d] = dateString.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  }

  function getStartOfWeek(dateString) {
    const [y, m, d] = dateString.split("-").map(Number);
    const date = new Date(y, m - 1, d);
    const weekday = date.getDay();
    date.setDate(date.getDate() + (weekday === 0 ? -6 : 1 - weekday));
    return date;
  }

  function capitalize(v) {
    const s = String(v || "");
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : "";
  }

  function csvEscape(v) {
    return `"${String(v ?? "").replace(/"/g, '""')}"`;
  }

  function escapeHTML(v) {
    return String(v ?? "").replace(/[&<>"']/g, ch => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[ch]));
  }

  function getErrorMessage(err) {
    if (err?.code === "permission-denied") return "Firestore denied access. Check your security rules.";
    return err?.message || "An unexpected error occurred.";
  }
});