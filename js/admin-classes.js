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

document.addEventListener("DOMContentLoaded", () => {
  const addButton = document.getElementById("add-class-button");
  const formSection = document.getElementById("class-form-section");
  const form = document.getElementById("class-form");
  const cancelButton = document.getElementById("cancel-class-button");
  const message = document.getElementById("classes-message");
  const tableBody = document.getElementById("classes-table-body");
  const searchInput = document.getElementById("class-search");
  const statusFilter = document.getElementById("class-status-filter");
  const teacherSelect = document.getElementById("class-teacher");
  const saveButton = document.getElementById("save-class-button");
  const formTitle = document.getElementById("class-form-title");
  const descriptionInput = document.getElementById("class-description");
  const classStatusInput = document.getElementById("class-status");

  const calendarDays = document.getElementById("class-calendar-days");
  const calendarMonthLabel = document.getElementById("calendar-month-label");
  const previousMonthButton = document.getElementById("calendar-previous-month");
  const nextMonthButton = document.getElementById("calendar-next-month");
  const datesContainer = document.getElementById("class-session-dates");
  const selectedDateCount = document.getElementById("class-selected-date-count");
  const startTimeInput = document.getElementById("class-start-time");
  const endTimeInput = document.getElementById("class-end-time");

  const classNameInput = document.getElementById("class-name");
  const subjectInput = document.getElementById("class-subject");

  const weeklyTimetableHead = document.getElementById("weekly-timetable-head");
  const weeklyTimetableBody = document.getElementById("weekly-timetable-body");

  if (
    !addButton ||
    !formSection ||
    !form ||
    !cancelButton ||
    !message ||
    !tableBody ||
    !teacherSelect ||
    !saveButton ||
    !formTitle ||
    !descriptionInput ||
    !classStatusInput ||
    !calendarDays ||
    !calendarMonthLabel ||
    !previousMonthButton ||
    !nextMonthButton ||
    !datesContainer ||
    !selectedDateCount ||
    !startTimeInput ||
    !endTimeInput ||
    !classNameInput ||
    !subjectInput ||
    !weeklyTimetableHead ||
    !weeklyTimetableBody 
  ) {
    console.error(
      "Classes page is missing one or more required HTML elements."
    );
    return;
  }

  let adminProfile = null;
  let classes = [];
  let editingClassId = null;

  const teachersById = new Map();
  const selectedDates = new Set();

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let displayedMonth = new Date(
    today.getFullYear(),
    today.getMonth(),
    1
  );

  // Convert a local Date into YYYY-MM-DD without UTC timezone shifts.
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

  function formatDate(
    dateString,
    options = {
      weekday: "long",
      year: "numeric",
      month: "short",
      day: "numeric"
    }
  ) {
    return parseLocalDate(dateString).toLocaleDateString(
      undefined,
      options
    );
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

  // Calendar rendering
  function renderCalendar() {
    const year = displayedMonth.getFullYear();
    const month = displayedMonth.getMonth();

    calendarMonthLabel.textContent =
      displayedMonth.toLocaleDateString(
        undefined,
        { month: "long", year: "numeric" }
      );

    const firstWeekday = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells = [];

    for (let i = 0; i < firstWeekday; i++) {
      cells.push(
        '<span class="calendar-empty" aria-hidden="true"></span>'
      );
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day);
      const dateKey = localDateString(date);
      const isPast = date < today;
      const isSelected = selectedDates.has(dateKey);
      const isToday = dateKey === localDateString(today);

      const classes = [
        isSelected ? "is-selected" : "",
        isToday ? "is-today" : ""
      ].filter(Boolean).join(" ");

      cells.push(`
        <button
          type="button"
          class="${classes}"
          data-calendar-date="${dateKey}"
          aria-pressed="${isSelected}"
          aria-label="${escapeHTML(formatDate(dateKey))}${isSelected ? ", selected" : ""}"
          ${isPast ? "disabled" : ""}
        >${day}</button>
      `);
    }

    calendarDays.innerHTML = cells.join("");

    const currentMonth = new Date(
      today.getFullYear(),
      today.getMonth(),
      1
    );

    previousMonthButton.disabled =
      displayedMonth.getFullYear() === currentMonth.getFullYear() &&
      displayedMonth.getMonth() <= currentMonth.getMonth();
  }

  function renderSelectedDates() {
    const dates = [...selectedDates].sort();

    selectedDateCount.textContent =
      `${dates.length} date${dates.length === 1 ? "" : "s"} selected`;

    if (dates.length === 0) {
      datesContainer.innerHTML =
        '<p class="form-help">No dates selected yet. Click dates on the calendar.</p>';
      return;
    }

    datesContainer.innerHTML = dates.map(date => `
      <div class="selected-session-date">
        <div>
          <strong>${escapeHTML(formatDate(date))}</strong>
          <small>${escapeHTML(date)}</small>
        </div>

        <button
          type="button"
          class="secondary-button"
          data-remove-session-date="${date}"
          aria-label="Remove ${escapeHTML(formatDate(date))}"
        >Remove</button>
      </div>
    `).join("");
  }

  // Select or deselect calendar dates directly.
  calendarDays.addEventListener("click", event => {
    const button = event.target.closest("[data-calendar-date]");

    if (!button || button.disabled) {
      return;
    }

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

  previousMonthButton.addEventListener("click", () => {
    displayedMonth = new Date(
      displayedMonth.getFullYear(),
      displayedMonth.getMonth() - 1,
      1
    );

    renderCalendar();
  });

  nextMonthButton.addEventListener("click", () => {
    displayedMonth = new Date(
      displayedMonth.getFullYear(),
      displayedMonth.getMonth() + 1,
      1
    );

    renderCalendar();
  });

  datesContainer.addEventListener("click", event => {
    const button = event.target.closest("[data-remove-session-date]");

    if (!button) {
      return;
    }

    selectedDates.delete(button.dataset.removeSessionDate);

    renderCalendar();
    renderSelectedDates();
    hideMessage();
  });

  function buildSessions() {
    return [...selectedDates].sort().map(date => ({
      date,
      day: formatDate(date, { weekday: "long" }),
      startTime: startTimeInput.value,
      endTime: endTimeInput.value
    }));
  }

  function formatSessionsForTable(sessions, legacySchedule = "") {
    if (!Array.isArray(sessions) || sessions.length === 0) {
      return legacySchedule || "No dates scheduled";
    }

    return sessions.map(session => {
      const day = session.day ||
        formatDate(session.date, { weekday: "long" });

      return `${day}, ${session.date}, ${session.startTime}–${session.endTime}`;
    }).join(" | ");
  }

  
function renderWeeklyTimetable() {
  const startDate = new Date();
  startDate.setHours(0, 0, 0, 0);

  // Seven calendar days, starting today.
  const weekDates = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + index);

    return {
      key: localDateString(date),
      date,
      dayName: date.toLocaleDateString(undefined, {
        weekday: "short"
      }),
      displayDate: date.toLocaleDateString(undefined, {
        day: "numeric",
        month: "short"
      })
    };
  });

  weeklyTimetableHead.innerHTML = `
    <tr>
      <th class="weekly-class-column">Class</th>
      ${weekDates.map(day => `
        <th class="${day.key === localDateString(startDate) ? "weekly-today" : ""}">
          <span class="weekly-day-name">${escapeHTML(day.dayName)}</span>
          <span class="weekly-day-date">${escapeHTML(day.displayDate)}</span>
        </th>
      `).join("")}
    </tr>
  `;

  // Only active classes appear in the upcoming timetable.
  const activeClasses = classes
    .filter(item => item.status === "active")
    .sort((a, b) =>
      String(a.className || "").localeCompare(String(b.className || ""))
    );

  if (activeClasses.length === 0) {
    weeklyTimetableBody.innerHTML = `
      <tr>
        <td colspan="8" class="weekly-empty">
          No active classes to display.
        </td>
      </tr>
    `;
    return;
  }

  weeklyTimetableBody.innerHTML = activeClasses.map(item => {
    const sessions = Array.isArray(item.sessions) ? item.sessions : [];

    return `
      <tr>
        <td class="weekly-class-cell">
          <strong>${escapeHTML(item.className || "Unnamed class")}</strong>
          <span>${escapeHTML(item.subject || "")}</span>
          <small>${escapeHTML(item.teacherName || "No teacher assigned")}</small>
        </td>

        ${weekDates.map(day => {
          const daySessions = sessions
            .filter(session => session.date === day.key)
            .sort((a, b) =>
              String(a.startTime || "").localeCompare(
                String(b.startTime || "")
              )
            );

          if (daySessions.length === 0) {
            return `<td class="weekly-no-session">—</td>`;
          }

          return `
            <td class="weekly-session-cell">
              ${daySessions.map(session => `
                <div class="weekly-session">
                  <strong>
                    ${escapeHTML(session.startTime || "--:--")}
                    – ${escapeHTML(session.endTime || "--:--")}
                  </strong>
                  <span>${escapeHTML(item.className || "")}</span>
                </div>
              `).join("")}
            </td>
          `;
        }).join("")}
      </tr>
    `;
  }).join("");
}


  // Render class rows, including Edit and Delete buttons.
  function renderClasses() {
    const term = (searchInput?.value || "").trim().toLowerCase();
    const selectedStatus = statusFilter?.value || "";

    const filtered = classes.filter(item => {
      const sessionText = formatSessionsForTable(
        item.sessions,
        item.schedule
      );

      const searchable = [
        item.className,
        item.subject,
        item.teacherName,
        item.description,
        sessionText,
        item.status
      ].join(" ").toLowerCase();

      return searchable.includes(term) &&
        (!selectedStatus || item.status === selectedStatus);
    });

    if (filtered.length === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="6">
            <div class="empty-state">
              <h3>${term || selectedStatus ? "No matching classes" : "No classes found"}</h3>
              <p>${term || selectedStatus
                ? "Change the search or status filter."
                : "Add a class to begin organizing this academy."}</p>
            </div>
          </td>
        </tr>
      `;

      return;
    }

tableBody.innerHTML = filtered.map(item => `
  <tr>
    <td>${escapeHTML(item.className || "—")}</td>
    <td>${escapeHTML(item.subject || "—")}</td>
    <td>${escapeHTML(item.teacherName || "Not assigned")}</td>
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
        style="margin-left:6px;"
      >Delete</button>
    </td>
  </tr>
`).join("");
  }

  async function loadTeachers(academyId) {
    teacherSelect.innerHTML =
      '<option value="">No teacher selected</option>';

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

      const name = teacher.fullName ||
        teacher.name ||
        teacher.displayName ||
        teacher.email ||
        "Unnamed teacher";

      teachersById.set(teacherDoc.id, name);

      const option = document.createElement("option");
      option.value = teacherDoc.id;
      option.textContent = name;

      teacherSelect.appendChild(option);
    });
  }

  async function loadClasses(academyId) {
    tableBody.innerHTML =
      '<tr><td colspan="6">Loading classes...</td></tr>';

    const classesQuery = query(
      collection(db, "classes"),
      where("academyId", "==", academyId)
    );

    const snapshot = await getDocs(classesQuery);

    classes = snapshot.docs.map(classDoc => {
      const item = classDoc.data();

      return {
        id: classDoc.id,
        ...item,
        teacherName: item.teacherName ||
          teachersById.get(item.teacherId) ||
          ""
      };
    });

    renderClasses();
    renderWeeklyTimetable();
  }

  function resetFormState() {
    form.reset();
    editingClassId = null;
    selectedDates.clear();

    formTitle.textContent = "Add class";
    saveButton.textContent = "Save class";
    classStatusInput.value = "active";

    renderCalendar();
    renderSelectedDates();
  }

  function openForm() {
    resetFormState();
    hideMessage();

    formSection.hidden = false;
    addButton.disabled = true;

    formSection.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });

    classNameInput.focus();
  }

  function closeForm() {
    resetFormState();

    formSection.hidden = true;
    addButton.disabled = false;

    hideMessage();
  }

  // Load an existing class into the form for editing.
  function startEditingClass(item) {
    if (item.academyId !== adminProfile?.academyId) {
      showMessage(
        "You can only edit classes belonging to your academy.",
        "error"
      );
      return;
    }

    editingClassId = item.id;

    form.reset();
    selectedDates.clear();

    classNameInput.value = item.className || "";
    subjectInput.value = item.subject || "";
    teacherSelect.value = item.teacherId || "";
    descriptionInput.value = item.description || "";

    classStatusInput.value =
      item.status === "inactive" ? "inactive" : "active";

    const sessions = Array.isArray(item.sessions) ? item.sessions : [];

    sessions.forEach(session => {
      if (session.date) {
        selectedDates.add(session.date);
      }
    });

    startTimeInput.value = sessions[0]?.startTime || "";
    endTimeInput.value = sessions[0]?.endTime || "";

    if (sessions.length > 0 && sessions[0].date) {
      const firstDate = parseLocalDate(sessions[0].date);

      displayedMonth = new Date(
        firstDate.getFullYear(),
        firstDate.getMonth(),
        1
      );
    }

    formTitle.textContent = "Edit class";
    saveButton.textContent = "Save changes";

    renderCalendar();
    renderSelectedDates();
    hideMessage();

    formSection.hidden = false;
    addButton.disabled = true;

    formSection.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  }

  addButton.addEventListener("click", openForm);
  cancelButton.addEventListener("click", closeForm);

  searchInput?.addEventListener("input", renderClasses);
  statusFilter?.addEventListener("change", renderClasses);

  if (searchInput) {
    searchInput.disabled = false;
  }

  if (statusFilter) {
    statusFilter.disabled = false;
  }

  // Create a class or update the selected existing class.
  form.addEventListener("submit", async event => {
    event.preventDefault();
    hideMessage();

    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    if (!adminProfile || !auth.currentUser) {
      showMessage(
        "Your admin session is not ready. Sign in again.",
        "error"
      );
      return;
    }

    const className = classNameInput.value.trim();
    const subject = subjectInput.value.trim();
    const teacherId = teacherSelect.value || "";
    const description = descriptionInput.value.trim();
    const status = classStatusInput.value;

    if (!className || !subject) {
      showMessage("Enter a class name and subject.", "error");
      return;
    }

    if (selectedDates.size === 0) {
      showMessage("Select at least one date on the calendar.", "error");
      return;
    }

    if (!startTimeInput.value || !endTimeInput.value) {
      showMessage(
        "Select both a start time and an end time.",
        "error"
      );
      return;
    }

    if (startTimeInput.value >= endTimeInput.value) {
      showMessage(
        "End time must be later than start time.",
        "error"
      );

      endTimeInput.focus();
      return;
    }

    if (teacherId && !teachersById.has(teacherId)) {
      showMessage(
        "Select a valid active teacher from this academy.",
        "error"
      );
      return;
    }

    const sessions = buildSessions();

    saveButton.disabled = true;
    addButton.disabled = true;

    try {
      const payload = {
        academyId: adminProfile.academyId,
        className,
        subject,
        teacherId,
        teacherName: teacherId
          ? teachersById.get(teacherId)
          : "",
        sessions,
        schedule: formatSessionsForTable(sessions),
        description,
        status,
        updatedAt: serverTimestamp()
      };

      if (editingClassId) {
        const existing = classes.find(
          item => item.id === editingClassId
        );

        if (
          !existing ||
          existing.academyId !== adminProfile.academyId
        ) {
          throw new Error(
            "This class does not belong to your academy."
          );
        }

        await updateDoc(
          doc(db, "classes", editingClassId),
          payload
        );
      } else {
        await addDoc(collection(db, "classes"), {
          ...payload,
          createdBy: auth.currentUser.uid,
          createdAt: serverTimestamp()
        });
      }

      const wasEditing = Boolean(editingClassId);

      await loadClasses(adminProfile.academyId);
      closeForm();

      showMessage(
        wasEditing
          ? "Class updated successfully."
          : "Class and session dates saved successfully.",
        "success"
      );
    } catch (error) {
      console.error("Could not save class:", error);

      showMessage(
        error.code === "permission-denied"
          ? "Firestore denied this operation. Check the classes security rules for this academy."
          : (error.message ||
            "The class could not be saved. Check the browser console for details."),
        "error"
      );
    } finally {
      saveButton.disabled = false;
      addButton.disabled = false;
    }
  });

  // Handle Edit and Delete buttons from the class table.
  tableBody.addEventListener("click", async event => {
    const editButton = event.target.closest("[data-edit-class]");
    const deleteButton = event.target.closest("[data-delete-class]");

    if (editButton) {
      const item = classes.find(
        entry => entry.id === editButton.dataset.editClass
      );

      if (item) {
        startEditingClass(item);
      }

      return;
    }

    if (!deleteButton) {
      return;
    }

    const item = classes.find(
      entry => entry.id === deleteButton.dataset.deleteClass
    );

    if (!item) {
      return;
    }

    if (item.academyId !== adminProfile?.academyId) {
      showMessage(
        "You can only delete classes belonging to your academy.",
        "error"
      );
      return;
    }

    const confirmed = window.confirm(
      `Delete the class "${item.className}" permanently? ` +
      "This removes its Firestore document and cannot be undone."
    );

    if (!confirmed) {
      return;
    }

    deleteButton.disabled = true;

    try {
      await deleteDoc(doc(db, "classes", item.id));

      classes = classes.filter(
        entry => entry.id !== item.id
      );

      renderClasses();

      showMessage(
        "Class deleted from Firestore and removed from the list.",
        "success"
      );
    } catch (error) {
      console.error("Could not delete class:", error);

      showMessage(
        error.code === "permission-denied"
          ? "Firestore denied deletion. Update the classes security rules to allow academy admins to delete their academy's classes."
          : "Could not delete the class. Check the browser console.",
        "error"
      );

      deleteButton.disabled = false;
    }
  });

  renderCalendar();
  renderSelectedDates();

  // Verify the signed-in user and load academy data.
  onAuthStateChanged(auth, async user => {
    if (!user) {
      window.location.href = "../login.html";
      return;
    }

    try {
      const profileSnapshot = await getDoc(
        doc(db, "users", user.uid)
      );

      if (!profileSnapshot.exists()) {
        showMessage(
          "Your admin profile could not be found.",
          "error"
        );
        return;
      }

      const profile = profileSnapshot.data();

      if (
        profile.role !== "admin" ||
        profile.isActive !== true ||
        !profile.academyId
      ) {
        showMessage(
          "An active academy admin account is required.",
          "error"
        );
        return;
      }

      adminProfile = profile;

      await loadTeachers(profile.academyId);
      await loadClasses(profile.academyId);

      hideMessage();
    } catch (error) {
      console.error(
        "Could not initialize classes page:",
        error
      );

      tableBody.innerHTML =
        '<tr><td colspan="6">Class records could not be loaded.</td></tr>';

      showMessage(
        error.code === "permission-denied"
          ? "Firestore denied access. Check the users and classes rules."
          : "Could not load class records. Check the browser console.",
        "error"
      );
    }
  });
});