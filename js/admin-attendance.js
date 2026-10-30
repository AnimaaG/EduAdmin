import { auth, db } from "./firebase-config.js";
import { recordAcademyAdminActivity } from "./admin-activity.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";

import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  writeBatch,
  serverTimestamp
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
  const showMonthlyAttendanceButton = document.getElementById(
    "show-monthly-attendance-button"
  );

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
  let attendanceRows = [];
  let studentDirectory = [];
  let loading = false;
  let currentView = "attendance";
  let classScheduleCache = [];
  const today = getLocalDateString(new Date());

  dateInput.value = today;
  dateInput.max = today;
  const currentMonth = today.slice(0, 7);

  if (individualMonth) individualMonth.value = currentMonth;
  if (downloadMonth) downloadMonth.value = currentMonth;

  if (downloadStartDate) {
    downloadStartDate.value = `${currentMonth}-01`;
  }

  if (downloadEndDate) {
    downloadEndDate.value = today;
  }
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

  // Close the Download Attendance panel after export completes.
  if (downloadPanel) {
    downloadPanel.hidden = true;
  }

  downloadButton?.setAttribute("aria-expanded", "false");
});

showMonthlyAttendanceButton?.addEventListener("click", async () => {
  const studentId = individualStudentSelect?.value;
  const month = individualMonth?.value;

  if (!studentId) {
    showMessage("Select a student first.");
    return;
  }

  if (!month) {
    showMessage("Select a month first.");
    return;
  }

  await loadIndividualMonthlyAttendance(studentId, month);

    // Close the Search Individual Data panel after loading.
  if (individualSearchPanel) {
    individualSearchPanel.hidden = true;
  }

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

  const filteredStudents = studentDirectory.filter((student) =>
    `${student.studentName} ${student.email}`.toLowerCase().includes(term)
  );

  const previousValue = individualStudentSelect?.value || "";

  if (individualStudentSelect) {
    individualStudentSelect.innerHTML =
      '<option value="">Select a student</option>';

    filteredStudents.forEach((student) => {
      const option = document.createElement("option");
      option.value = student.studentId;
      option.textContent =
        `${student.studentName} (${student.email || "No email"})`;

      individualStudentSelect.appendChild(option);
    });

    if (filteredStudents.some((student) => student.studentId === previousValue)) {
      individualStudentSelect.value = previousValue;
    }
  }
});

