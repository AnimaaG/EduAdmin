import { auth, db } from "./firebase-config.js";

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";

import { recordAcademyAdminActivity } from "./admin-activity.js";

document.addEventListener("DOMContentLoaded", () => {
  const message = document.getElementById("classes-message");
  const tableBody = document.getElementById("classes-table-body");
  const searchInput = document.getElementById("class-search");
  const statusFilter = document.getElementById("class-status-filter");

  // Tab 1: Create Class
  const classCreateForm = document.getElementById("class-create-form");
  const createClassName = document.getElementById("create-class-name");
  const createClassStatus = document.getElementById("create-class-status");
  const createClassDescription = document.getElementById("create-class-description");

  // Tab 2: Add Subject & Schedule
  const subjectScheduleForm = document.getElementById("subject-schedule-form");
  const targetClassSelect = document.getElementById("target-class-select");
  const subjectNameInput = document.getElementById("subject-name-input");
  const subjectTeacherSelect = document.getElementById("subject-teacher-select");
  const subjectStartTime = document.getElementById("subject-start-time");
  const subjectEndTime = document.getElementById("subject-end-time");
  const bookedSlotsNotice = document.getElementById("booked-slots-notice");

  // Calendar elements for Tab 2
  const calendarDays = document.getElementById("class-calendar-days");
  const calendarMonthLabel = document.getElementById("calendar-month-label");
  const previousMonthButton = document.getElementById("calendar-previous-month");
  const nextMonthButton = document.getElementById("calendar-next-month");
  const selectedDateCount = document.getElementById("class-selected-date-count");

  // Tab 3: Timetable
  const timetableClassFilter = document.getElementById("timetable-class-filter");
  const timetableDateSearch = document.getElementById("timetable-date-search");
  const clearDateSearchBtn = document.getElementById("clear-date-search");
  const timetableBody = document.getElementById("class-timetable-body");

  // Edit Modal elements
  const editModal = document.getElementById("edit-class-modal");
  const editClassForm = document.getElementById("edit-class-form");
  const editClassId = document.getElementById("edit-class-id");
  const editClassName = document.getElementById("edit-class-name");
  const editClassStatus = document.getElementById("edit-class-status");
  const editClassDescription = document.getElementById("edit-class-description");
  const editSubjectsContainer = document.getElementById("edit-subjects-container");
  const addEditSubjectBtn = document.getElementById("add-edit-subject-btn");
  const closeEditModalBtn = document.getElementById("close-edit-modal");
  const cancelEditModalBtn = document.getElementById("cancel-edit-modal");

  // --- Schedule Analytics Cards Integration ---
  const scheduleTotalCount = document.getElementById("schedule-total-count");
  const scheduleCompletedCount = document.getElementById("schedule-completed-count");
  const schedulePendingCount = document.getElementById("schedule-pending-count");
  const scheduleCancelledCount = document.getElementById("schedule-cancelled-count");
  const scheduleChart = document.getElementById("schedule-status-chart");
  const scheduleChartMessage = document.getElementById("schedule-chart-message");

  let allFlattenedSessions = [];

  if (
    !message ||
    !tableBody ||
    !classCreateForm ||
    !subjectScheduleForm ||
    !targetClassSelect ||
    !subjectNameInput ||
    !subjectTeacherSelect ||
    !subjectStartTime ||
    !subjectEndTime ||
    !calendarDays ||
    !calendarMonthLabel ||
    !previousMonthButton ||
    !nextMonthButton ||
    !selectedDateCount ||
    !timetableClassFilter ||
    !timetableDateSearch ||
    !clearDateSearchBtn ||
    !timetableBody
  ) {
    console.error("Classes page is missing one or more required HTML elements.");
    return;
  }

  let adminProfile = null;
  let classes = [];
  const teachersById = new Map();
  const selectedDates = new Set();

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let displayedMonth = new Date(today.getFullYear(), today.getMonth(), 1);

  function localDateString(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function parseLocalDate(dateString) {
    const [year, month, day] = dateString.split("-").map(Number);
    return new Date(year, month - 1, day);
  }

  function formatDate(dateString) {
    return parseLocalDate(dateString).toLocaleDateString(undefined, {
      weekday: "long",
      year: "numeric",
      month: "short",
      day: "numeric"
    });
  }

  function getCurrentWeekRange() {
    const d = new Date();
    const day = d.getDay();
    const diffToMonday = d.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(d.setDate(diffToMonday));
    monday.setHours(0, 0, 0, 0);

    const sunday = new Date(monday);
    sunday.setDate(sunday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);

    return { monday, sunday };
  }

  function showMessage(text, type = "info") {
    message.textContent = text;
    message.className = `message ${type}`;
    message.hidden = false;
  }

  function hideMessage() {
    message.textContent = "";
    message.hidden = true;
  }

  function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[character]);
  }

  // ---------------- TABS ----------------
  function activateTab(panelId) {
    document.querySelectorAll("[data-class-tab]").forEach((button) => {
      const active = button.dataset.classTab === panelId;
      button.setAttribute("aria-selected", String(active));
      button.tabIndex = active ? 0 : -1;
    });

    document.querySelectorAll(".class-tab-panel").forEach((panel) => {
      panel.hidden = panel.id !== panelId;
    });
  }

  document.querySelectorAll("[data-class-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      activateTab(button.dataset.classTab);
    });
  });

  // ---------------- ROBUST VALIDATION HELPER ----------------
  function validateClassSchedule(academyClasses, targetClassId, subjectsToCheck, isEditing = false) {
    for (const subA of subjectsToCheck) {
      if (!subA.subName || !subA.tId || !subA.startT || !subA.endT || subA.datesSet.size === 0) {
        continue;
      }

      if (subA.startT >= subA.endT) {
        return { error: `End time must be later than start time for "${subA.subName}".`, targetCard: subA };
      }

      for (const dateA of subA.datesSet) {
        // 1. Class-wise Time Conflict Check (Within the SAME class)
        const targetCls = academyClasses.find(c => c.id === targetClassId);
        if (targetCls) {
          const existingSubjects = isEditing ? [] : (targetCls.subjects || []); // If editing, we validate against parsedCards directly
          for (const extSubj of existingSubjects) {
            // If adding sessions to the exact same subject name, overlapping with itself on different dates is fine, 
            // but if the same subject has another session at that time, or a different subject does:
            const sessions = extSubj.sessions || [];
            for (const sess of sessions) {
              if (sess.date !== dateA) continue;
              if (subA.startT < sess.endTime && subA.endT > sess.startTime) {
                return {
                  error: `Time conflict on ${dateA}: Overlaps with existing subject "${extSubj.subjectName}" in this class (${sess.startTime}–${sess.endTime}).`,
                  targetCard: subA
                };
              }
            }
          }
        }

        // Check internal time overlaps among subjects being added/edited simultaneously in this class
        for (const subB of subjectsToCheck) {
          if (subA === subB) continue;
          if (!subB.datesSet.has(dateA)) continue;

          if (subA.startT < subB.endT && subA.endT > subB.startT) {
            return {
              error: `Internal time conflict on ${dateA}: "${subA.subName}" overlaps with another subject "${subB.subName}" in this class (${subA.startT}–${subA.endT} vs ${subB.startT}–${subB.endT}).`,
              targetCard: subA
            };
          }
        }

        // 2. Academy-wide Teacher Conflict Check (Across ALL classes)
        for (const cls of academyClasses) {
          const subjects = Array.isArray(cls.subjects) ? cls.subjects : [];
          for (const subj of subjects) {
            const sessions = Array.isArray(subj.sessions) ? subj.sessions : [];
            for (const sess of sessions) {
              if (sess.date !== dateA) continue;

              // If the teacher is assigned to another class or another subject at this time
              if (subA.tId && subj.teacherId === subA.tId) {
                // If it's the same class and same subject name during edit, ignore self-collision
                if (isEditing && cls.id === targetClassId && subj.subjectName.toLowerCase() === subA.subName.toLowerCase()) {
                  continue;
                }

                if (subA.startT < sess.endTime && subA.endT > sess.startTime) {
                  const tName = teachersById.get(subA.tId) || "Teacher";
                  const locationDesc = (cls.id === targetClassId) ? `another subject ("${subj.subjectName}") in this class` : `class "${cls.className}" ("${subj.subjectName}")`;
                  return {
                    error: `Teacher conflict on ${dateA}: ${tName} is already assigned to ${locationDesc} from ${sess.startTime} to ${sess.endTime}.`,
                    targetCard: subA
                  };
                }
              }
            }
          }
        }
      }
    }
    return null;
  }

  // ---------------- CALENDAR ----------------
  function renderCalendar() {
    const year = displayedMonth.getFullYear();
    const month = displayedMonth.getMonth();

    calendarMonthLabel.textContent = displayedMonth.toLocaleDateString(
      undefined,
      { month: "long", year: "numeric" }
    );

    const firstWeekday = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells = [];

    for (let i = 0; i < firstWeekday; i++) {
      cells.push('<span class="calendar-empty" aria-hidden="true"></span>');
    }

    const selectedClassId = targetClassSelect.value;
    const targetClass = classes.find(c => c.id === selectedClassId);
    const bookedDatesByTime = new Map();

    if (targetClass && Array.isArray(targetClass.subjects)) {
      targetClass.subjects.forEach(subj => {
        (subj.sessions || []).forEach(sess => {
          if (!bookedDatesByTime.has(sess.date)) {
            bookedDatesByTime.set(sess.date, []);
          }
          bookedDatesByTime.get(sess.date).push({ start: sess.startTime, end: sess.endTime, subject: subj.subjectName });
        });
      });
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day);
      const dateKey = localDateString(date);
      const isPast = date < today;
      const isSelected = selectedDates.has(dateKey);
      const isToday = dateKey === localDateString(today);
      const hasBookings = bookedDatesByTime.has(dateKey);

      const cls = [
        isSelected ? "is-selected" : "",
        isToday ? "is-today" : "",
        hasBookings ? "has-bookings" : ""
      ].filter(Boolean).join(" ");

      cells.push(`
        <button
          type="button"
          class="${cls}"
          data-calendar-date="${dateKey}"
          aria-pressed="${isSelected}"
          aria-label="${escapeHTML(formatDate(dateKey))}${hasBookings ? ", has booked time slots" : ""}"
          ${isPast ? "disabled" : ""}
        >${day}</button>
      `);
    }

    calendarDays.innerHTML = cells.join("");
  }

  function updateBookedSlotsNotice() {
    if (!bookedSlotsNotice) return;
    const selectedClassId = targetClassSelect.value;
    const targetClass = classes.find(c => c.id === selectedClassId);
    
    if (!targetClass || !selectedDates.size) {
      bookedSlotsNotice.replaceChildren();
      bookedSlotsNotice.hidden = true;
      return;
    }

    const bookedSessions = [];
    selectedDates.forEach(d => {
      (targetClass.subjects || []).forEach(subj => {
        (subj.sessions || []).forEach(sess => {
          if (sess.date === d) {
            bookedSessions.push({
              date: d,
              day: sess.day || parseLocalDate(d).toLocaleDateString(undefined, { weekday: "long" }),
              subject: subj.subjectName,
              time: `${sess.startTime}–${sess.endTime}`
            });
          }
        });
      });
    });

    if (bookedSessions.length === 0) {
      bookedSlotsNotice.replaceChildren();
      bookedSlotsNotice.hidden = true;
      return;
    }

    bookedSessions.sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));

    bookedSlotsNotice.hidden = false;
    bookedSlotsNotice.innerHTML = `
      <strong style="display:block; margin-bottom:6px; color:#b91c1c;">Existing Booked Timeslots on Selected Dates:</strong>
      <div style="max-height: 160px; overflow-y: auto; border: 1px solid #fecaca; border-radius: 6px; background: #fff;">
        <table style="width: 100%; border-collapse: collapse; font-size: 11px; text-align: left;">
          <thead>
            <tr style="background: #fef2f2; border-bottom: 1px solid #fecaca; position: sticky; top: 0;">
              <th style="padding: 6px 8px; color: #b91c1c;">Date (Day)</th>
              <th style="padding: 6px 8px; color: #b91c1c;">Subject</th>
              <th style="padding: 6px 8px; color: #b91c1c;">Schedule Time</th>
            </tr>
          </thead>
          <tbody>
            ${bookedSessions.map(b => `
              <tr style="border-bottom: 1px solid #f3f4f6;">
                <td style="padding: 6px 8px; color: #374151; white-space: nowrap;">${escapeHTML(b.date)} (${escapeHTML(b.day)})</td>
                <td style="padding: 6px 8px; color: #374151;">${escapeHTML(b.subject)}</td>
                <td style="padding: 6px 8px; color: #374151; white-space: nowrap;">${escapeHTML(b.time)}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  function renderSelectedDates() {
    selectedDateCount.textContent = `${selectedDates.size} date${selectedDates.size === 1 ? "" : "s"} selected`;
    updateBookedSlotsNotice();
  }

  calendarDays.addEventListener("click", event => {
    const button = event.target.closest("[data-calendar-date]");
    if (!button || button.disabled) return;

    const date = button.dataset.calendarDate;
    if (selectedDates.has(date)) {
      selectedDates.delete(date);
    } else {
      selectedDates.add(date);
    }

    renderCalendar();
    renderSelectedDates();
    hideMessage();
  });

  targetClassSelect?.addEventListener("change", () => {
    selectedDates.clear();
    renderCalendar();
    renderSelectedDates();
  });

  previousMonthButton.addEventListener("click", () => {
    displayedMonth = new Date(displayedMonth.getFullYear(), displayedMonth.getMonth() - 1, 1);
    renderCalendar();
  });

  nextMonthButton.addEventListener("click", () => {
    displayedMonth = new Date(displayedMonth.getFullYear(), displayedMonth.getMonth() + 1, 1);
    renderCalendar();
  });

  // ---------------- LOAD DATA ----------------
  async function loadTeachers(academyId) {
    subjectTeacherSelect.innerHTML = '<option value="">Select teacher for this subject...</option>';

    const teacherQuery = query(
      collection(db, "users"),
      where("academyId", "==", academyId),
      where("role", "==", "teacher"),
      where("isActive", "==", true)
    );

    const snapshot = await getDocs(teacherQuery);
    teachersById.clear();

    snapshot.docs.forEach(teacherDoc => {
      const teacher = teacherDoc.data();
      const name = teacher.fullName || teacher.name || teacher.displayName || teacher.email || "Unnamed teacher";
      teachersById.set(teacherDoc.id, name);

      const option = document.createElement("option");
      option.value = teacherDoc.id;
      option.textContent = name;
      subjectTeacherSelect.appendChild(option);
    });
  }

  function updateClassDropdowns() {
    [targetClassSelect, timetableClassFilter].forEach(select => {
      if (!select) return;
      const currentVal = select.value;
      select.replaceChildren();

      const firstOpt = document.createElement("option");
      firstOpt.value = "";
      firstOpt.textContent = select === targetClassSelect ? "Choose a class..." : "All classes";
      select.appendChild(firstOpt);

      classes
        .filter(item => item.status === "active")
        .sort((a, b) => String(a.className || "").localeCompare(String(b.className || "")))
        .forEach(item => {
          const opt = document.createElement("option");
          opt.value = item.id;
          opt.textContent = item.className;
          select.appendChild(opt);
        });

      if (currentVal) select.value = currentVal;
    });
  }

  async function loadClasses(academyId) {
    tableBody.innerHTML = '<tr><td colspan="4">Loading classes...</td></tr>';

    const classesQuery = query(
      collection(db, "classes"),
      where("academyId", "==", academyId)
    );

    const snapshot = await getDocs(classesQuery);

    classes = snapshot.docs.map(classDoc => ({
      id: classDoc.id,
      ...classDoc.data()
    }));

    renderClasses();
    updateClassDropdowns();
    renderClassTimetable();
    updateScheduleAnalytics();
  }

  // ---------------- TAB 1: CREATE CLASS ----------------
  classCreateForm.addEventListener("submit", async event => {
    event.preventDefault();
    hideMessage();

    const className = createClassName.value.trim();
    const status = createClassStatus.value;
    const description = createClassDescription.value.trim();

    if (!className) {
      showMessage("Enter a class name.", "error");
      return;
    }

    try {
      await addDoc(collection(db, "classes"), {
        academyId: adminProfile.academyId,
        className,
        description,
        status,
        subjects: [],
        createdBy: auth.currentUser.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      classCreateForm.reset();
      createClassStatus.value = "active";
      await loadClasses(adminProfile.academyId);
      activateTab("panel-management");
      showMessage("Class created successfully! Now add subjects and schedules.", "success");
    } catch (error) {
      console.error("Could not create class:", error);
      showMessage("Could not create class. Check permissions.", "error");
    }
  });

  // ---------------- TAB 2: ADD SUBJECT & SCHEDULE ----------------
  subjectScheduleForm.addEventListener("submit", async event => {
    event.preventDefault();
    hideMessage();

    const classId = targetClassSelect.value;
    const subjectName = subjectNameInput.value.trim();
    const teacherId = subjectTeacherSelect.value;
    const startTime = subjectStartTime.value;
    const endTime = subjectEndTime.value;

    if (!classId || !subjectName || !teacherId || !startTime || !endTime) {
      showMessage("All fields are required to add a subject and schedule.", "error");
      return;
    }

    if (startTime >= endTime) {
      showMessage("End time must be later than start time.", "error");
      return;
    }

    if (selectedDates.size === 0) {
      showMessage("Select at least one date on the calendar.", "error");
      return;
    }

    const targetClass = classes.find(c => c.id === classId);
    if (!targetClass) {
      showMessage("Selected class not found.", "error");
      return;
    }

    const existingSubjects = Array.isArray(targetClass.subjects) ? [...targetClass.subjects] : [];
    const newDates = [...selectedDates];

    const proposedSubject = [{
      subName: subjectName,
      tId: teacherId,
      startT: startTime,
      endT: endTime,
      datesSet: new Set(newDates)
    }];

    const validationResult = validateClassSchedule(classes, classId, proposedSubject, false);
    if (validationResult) {
      showMessage(validationResult.error, "error");
      return;
    }

    const newSessions = newDates.map(date => ({
      date,
      day: formatDate(date).split(",")[0],
      startTime,
      endTime
    })).sort((a, b) => a.date.localeCompare(b.date));

    const subjectIndex = existingSubjects.findIndex(s => s.subjectName.toLowerCase() === subjectName.toLowerCase());
    if (subjectIndex >= 0) {
      existingSubjects[subjectIndex].teacherId = teacherId;
      existingSubjects[subjectIndex].teacherName = teachersById.get(teacherId) || "";
      existingSubjects[subjectIndex].sessions = [
        ...(existingSubjects[subjectIndex].sessions || []),
        ...newSessions
      ].sort((a, b) => a.date.localeCompare(b.date));
    } else {
      existingSubjects.push({
        subjectName,
        teacherId,
        teacherName: teachersById.get(teacherId) || "",
        sessions: newSessions
      });
    }

    try {
      await updateDoc(doc(db, "classes", classId), {
        subjects: existingSubjects,
        updatedAt: serverTimestamp()
      });

      subjectScheduleForm.reset();
      selectedDates.clear();
      renderCalendar();
      renderSelectedDates();
      await loadClasses(adminProfile.academyId);

      showMessage(`Subject "${subjectName}" and schedule added successfully.`, "success");
    } catch (error) {
      console.error("Could not save subject schedule:", error);
      showMessage("Could not save subject schedule.", "error");
    }
  });

  // ---------------- TAB 3: TIMETABLE ----------------
  function renderClassTimetable() {
    const filterClassId = timetableClassFilter.value;
    const searchDate = timetableDateSearch.value;

    const { monday, sunday } = getCurrentWeekRange();

    const allRows = [];
    classes
      .filter(c => c.status === "active")
      .filter(c => !filterClassId || c.id === filterClassId)
      .forEach(c => {
        (c.subjects || []).forEach(subj => {
          (subj.sessions || []).forEach(sess => {
            const sessDate = parseLocalDate(sess.date);

            if (searchDate) {
              if (sess.date !== searchDate) return;
            } else {
              if (sessDate < monday || sessDate > sunday) return;
            }

            allRows.push({
              day: sess.day || sessDate.toLocaleDateString(undefined, { weekday: "long" }),
              date: sess.date,
              className: c.className,
              subjectName: subj.subjectName,
              startTime: sess.startTime,
              endTime: sess.endTime
            });
          });
        });
      });

    if (allRows.length === 0) {
      timetableBody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: #6b7280;">No timetable sessions found for ${searchDate ? "date " + searchDate : "this week"}.</td></tr>`;
      return;
    }

    allRows.sort((a, b) => 
      a.date.localeCompare(b.date) || 
      a.className.localeCompare(b.className) || 
      a.startTime.localeCompare(b.startTime)
    );

    timetableBody.replaceChildren();

    let i = 0;
    while (i < allRows.length) {
      let dateEnd = i;
      while (dateEnd < allRows.length && allRows[dateEnd].date === allRows[i].date) {
        dateEnd++;
      }
      const dateGroupSize = dateEnd - i;

      let classI = i;
      while (classI < dateEnd) {
        let classEnd = classI;
        while (
          classEnd < dateEnd &&
          allRows[classEnd].className === allRows[classI].className
        ) {
          classEnd++;
        }
        const classGroupSize = classEnd - classI;

        for (let k = classI; k < classEnd; k++) {
          const row = document.createElement("tr");
          const r = allRows[k];

          if (k === i) {
            const tdDay = document.createElement("td");
            tdDay.rowSpan = dateGroupSize;
            tdDay.textContent = r.day;
            row.appendChild(tdDay);

            const tdDate = document.createElement("td");
            tdDate.rowSpan = dateGroupSize;
            tdDate.textContent = r.date;
            row.appendChild(tdDate);
          }

          if (k === classI) {
            const tdClass = document.createElement("td");
            tdClass.rowSpan = classGroupSize;
            tdClass.textContent = r.className;
            row.appendChild(tdClass);
          }

          const tdSubject = document.createElement("td");
          tdSubject.textContent = r.subjectName;
          row.appendChild(tdSubject);

          const tdTime = document.createElement("td");
          tdTime.textContent = `${r.startTime} – ${r.endTime}`;
          row.appendChild(tdTime);

          timetableBody.appendChild(row);
        }
        classI = classEnd;
      }
      i = dateEnd;
    }
  }

  timetableClassFilter.addEventListener("change", renderClassTimetable);
  timetableDateSearch.addEventListener("change", renderClassTimetable);
  clearDateSearchBtn.addEventListener("click", () => {
    timetableDateSearch.value = "";
    renderClassTimetable();
  });

  // ---------------- TAB 4: CLASS MANAGEMENT & EDIT MODAL ----------------
  function renderClasses() {
    const term = (searchInput?.value || "").trim().toLowerCase();
    const selectedStatus = statusFilter?.value || "";

    const filtered = classes.filter(item => {
      const subNames = (item.subjects || []).map(s => s.subjectName).join(" ");
      const searchable = [
        item.className,
        subNames,
        item.description,
        item.status
      ].join(" ").toLowerCase();

      return searchable.includes(term) && (!selectedStatus || item.status === selectedStatus);
    });

    if (filtered.length === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="4">
            <div class="empty-state">
              <h3>No classes found</h3>
              <p>Create a class in the "Add Class" tab.</p>
            </div>
          </td>
        </tr>
      `;
      return;
    }

    tableBody.innerHTML = filtered.map(item => {
      const subjectsList = Array.isArray(item.subjects) && item.subjects.length > 0
        ? item.subjects.map(s => `<div style="margin-bottom:4px;"><strong>${escapeHTML(s.subjectName)}</strong> — <small>${escapeHTML(s.teacherName || "No teacher")}</small> (${(s.sessions || []).length} sessions)</div>`).join("")
        : '<span style="color:#6b7280;">No subjects added yet</span>';

      return `
        <tr>
          <td><strong>${escapeHTML(item.className || "—")}</strong></td>
          <td>${subjectsList}</td>
          <td>${escapeHTML(item.status || "active")}</td>
          <td style="white-space:nowrap;">
            <button
              type="button"
              class="secondary-button"
              data-edit-class="${escapeHTML(item.id)}"
            >Edit</button>
            <button
              type="button"
              class="secondary-button"
              data-delete-class="${escapeHTML(item.id)}"
              style="margin-left: 6px;"
            >Delete</button>
          </td>
        </tr>
      `;
    }).join("");
  }

  searchInput?.addEventListener("input", renderClasses);
  statusFilter?.addEventListener("change", renderClasses);

  tableBody.addEventListener("click", async event => {
    const editBtn = event.target.closest("[data-edit-class]");
    const deleteButton = event.target.closest("[data-delete-class]");

    if (editBtn) {
      const classId = editBtn.dataset.editClass;
      const item = classes.find(c => c.id === classId);
      if (!item) return;

      editClassId.value = item.id;
      editClassName.value = item.className || "";
      editClassStatus.value = item.status || "active";
      editClassDescription.value = item.description || "";

      renderEditSubjects(item.subjects || []);
      editModal.hidden = false;
      return;
    }

    if (!deleteButton) return;

    const item = classes.find(entry => entry.id === deleteButton.dataset.deleteClass);
    if (!item) return;

    if (!window.confirm(`Delete class "${item.className}" permanently?`)) return;

    deleteButton.disabled = true;
    try {
      await deleteDoc(doc(db, "classes", item.id));
      classes = classes.filter(entry => entry.id !== item.id);
      renderClasses();
      updateClassDropdowns();
      renderClassTimetable();
      showMessage("Class deleted successfully.", "success");
    } catch (error) {
      console.error("Could not delete class:", error);
      showMessage("Could not delete class.", "error");
      deleteButton.disabled = false;
    }
  });

  function renderEditSubjects(subjects) {
    editSubjectsContainer.replaceChildren();

    if (subjects.length === 0) {
      editSubjectsContainer.innerHTML = '<span style="color: #6b7280;">No subjects linked yet. Click "+ Add Subject" below.</span>';
      return;
    }

    subjects.forEach((subj, subjIdx) => {
      const div = document.createElement("div");
      div.className = "edit-subject-card";

      let teacherOptions = '<option value="">Select teacher...</option>';
      teachersById.forEach((name, tId) => {
        const selected = tId === subj.teacherId ? "selected" : "";
        teacherOptions += `<option value="${tId}" ${selected}>${escapeHTML(name)}</option>`;
      });

      const firstSess = (subj.sessions || [])[0] || {};
      const cardDates = new Set((subj.sessions || []).map(s => s.date));

      div.innerHTML = `
        <div style="display: flex; gap: 8px; align-items: center;">
          <input type="text" class="edit-subject-name" value="${escapeHTML(subj.subjectName)}" placeholder="Subject Name" required style="flex:2; padding: 6px 8px; border:1px solid #d1d5db; border-radius:6px;">
          <select class="edit-subject-teacher" required style="flex:2; padding: 6px 8px; border:1px solid #d1d5db; border-radius:6px;">
            ${teacherOptions}
          </select>
          <button type="button" class="secondary-button remove-edit-subject" style="color: #b91c1c;">Remove</button>
        </div>
        <div style="display: flex; gap: 12px; align-items: center; font-size: 12px; flex-wrap: wrap;">
          <span>Start: <input type="time" class="edit-subject-start" value="${firstSess.startTime || ""}" style="padding: 4px; border: 1px solid #d1d5db; border-radius: 4px;"></span>
          <span>End: <input type="time" class="edit-subject-end" value="${firstSess.endTime || ""}" style="padding: 4px; border: 1px solid #d1d5db; border-radius: 4px;"></span>
        </div>
        <div>
          <label style="font-size: 11px; font-weight: 600; color: #4b5563;">Select / Modify Session Dates:</label>
          <div class="class-calendar modal-calendar" style="margin-top: 4px;">
            <div class="class-calendar-header">
              <button type="button" class="secondary-button modal-cal-prev" data-card-idx="${subjIdx}">‹</button>
              <h4 class="modal-cal-label" style="margin:0; font-size:12px;"></h4>
              <button type="button" class="secondary-button modal-cal-next" data-card-idx="${subjIdx}">›</button>
            </div>
            <div class="class-calendar-weekdays" aria-hidden="true" style="font-size:10px;">
              <span>Sun</span><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span>
            </div>
            <div class="class-calendar-days modal-cal-days" data-card-idx="${subjIdx}" style="display:grid; grid-template-columns:repeat(7, minmax(0,1fr)); gap:4px;"></div>
          </div>
          <small class="modal-date-count" style="display:block; margin-top:4px; color:#6b7280; font-size:11px;">${cardDates.size} date(s) selected</small>
        </div>
        <div class="timeslot-error-notice" style="display:none;"></div>
      `;

      div._cardDates = cardDates;
      let cardMonth = new Date(today.getFullYear(), today.getMonth(), 1);

      function renderModalCalendar() {
        const calDaysContainer = div.querySelector(".modal-cal-days");
        const calLabel = div.querySelector(".modal-cal-label");
        const countLabel = div.querySelector(".modal-date-count");

        calLabel.textContent = cardMonth.toLocaleDateString(undefined, { month: "long", year: "numeric" });

        const year = cardMonth.getFullYear();
        const month = cardMonth.getMonth();
        const firstWeekday = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const cells = [];

        for (let i = 0; i < firstWeekday; i++) {
          cells.push('<span class="calendar-empty" aria-hidden="true"></span>');
        }

        for (let day = 1; day <= daysInMonth; day++) {
          const date = new Date(year, month, day);
          const dateKey = [year, String(month + 1).padStart(2, "0"), String(day).padStart(2, "0")].join("-");
          const isPast = date < today;
          const isSelected = div._cardDates.has(dateKey);

          const cls = [
            isSelected ? "is-selected" : "",
            dateKey === localDateString(new Date()) ? "is-today" : ""
          ].filter(Boolean).join(" ");

          cells.push(`
            <button type="button" class="modal-day-btn ${cls}" data-date="${dateKey}" ${isPast ? "disabled" : ""} style="padding:6px; border:1px solid #d1d5db; border-radius:6px; background:${isSelected ? "#2563eb" : "#fff"}; color:${isSelected ? "#fff" : "#374151"}; cursor:pointer; font-size:11px;">${day}</button>
          `);
        }

        calDaysContainer.innerHTML = cells.join("");
        countLabel.textContent = `${div._cardDates.size} date(s) selected`;
      }

      div.querySelector(".modal-cal-prev").addEventListener("click", () => {
        cardMonth = new Date(cardMonth.getFullYear(), cardMonth.getMonth() - 1, 1);
        renderModalCalendar();
      });

      div.querySelector(".modal-cal-next").addEventListener("click", () => {
        cardMonth = new Date(cardMonth.getFullYear(), cardMonth.getMonth() + 1, 1);
        renderModalCalendar();
      });

      div.querySelector(".modal-cal-days").addEventListener("click", (e) => {
        const btn = e.target.closest(".modal-day-btn");
        if (!btn || btn.disabled) return;
        const dKey = btn.dataset.date;
        if (div._cardDates.has(dKey)) {
          div._cardDates.delete(dKey);
        } else {
          div._cardDates.add(dKey);
        }
        renderModalCalendar();
      });

      editSubjectsContainer.appendChild(div);
      renderModalCalendar();
    });
  }

  addEditSubjectBtn.addEventListener("click", () => {
    const currentSubjects = [];
    editSubjectsContainer.querySelectorAll(".edit-subject-card").forEach(card => {
      const datesSet = card._cardDates || new Set();
      const startT = card.querySelector(".edit-subject-start").value;
      const endT = card.querySelector(".edit-subject-end").value;
      currentSubjects.push({
        subjectName: card.querySelector(".edit-subject-name").value,
        teacherId: card.querySelector(".edit-subject-teacher").value,
        sessions: [...datesSet].map(d => ({ date: d, startTime: startT, endTime: endT }))
      });
    });
    currentSubjects.push({ subjectName: "", teacherId: "", sessions: [] });
    renderEditSubjects(currentSubjects);
  });

  editSubjectsContainer.addEventListener("click", event => {
    const removeBtn = event.target.closest(".remove-edit-subject");
    if (!removeBtn) return;
    removeBtn.closest(".edit-subject-card").remove();
    if (editSubjectsContainer.children.length === 0) {
      editSubjectsContainer.innerHTML = '<span style="color: #6b7280;">No subjects linked yet.</span>';
    }
  });

  closeEditModalBtn.addEventListener("click", () => { editModal.hidden = true; });
  cancelEditModalBtn.addEventListener("click", () => { editModal.hidden = true; });

  // SINGLE UNIFIED EDIT FORM SUBMISSION WITH CARD-LEVEL ERRORS & VALIDATION
  editClassForm.addEventListener("submit", async event => {
    event.preventDefault();
    hideMessage();

    const id = editClassId.value;
    const className = editClassName.value.trim();
    const status = editClassStatus.value;
    const description = editClassDescription.value.trim();

    if (!id || !className) return;

    let hasError = false;
    const subjectCards = editSubjectsContainer.querySelectorAll(".edit-subject-card");
    const parsedCards = [];

    // Step 1: Basic validation per card
    subjectCards.forEach((card) => {
      const subName = card.querySelector(".edit-subject-name").value.trim();
      const tId = card.querySelector(".edit-subject-teacher").value;
      const startT = card.querySelector(".edit-subject-start").value;
      const endT = card.querySelector(".edit-subject-end").value;
      const datesSet = card._cardDates || new Set();
      const errorDiv = card.querySelector(".timeslot-error-notice");

      if (errorDiv) {
        errorDiv.style.display = "none";
        errorDiv.textContent = "";
      }

      if (!subName) {
        if (errorDiv) {
          errorDiv.textContent = "Subject name is required.";
          errorDiv.style.display = "block";
        }
        hasError = true;
        return;
      }

      if (!tId) {
        if (errorDiv) {
          errorDiv.textContent = "Please select a teacher for this subject.";
          errorDiv.style.display = "block";
        }
        hasError = true;
        return;
      }

      if (!startT || !endT) {
        if (errorDiv) {
          errorDiv.textContent = "Both start and end times are required.";
          errorDiv.style.display = "block";
        }
        hasError = true;
        return;
      }

      if (startT >= endT) {
        if (errorDiv) {
          errorDiv.textContent = "End time must be later than start time.";
          errorDiv.style.display = "block";
        }
        hasError = true;
        return;
      }

      if (datesSet.size === 0) {
        if (errorDiv) {
          errorDiv.textContent = "Select at least one date on the calendar for this subject.";
          errorDiv.style.display = "block";
        }
        hasError = true;
        return;
      }

      parsedCards.push({ subName, tId, startT: startT || "09:00", endT: endT || "10:00", datesSet, errorDiv });
    });

    if (hasError) return;

    // Step 2: Run unified validateClassSchedule for the edit modal
    const validationResult = validateClassSchedule(classes, id, parsedCards, true);
    if (validationResult) {
      if (validationResult.targetCard && validationResult.targetCard.errorDiv) {
        validationResult.targetCard.errorDiv.textContent = validationResult.error;
        validationResult.targetCard.errorDiv.style.display = "block";
      } else {
        showMessage(validationResult.error, "error");
      }
      return;
    }

    const updatedSubjects = [];
    parsedCards.forEach(cardData => {
      const sortedDates = [...cardData.datesSet].sort();
      const sessions = sortedDates.map(d => {
        let dayName = "";
        try {
          dayName = parseLocalDate(d).toLocaleDateString(undefined, { weekday: "long" });
        } catch {
          dayName = "";
        }
        return {
          date: d,
          day: dayName,
          startTime: cardData.startT,
          endTime: cardData.endT
        };
      });

      updatedSubjects.push({
        subjectName: cardData.subName,
        teacherId: cardData.tId,
        teacherName: teachersById.get(cardData.tId) || "",
        sessions
      });
    });

    try {
      await updateDoc(doc(db, "classes", id), {
        className,
        status,
        description,
        subjects: updatedSubjects,
        updatedAt: serverTimestamp()
      });

      editModal.hidden = true;
      await loadClasses(adminProfile.academyId);
      showMessage("Class, subjects, teachers, times and session dates updated successfully.", "success");
    } catch (error) {
      console.error("Could not update class:", error);
      showMessage("Could not update class.", "error");
    }
  });

  renderCalendar();
  renderSelectedDates();

  // --- Schedule Analytics Cards Integration ---
  function expandClassSessions(classRecords) {
    const result = [];
    classRecords.forEach(item => {
      const subjects = Array.isArray(item.subjects) ? item.subjects : [];
      subjects.forEach((subj) => {
        const classSessions = Array.isArray(subj.sessions) ? subj.sessions : [];
        classSessions.forEach((session) => {
          result.push({
            className: item.className || item.name || "Unnamed class",
            subject: subj.subjectName || "",
            date: session.date || "",
            startTime: session.startTime || "",
            endTime: session.endTime || "",
            status: session.status || item.status || "active"
          });
        });
      });
    });
    return result;
  }

  function updateScheduleAnalytics() {
    allFlattenedSessions = expandClassSessions(classes);
    const now = new Date();

    function isCancelled(item) {
      return String(item.status || "").toLowerCase() === "cancelled";
    }

    function hasFinished(item) {
      if (!item.date || !item.endTime) return false;
      const end = new Date(`${item.date}T${item.endTime}:00`);
      return !Number.isNaN(end.getTime()) && end < now;
    }

    const cancelled = allFlattenedSessions.filter(isCancelled);
    const completed = allFlattenedSessions.filter(item => !isCancelled(item) && hasFinished(item));
    const pending = allFlattenedSessions.filter(item => !isCancelled(item) && !hasFinished(item));

    if (scheduleTotalCount) scheduleTotalCount.textContent = allFlattenedSessions.length;
    if (scheduleCompletedCount) scheduleCompletedCount.textContent = completed.length;
    if (schedulePendingCount) schedulePendingCount.textContent = pending.length;
    if (scheduleCancelledCount) scheduleCancelledCount.textContent = cancelled.length;

    renderScheduleChart();
  }

  function renderScheduleChart() {
    if (!scheduleChart || typeof Chart === "undefined") return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const dates = [];
    for (let offset = -2; offset <= 3; offset++) {
      const date = new Date(today);
      date.setDate(today.getDate() + offset);
      dates.push(localDateString(date));
    }

    const validSessions = allFlattenedSessions.filter(item => dates.includes(item.date));

    if (!dates.length) {
      if (scheduleChartMessage) scheduleChartMessage.textContent = "No schedule records available.";
      return;
    }

    const now = new Date();
    const completedByDate = dates.map(date =>
      validSessions.filter(item => {
        if (item.date !== date || String(item.status).toLowerCase() === "cancelled") return false;
        if (!item.endTime) return false;
        const end = new Date(`${item.date}T${item.endTime}:00`);
        return !Number.isNaN(end.getTime()) && end < now;
      }).length
    );

    const pendingByDate = dates.map(date =>
      validSessions.filter(item => {
        if (item.date !== date || String(item.status).toLowerCase() === "cancelled") return false;
        if (!item.endTime) return true;
        const end = new Date(`${item.date}T${item.endTime}:00`);
        return Number.isNaN(end.getTime()) || end >= now;
      }).length
    );

    if (window._scheduleChartInstance) {
      window._scheduleChartInstance.destroy();
    }

    const ctx = scheduleChart.getContext("2d");
    window._scheduleChartInstance = new Chart(ctx, {
      type: "line",
      data: {
        labels: dates.map(d => formatDate(d)),
        datasets: [
          {
            label: "Completed",
            data: completedByDate,
            borderColor: "#16a085",
            backgroundColor: "rgba(22, 160, 133, 0.1)",
            fill: true,
            tension: 0.3
          },
          {
            label: "Pending",
            data: pendingByDate,
            borderColor: "#5276e8",
            backgroundColor: "rgba(82, 118, 232, 0.1)",
            fill: true,
            tension: 0.3
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: true, position: "top" }
        },
        scales: {
          y: { beginAtZero: true, ticks: { precision: 0 } }
        }
      }
    });

    if (scheduleChartMessage) {
      scheduleChartMessage.textContent = "Completed and pending sessions by scheduled date.";
    }
  }

  window.addEventListener("resize", renderScheduleChart);

  onAuthStateChanged(auth, async user => {
    if (!user) {
      window.location.href = "../login.html";
      return;
    }

    try {
      const profileSnapshot = await getDoc(doc(db, "users", user.uid));
      if (!profileSnapshot.exists()) return;

      const profile = profileSnapshot.data();
      if (profile.role !== "admin" || profile.isActive !== true || !profile.academyId) return;

      adminProfile = profile;
      await loadTeachers(profile.academyId);
      await loadClasses(profile.academyId);
      hideMessage();
    } catch (error) {
      console.error("Initialization failed:", error);
      showMessage("Could not load class records.", "error");
    }
  });
});