individualStudentSelect?.addEventListener("change", () => {
  if (individualStudentDetails) {
    individualStudentDetails.textContent =
      "Choose a month and click Show Monthly Data to load the student's records.";
  }
});

  document.addEventListener("click", (event) => {
    if (
      individualSearchPanel &&
      searchIndividualButton &&
      !individualSearchPanel.hidden &&
      !individualSearchPanel.contains(event.target) &&
      !searchIndividualButton.contains(event.target)
    ) {
      individualSearchPanel.hidden = true;
      searchIndividualButton.setAttribute("aria-expanded", "false");
    }
  });

  onAuthStateChanged(auth, async (user) => {
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

      if (
        profile.role !== "admin" ||
        profile.isActive !== true ||
        !profile.academyId
      ) {
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

  async function loadAttendance(selectedDate) {
    if (!academyId || loading) return;

    loading = true;
    attendanceRows = [];
    currentView = "attendance";
    setLoadingState(true);

    pageDate.textContent = formatDate(selectedDate);
    selectedDateLabel.textContent =
      selectedDate === today
        ? "Today's attendance"
        : `Attendance for ${formatDate(selectedDate)}`;

    sessionDetails.textContent = "Loading class-wise attendance...";
    classesContainer.innerHTML = `
      <div class="attendance-empty-state">
        <h3>Loading attendance</h3>
        <p>Please wait while attendance records are retrieved.</p>
      </div>
    `;

    try {
      const [classesSnapshot, studentsSnapshot] = await Promise.all([
        getDocs(query(
          collection(db, "classes"),
          where("academyId", "==", academyId)
        )),
        getDocs(query(
          collection(db, "users"),
          where("academyId", "==", academyId),
          where("role", "==", "student"),
          where("isActive", "==", true)
        ))
      ]);

      const classes = classesSnapshot.docs
        .map((item) => ({ id: item.id, ...item.data() }))
        .filter((item) => item.status === "active");
          classScheduleCache = classes;
      const students = studentsSnapshot.docs
        .map((item) => ({ id: item.id, ...item.data() }))
        .sort((a, b) => getStudentName(a).localeCompare(getStudentName(b)));

        studentDirectory = students.map((student) => ({
        studentId: student.id,
        studentName: getStudentName(student),
        email: student.email || ""
      }));

      populateIndividualStudentSelect();
      populateDownloadStudentSelect();

      const scheduledClasses = classes.filter((item) =>
        hasClassOnDate(item, selectedDate)
      );

      if (!scheduledClasses.length) {
      renderWeeklySchedule(classes, selectedDate);

      sessionDetails.textContent =
        `No schedule for Today !  ${formatDate(selectedDate)}. Check this week's classes schedule below.`;

      return;
    }

      const results = [];

      for (const classItem of scheduledClasses) {
        results.push(
          await getClassAttendance(classItem, students, selectedDate)
        );
      }

      attendanceRows = results.flatMap((item) =>
        item.records.map((record) => ({
          date: selectedDate,
          className: item.className,
          subject: item.subject,
          studentName: record.studentName,
          studentId: record.studentId,
          email: record.email,
          classStartTime: record.classStartTime || item.classStartTime || "",
          checkInAt: record.checkInAt || null,
          classEndTime: record.classEndTime || item.classEndTime || "",
          checkOutAt: record.checkOutAt || null,
          loginDetails: record.loginDetails || {},
          loginAt: firstValue(record.loginDetails || {}, [
            "loginAt", "loggedInAt", "lastLoginAt", "sessionStartedAt"
          ]),
          logoutAt: firstValue(record.loginDetails || {}, [
            "logoutAt", "loggedOutAt", "sessionEndedAt"
          ]),
          classDuration: calculateClassDuration(
            record.classStartTime || item.classStartTime,
            record.classEndTime || item.classEndTime
          ),
          loginDuration: calculateRecordedLoginDuration({
            ...record,
            ...(record.loginDetails || {})
          }),
          status: record.status
        }))
      );

      renderAttendance(results, selectedDate);
    } catch (error) {
      console.error("Failed to load attendance:", error);
      showMessage(getErrorMessage(error));
    } finally {
      loading = false;
      setLoadingState(false);
    }
  }

  function hasClassOnDate(classItem, selectedDate) {
    if (!Array.isArray(classItem.sessions)) return false;

    return classItem.sessions.some((session) => {
      if (!session || session.date !== selectedDate) return false;

      const status = String(session.status || "").toLowerCase();
      return status !== "cancelled" && status !== "canceled";
    });
  }

  async function getClassAttendance(classItem, students, selectedDate) {
    const attendanceQuery = query(
      collection(db, "attendance"),
      where("academyId", "==", academyId),
      where("classId", "==", classItem.id),
      where("date", "==", selectedDate)
    );

    const existingSnapshot = await getDocs(attendanceQuery);
    const recordsByStudent = new Map();

    existingSnapshot.docs.forEach((item) => {
      const record = item.data();

      if (record.studentId) {
        recordsByStudent.set(record.studentId, {
          ...record,
          documentId: item.id
        });
      }
    });

    const missingStudents = students.filter(
      (student) => !recordsByStudent.has(student.id)
    );

    for (let start = 0; start < missingStudents.length; start += 400) {
      const batch = writeBatch(db);
      const chunk = missingStudents.slice(start, start + 400);

      chunk.forEach((student) => {
        const attendanceId = `${classItem.id}_${selectedDate}_${student.id}`;
        const attendanceRef = doc(db, "attendance", attendanceId);

        batch.set(attendanceRef, {
          academyId,
          classId: classItem.id,
          className: classItem.name || classItem.className || "Class",
          subject: classItem.subject || "",
          teacherId: classItem.teacherId || "",
          teacherName: classItem.teacherName || "",
          date: selectedDate,
          studentId: student.id,
          studentName: getStudentName(student),
          status: "absent",
          markedBy: auth.currentUser.uid,
          updatedAt: serverTimestamp()
        });

        recordsByStudent.set(student.id, {
          studentId: student.id,
          studentName: getStudentName(student),
          status: "absent"
        });
      });

      await batch.commit();
    }

    if (missingStudents.length) {
      try {
        await recordAcademyAdminActivity({
          action: "attendance_saved",
          title: "Missing attendance marked absent",
          details: `${classItem.className || classItem.name || "Class"} · ${selectedDate} · ${missingStudents.length} absent record(s) created`,
          actionType: "attendance",
          entityId: classItem.id,
          entityType: "class"
        });
      } catch (error) {
        console.error("Could not record attendance activity:", error);
      }
    }

    const daySessions = (Array.isArray(classItem.sessions) ? classItem.sessions : [])
      .filter((session) => session && session.date === selectedDate);

    const defaultSession = daySessions[0] || {};

    const records = students.map((student) => {
      const existing = recordsByStudent.get(student.id);
      const loginDetails = extractLoginDetails(existing || {}, student);

      return {
        studentId: student.id,
        studentName: existing?.studentName || getStudentName(student),
        email: student.email || existing?.email || "",
        classStartTime: existing?.startTime || defaultSession.startTime || "",
        checkInAt: existing?.checkInAt || existing?.checkedInAt || null,
        classEndTime: existing?.endTime || defaultSession.endTime || "",
        checkOutAt: existing?.checkOutAt || existing?.checkedOutAt || null,
        loginDetails,
        status: normalizeStatus(existing?.status || "absent")
      };
    });

    return {
      classId: classItem.id,
      className: classItem.name || classItem.className || "Class",
      subject: classItem.subject || "",
      classStartTime: defaultSession.startTime || "",
      classEndTime: defaultSession.endTime || "",
      records
    };
  }
    function renderAttendance(classResults, selectedDate) {
    currentView = "attendance";

    if (!classResults.length) {
      renderWeeklySchedule([], selectedDate);
      return;
    }

    const totals = { students: 0, present: 0, absent: 0, late: 0 };

    classResults.forEach((classItem) => {
      totals.students += classItem.records.length;

      classItem.records.forEach((record) => {
        const status = normalizeStatus(record.status);
        if (status === "present") totals.present++;
        if (status === "absent") totals.absent++;
        if (status === "late") totals.late++;
      });
    });

    sessionDetails.textContent =
      `${classResults.length} class(es) · ${totals.students} student record(s)`;

    classesContainer.innerHTML = classResults.map((classItem) => {
      const present = countStatus(classItem.records, "present");
      const absent = countStatus(classItem.records, "absent");
      const late = countStatus(classItem.records, "late");

      const rows = classItem.records.map((record) => {
        const searchText =
          `${record.studentName} ${record.email || ""}`.toLowerCase();

        const loginAt = firstValue(record.loginDetails || {}, [
          "loginAt", "loggedInAt", "lastLoginAt", "sessionStartedAt"
        ]);

        return `
          <tr data-student-id="${escapeHTML(record.studentId)}"
              data-search="${escapeHTML(searchText)}">
            <td>${escapeHTML(record.studentName)}</td>
            <td>${escapeHTML(record.email || "—")}</td>
            <td>${escapeHTML(record.classStartTime || classItem.classStartTime || "—")}</td>
            <td>${escapeHTML(formatTimestamp(record.checkInAt))}</td>
            <td>${escapeHTML(record.classEndTime || classItem.classEndTime || "—")}</td>
            <td>${escapeHTML(formatTimestamp(record.checkOutAt))}</td>
            <td>${escapeHTML(calculateClassDuration(
              record.classStartTime || classItem.classStartTime,
              record.classEndTime || classItem.classEndTime
            ))}</td>
            <td>${escapeHTML(formatTimestamp(loginAt))}</td>
          </tr>
        `;
      }).join("");

      return `
        <section class="attendance-class-section">
          <div class="attendance-class-heading">
            <div>
              <h3>${escapeHTML(classItem.className)}</h3>
              <p>${escapeHTML(classItem.subject || "Subject not specified")}</p>
            </div>

            <div class="attendance-counts">
              <span>Total: ${classItem.records.length}</span>
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
                  <th>Class Start Time</th>
                  <th>Check-in Time</th>
                  <th>Class End Time</th>
                  <th>Check-out Time</th>
                  <th>Class Duration</th>
                  <th>Student Login Time</th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
        </section>
      `;
    }).join("");

    populateIndividualStudentSelect();
    filterAttendanceTable(
      individualStudentSearch?.value.trim().toLowerCase() || ""
    );
  }

function populateIndividualStudentSelect() {
  updateStudentDropdown(individualStudentSelect);
}

function populateDownloadStudentSelect() {
  updateStudentDropdown(downloadStudentSelect);
}

function updateStudentDropdown(selectElement) {
  if (!selectElement) return;

  const previousValue = selectElement.value;

  selectElement.innerHTML = '<option value="">Select a student</option>';

  [...studentDirectory]
    .sort((a, b) => a.studentName.localeCompare(b.studentName))
    .forEach((student) => {
      const option = document.createElement("option");
      option.value = student.studentId;
      option.textContent =
        `${student.studentName} (${student.email || "No email"})`;

      selectElement.appendChild(option);
    });

  if (
    previousValue &&
    studentDirectory.some((student) => student.studentId === previousValue)
  ) {
    selectElement.value = previousValue;
  }
}

  function filterAttendanceTable(searchTerm = "", studentId = "") {
    document.querySelectorAll(
      "#attendance-classes-container tbody tr[data-student-id]"
    ).forEach((row) => {
      const matchesStudent =
        !studentId || row.dataset.studentId === studentId;

      const matchesSearch =
        !searchTerm || (row.dataset.search || "").includes(searchTerm);

      row.hidden = !(matchesStudent && matchesSearch);
    });

    document.querySelectorAll(
      "#attendance-classes-container .attendance-class-section"
    ).forEach((section) => {
      const visible = section.querySelectorAll(
        "tbody tr[data-student-id]:not([hidden])"
      );

      section.hidden = visible.length === 0;
    });
  }

  function showIndividualStudentDetails(record) {
    if (!individualStudentDetails) return;

    const login = record.loginDetails || {};
    const history = Array.isArray(login.loginHistory)
      ? login.loginHistory
      : Array.isArray(login.sessions) ? login.sessions : [];

    const fields = [
      ["Student", record.studentName],
      ["Email", record.email || "—"],
      ["Class", record.className || "—"],
      ["Class start time", record.classStartTime || "—"],
      ["Check-in time", formatTimestamp(record.checkInAt)],
      ["Class end time", record.classEndTime || "—"],
      ["Check-out time", formatTimestamp(record.checkOutAt)],
      ["Class duration", record.classDuration || calculateClassDuration(
        record.classStartTime, record.classEndTime
      )],
      ["Student login time", formatTimestamp(record.loginAt)],
      ["Student logout time", formatTimestamp(record.logoutAt)],
      ["Login duration", calculateRecordedLoginDuration(login)]
    ];

    const fieldsHTML = fields.map(([label, value]) =>
      `<p><strong>${escapeHTML(label)}:</strong> ${escapeHTML(value)}</p>`
    ).join("");

    const historyHTML = history.length
      ? `<h4>Login history</h4>${history.map((entry, index) => `
          <p>
            <strong>Session ${index + 1}</strong><br>
            Login: ${escapeHTML(formatTimestamp(firstValue(entry, [
              "loginAt", "loggedInAt", "startedAt", "startTime"
            ])))}<br>
            Logout: ${escapeHTML(formatTimestamp(firstValue(entry, [
              "logoutAt", "loggedOutAt", "endedAt", "endTime"
            ])))}<br>
            Duration: ${escapeHTML(calculateRecordedLoginDuration(entry))}
          </p>
        `).join("")}`
      : "<p><strong>Login history:</strong> Not recorded in available data.</p>";

    individualStudentDetails.innerHTML =
      `<h4>Individual Student Details</h4>${fieldsHTML}${historyHTML}`;
  }

  function renderWeeklySchedule(classes, selectedDate) {
    currentView = "week";
    attendanceRows = [];
    downloadButton.disabled = false;

    const start = getStartOfWeek(selectedDate);
    const weekDates = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(start);
      date.setDate(date.getDate() + index);
      return getLocalDateString(date);
    });

    const weekClasses = classes
      .filter((item) => item.status === "active")
      .map((classItem) => ({
        classItem,
        sessions: (classItem.sessions || []).filter((session) => {
          if (!session || !weekDates.includes(session.date)) return false;
          const status = String(session.status || "").toLowerCase();
          return status !== "cancelled" && status !== "canceled";
        })
      }))
      .filter((item) => item.sessions.length);

    pageDate.textContent = `${formatDate(weekDates[0])} – ${formatDate(weekDates[6])}`;
    selectedDateLabel.textContent = "Weekly class schedule";
    sessionDetails.textContent =
    `No schedule for Today !${formatDate(selectedDate)}. Check this week's classes schedule below.`;

    if (!weekClasses.length) {
      classesContainer.innerHTML = `
        <div class="attendance-empty-state">
          <h3>No classes scheduled this week</h3>
          <p>There are no scheduled class sessions in this week.</p>
        </div>
      `;
      return;
    }

    classesContainer.innerHTML = `
      <section class="attendance-class-section">
        <div class="attendance-class-heading">
          <div>
            <h3>This Week's Classes</h3>
            <p>${escapeHTML(formatDate(weekDates[0]))} – ${escapeHTML(formatDate(weekDates[6]))}</p>
          </div>
        </div>

        <div class="attendance-table-wrapper">
          <table class="attendance-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Class</th>
                <th>Subject</th>
                <th>Start Time</th>
                <th>End Time</th>
              </tr>
            </thead>
            <tbody>
              ${weekClasses.flatMap(({ classItem, sessions }) =>
                sessions.map((session) => `
                  <tr>
                    <td>${escapeHTML(formatDate(session.date))}</td>
                    <td>${escapeHTML(classItem.name || classItem.className || "Class")}</td>
                    <td>${escapeHTML(classItem.subject || "—")}</td>
                    <td>${escapeHTML(session.startTime || "—")}</td>
                    <td>${escapeHTML(session.endTime || "—")}</td>
                  </tr>
                `)
              ).join("")}
            </tbody>
          </table>
        </div>
      </section>
    `;
  }

  function downloadAttendanceCSV() {
    if (currentView !== "attendance" || attendanceRows.length === 0) {
      showMessage("There is no attendance data to download.");
      return;
    }

    const headers = [
      "Date", "Class", "Subject", "Student Name", "Student ID", "Email",
      "Class Start Time", "Check-in Time", "Class End Time", "Check-out Time",
      "Class Duration", "Student Login Time", "Login Duration", "Status"
    ];

    const lines = [
      headers,
      ...attendanceRows.map((row) => [
        row.date,
        row.className,
        row.subject,
        row.studentName,
        row.studentId,
        row.email,
        row.classStartTime,
        formatTimestamp(row.checkInAt),
        row.classEndTime,
        formatTimestamp(row.checkOutAt),
        row.classDuration,
        formatTimestamp(row.loginAt),
        row.loginDuration,
        capitalize(row.status)
      ])
    ];

    const csv = "\uFEFF" + lines
      .map((line) => line.map(csvEscape).join(","))
      .join("\r\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = `attendance-${dateInput.value || today}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();

    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function loadIndividualMonthlyAttendance(studentId, month) {
  if (!academyId) return;

  const [year, monthNumber] = month.split("-").map(Number);
  const startDate = `${month}-01`;
  const endDate = getLocalDateString(
    new Date(year, monthNumber, 0)
  );

  if (individualStudentDetails) {
    individualStudentDetails.textContent = "Loading monthly records...";
  }

  try {
    const rows = await fetchAttendanceRecords(
      startDate,
      endDate,
      studentId
    );

    const student = studentDirectory.find(
      (item) => item.studentId === studentId
    );

    const studentName = student?.studentName || "Student";
    const studentEmail = student?.email || "";

    attendanceRows = rows.map((record) =>
      normalizeAttendanceRecord(record, studentDirectory)
    );

    currentView = "monthly";

    pageDate.textContent = `${formatDate(startDate)} – ${formatDate(endDate)}`;
    selectedDateLabel.textContent = `${studentName} — Monthly Attendance`;
    sessionDetails.textContent =
      `${studentEmail ? `${studentEmail} · ` : ""}${rows.length} attendance record(s) found`;

    if (!rows.length) {
      classesContainer.innerHTML = `
        <div class="attendance-empty-state">
          <h3>No records found</h3>
          <p>No attendance records were found for ${escapeHTML(studentName)} in ${escapeHTML(month)}.</p>
        </div>
      `;

      if (individualStudentDetails) {
        individualStudentDetails.textContent =
          "No attendance records were found for this student and month.";
      }

      return;
    }

    classesContainer.innerHTML = `
      <section class="attendance-class-section">
        <div class="attendance-monthly-heading">
          <h3>${escapeHTML(studentName)} — ${escapeHTML(month)}</h3>
          <p>Daily attendance and recorded login/logout details</p>
        </div>

        <div class="attendance-table-wrapper">
          <table class="attendance-monthly-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Class</th>
                <th>Class Start</th>
                <th>Check-in</th>
                <th>Class End</th>
                <th>Check-out</th>
                <th>Login</th>
                <th>Logout</th>
                <th>Login Duration</th>
                <th>Attendance</th>
              </tr>
            </thead>
            <tbody>
              ${attendanceRows
                .sort((a, b) =>
                  String(a.date).localeCompare(String(b.date))
                )
                .map((row) => `
                  <tr>
                    <td>${escapeHTML(row.date ? formatDate(row.date) : "—")}</td>
                    <td>${escapeHTML(row.className || "—")}</td>
                    <td>${escapeHTML(row.classStartTime || "—")}</td>
                    <td>${escapeHTML(formatTimestamp(row.checkInAt))}</td>
                    <td>${escapeHTML(row.classEndTime || "—")}</td>
                    <td>${escapeHTML(formatTimestamp(row.checkOutAt))}</td>
                    <td>${escapeHTML(formatTimestamp(row.loginAt))}</td>
                    <td>${escapeHTML(formatTimestamp(row.logoutAt))}</td>
                    <td>${escapeHTML(row.loginDuration || "Not tracked")}</td>
                    <td>${escapeHTML(capitalize(row.status || "unknown"))}</td>
                  </tr>
                `).join("")}
            </tbody>
          </table>
        </div>
      </section>
    `;

    if (individualStudentDetails) {
      individualStudentDetails.textContent =
        `${rows.length} record(s) loaded for ${studentName}, ${month}.`;
    }
  } catch (error) {
    console.error("Unable to load monthly student attendance:", error);

    if (individualStudentDetails) {
      individualStudentDetails.textContent =
        getErrorMessage(error);
    }
  }
}

async function fetchAttendanceRecords(startDate, endDate, studentId = "") {
  const constraints = [
    where("academyId", "==", academyId),
    where("date", ">=", startDate),
    where("date", "<=", endDate)
  ];

  const snapshot = await getDocs(
    query(collection(db, "attendance"), ...constraints)
  );

  return snapshot.docs
    .map((item) => ({
      id: item.id,
      ...item.data()
    }))
    .filter((record) => !studentId || record.studentId === studentId)
    .sort((a, b) => {
      const dateCompare = String(a.date || "").localeCompare(String(b.date || ""));
      if (dateCompare !== 0) return dateCompare;

      return String(a.studentName || "").localeCompare(
        String(b.studentName || "")
      );
    });
}

function getClassSessionTime(classId, date, field) {
  const classItem = classScheduleCache.find(
    (item) => item.id === classId
  );

  const session = classItem?.sessions?.find(
    (item) => item.date === date
  );

  return session?.[field] || "";
}

function normalizeAttendanceRecord(record, directory = studentDirectory) {
  const student = directory.find(
    (item) => item.studentId === record.studentId
  );

  const loginDetails = extractLoginDetails(record, student || {});
  const loginAt = firstValue(record, [
    "loginAt", "loggedInAt", "lastLoginAt", "sessionStartedAt"
  ]) || firstValue(loginDetails, [
    "loginAt", "loggedInAt", "lastLoginAt", "sessionStartedAt"
  ]);

  const logoutAt = firstValue(record, [
    "logoutAt", "loggedOutAt", "sessionEndedAt"
  ]) || firstValue(loginDetails, [
    "logoutAt", "loggedOutAt", "sessionEndedAt"
  ]);

  return {
    ...record,
    studentName: record.studentName || student?.studentName || "Unknown student",
    email: record.email || student?.email || "",
    className: record.className || record.class || "—",
    classStartTime:
    record.startTime ||
    record.classStartTime ||
    getClassSessionTime(record.classId, record.date, "startTime"),

  classEndTime:
    record.endTime ||
    record.classEndTime ||
    getClassSessionTime(record.classId, record.date, "endTime"),
    checkInAt: record.checkInAt || record.checkedInAt || null,
    checkOutAt: record.checkOutAt || record.checkedOutAt || null,
    loginAt,
    logoutAt,
    loginDuration: calculateRecordedLoginDuration({
      ...record,
      ...loginDetails,
      loginAt,
      logoutAt
    }),
    status: normalizeStatus(record.status || "unknown")
  };
}

async function exportSelectedReport() {
  if (!academyId) {
    showMessage("Administrator profile is not ready yet.");
    return;
  }

  const reportType = downloadReportType?.value || "all-month";
  const selectedStudentId = downloadStudentSelect?.value || "";
  const selectedMonth = downloadMonth?.value || "";
  let startDate = "";
  let endDate = "";
  let studentId = "";

  if (reportType === "all-month") {
    if (!selectedMonth) {
      showMessage("Select a month for the report.");
      return;
    }

    startDate = `${selectedMonth}-01`;

    const [year, monthNumber] = selectedMonth.split("-").map(Number);
    endDate = getLocalDateString(new Date(year, monthNumber, 0));
  }

  if (reportType === "student-month") {
    if (!selectedStudentId || !selectedMonth) {
      showMessage("Select both a student and a month.");
      return;
    }

    studentId = selectedStudentId;
    startDate = `${selectedMonth}-01`;

    const [year, monthNumber] = selectedMonth.split("-").map(Number);
    endDate = getLocalDateString(new Date(year, monthNumber, 0));
  }

  if (reportType === "all-range") {
    startDate = downloadStartDate?.value || "";
    endDate = downloadEndDate?.value || "";

    if (!startDate || !endDate || startDate > endDate) {
      showMessage("Choose a valid start date and end date.");
      return;
    }
  }

  if (reportType === "student-current-month") {
    if (!selectedStudentId) {
      showMessage("Select a student.");
      return;
    }

    studentId = selectedStudentId;

    const currentMonth = getLocalDateString(new Date()).slice(0, 7);
    startDate = `${currentMonth}-01`;

    const [year, monthNumber] = currentMonth.split("-").map(Number);
    endDate = getLocalDateString(new Date(year, monthNumber, 0));
  }

  exportAttendanceButton.disabled = true;
  exportAttendanceButton.textContent = "Preparing CSV...";

  try {
    const records = await fetchAttendanceRecords(
      startDate,
      endDate,
      studentId
    );

    if (!records.length) {
      showMessage("No attendance records were found for those filters.");
      return;
    }

    const rows = records.map((record) =>
      normalizeAttendanceRecord(record, studentDirectory)
    );

    const headers = [
      "Date",
      "Student Name",
      "Student ID",
      "Email",
      "Class",
      "Class Start Time",
      "Check-in Time",
      "Class End Time",
      "Check-out Time",
      "Student Login Time",
      "Student Logout Time",
      "Login Duration",
      "Attendance"
    ];

    const csvRows = [
      headers,
      ...rows.map((row) => [
        row.date || "",
        row.studentName,
        row.studentId || "",
        row.email,
        row.className,
        row.classStartTime,
        formatTimestamp(row.checkInAt),
        row.classEndTime,
        formatTimestamp(row.checkOutAt),
        formatTimestamp(row.loginAt),
        formatTimestamp(row.logoutAt),
        row.loginDuration,
        capitalize(row.status)
      ])
    ];

    const csv = "\uFEFF" + csvRows
      .map((row) => row.map(csvEscape).join(","))
      .join("\r\n");

    const blob = new Blob([csv], {
      type: "text/csv;charset=utf-8;"
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download =
      `attendance-${reportType}-${startDate}-to-${endDate}.csv`;

    document.body.appendChild(link);
    link.click();
    link.remove();

    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (error) {
    console.error("Attendance export failed:", error);
    showMessage(getErrorMessage(error));
  } finally {
    exportAttendanceButton.disabled = false;
    exportAttendanceButton.textContent = "Download CSV";
  }
}

function setLoadingState(isLoading) {
  changeDateButton.disabled = isLoading;
  downloadButton.disabled = isLoading;
}

  function showMessage(message) {
    sessionDetails.textContent = message;

    classesContainer.innerHTML = `
      <div class="attendance-empty-state">
        <p>${escapeHTML(message)}</p>
      </div>
    `;
  }

  function getStudentName(student) {
    return (
      student.fullName ||
      student.name ||
      [student.firstName, student.lastName].filter(Boolean).join(" ") ||
      student.email ||
      "Unnamed student"
    );
  }

  function normalizeStatus(status) {
    const value = String(status || "absent").toLowerCase();

    if (["present", "absent", "late", "excused"].includes(value)) {
      return value;
    }

    return "other";
  }

  function statusClass(status) {
    return {
      present: "attendance-status-present",
      absent: "attendance-status-absent",
      late: "attendance-status-late",
      excused: "attendance-status-excused",
      other: "attendance-status-other"
    }[normalizeStatus(status)];
  }

  function countStatus(records, status) {
    return records.filter(
      (record) => normalizeStatus(record.status) === status
    ).length;
  }

  function firstValue(object, keys) {
    for (const key of keys) {
      if (
        object &&
        object[key] !== undefined &&
        object[key] !== null &&
        object[key] !== ""
      ) {
        return object[key];
      }
    }

    return null;
  }

  function toDate(value) {
    if (!value) return null;

    if (typeof value.toDate === "function") return value.toDate();
    if (value instanceof Date) return value;

    if (typeof value === "number" || typeof value === "string") {
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? null : date;
    }

    if (typeof value === "object" && Number.isFinite(value.seconds)) {
      return new Date(value.seconds * 1000);
    }

    return null;
  }

  function formatTimestamp(value) {
    const date = toDate(value);
    if (!date) return "—";

    return date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  function parseClassTime(value) {
    if (!value || typeof value !== "string") return null;

    const match = value.match(/^(\d{1,2}):(\d{2})(?:\s*(AM|PM))?$/i);
    if (!match) return null;

    let hours = Number(match[1]);
    const minutes = Number(match[2]);
    const suffix = (match[3] || "").toUpperCase();

    if (minutes > 59 || hours > 23) return null;

    if (suffix === "PM" && hours < 12) hours += 12;
    if (suffix === "AM" && hours === 12) hours = 0;

    return hours * 60 + minutes;
  }

  function calculateClassDuration(startTime, endTime) {
    const start = parseClassTime(startTime);
    const end = parseClassTime(endTime);

    if (start === null || end === null) return "—";

    let minutes = end - start;
    if (minutes < 0) minutes += 24 * 60;

    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;

    if (hours && remainingMinutes) {
      return `${hours} hr ${remainingMinutes} min`;
    }

    if (hours) return `${hours} hr`;
    return `${remainingMinutes} min`;
  }

  function calculateRecordedLoginDuration(record) {
    const direct = firstValue(record, [
      "loginDuration", "sessionDuration", "activeDuration"
    ]);

    if (typeof direct === "string" && direct.trim()) return direct;

    if (typeof direct === "number" && Number.isFinite(direct)) {
      const minutes = Math.max(0, Math.round(direct));

      return minutes >= 60
        ? `${Math.floor(minutes / 60)} hr${minutes % 60 ? ` ${minutes % 60} min` : ""}`
        : `${minutes} min`;
    }

    const start = toDate(firstValue(record, [
      "loginAt", "loggedInAt", "sessionStartedAt", "startedAt"
    ]));

    const end = toDate(firstValue(record, [
      "logoutAt", "loggedOutAt", "sessionEndedAt", "endedAt"
    ]));

    if (!start || !end || end < start) return "Not tracked";

    const minutes = Math.round((end.getTime() - start.getTime()) / 60000);

    return minutes >= 60
      ? `${Math.floor(minutes / 60)} hr${minutes % 60 ? ` ${minutes % 60} min` : ""}`
      : `${minutes} min`;
  }

  function extractLoginDetails(attendanceRecord, student) {
    const candidates = [
      attendanceRecord.loginDetails,
      attendanceRecord.sessionDetails,
      attendanceRecord,
      student?.loginDetails,
      student?.sessionDetails,
      student || {}
    ].filter((value) => value && typeof value === "object");

    const result = {};

    for (const candidate of candidates) {
      for (const key of [
        "loginAt", "loggedInAt", "lastLoginAt", "sessionStartedAt",
        "logoutAt", "loggedOutAt", "sessionEndedAt",
        "loginDuration", "sessionDuration", "activeDuration",
        "loginHistory", "sessions"
      ]) {
        if (result[key] === undefined && candidate[key] !== undefined) {
          result[key] = candidate[key];
        }
      }
    }

    return result;
  }

  function getLocalDateString(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
  }

  function formatDate(dateString) {
    const [year, month, day] = dateString.split("-").map(Number);
    const date = new Date(year, month - 1, day);

    return date.toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
      year: "numeric"
    });
  }

  function getStartOfWeek(dateString) {
    const [year, month, day] = dateString.split("-").map(Number);
    const date = new Date(year, month - 1, day);
    const weekday = date.getDay();
    const offset = weekday === 0 ? -6 : 1 - weekday;

    date.setDate(date.getDate() + offset);
    return date;
  }

  function capitalize(value) {
    const text = String(value || "");
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  function csvEscape(value) {
    return `"${String(value ?? "").replace(/"/g, '""')}"`;
  }

  function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[character]);
  }

  function getErrorMessage(error) {
    if (error?.code === "permission-denied") {
      return "Firestore denied access. Check your attendance and student security rules.";
    }

    if (error?.code === "failed-precondition") {
      return "Firestore requires an index for one of the queries. Check the browser console for the index link.";
    }

    return error?.message || "An unexpected error occurred.";
  }
});