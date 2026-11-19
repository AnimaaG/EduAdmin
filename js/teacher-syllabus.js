import { auth, db } from "./firebase-config.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";

import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";


/* =========================================================
   DOM ELEMENTS
========================================================= */

const classSelect = document.getElementById("syllabus-class");
const subjectSelect = document.getElementById("syllabus-subject");
const chapterTitleInput = document.getElementById("chapter-title");

const syllabusForm = document.getElementById("syllabus-form");
const addChapterButton = document.getElementById("add-chapter-button");
const clearChapterButton = document.getElementById("clear-chapter-button");

const formMessage = document.getElementById("syllabus-form-message");
const listMessage = document.getElementById("syllabus-list-message");
const chaptersContainer = document.getElementById("syllabus-chapters");

const filterClass = document.getElementById("syllabus-filter-class");
const filterSubject = document.getElementById("syllabus-filter-subject"); // <-- NEW SUBJECT FILTER DOM

const totalChaptersElement = document.getElementById("total-chapters");
const completedChaptersElement = document.getElementById("completed-chapters");
const overallProgressElement = document.getElementById("overall-progress");


/* =========================================================
   APPLICATION STATE
========================================================= */

let currentTeacher = null;
let assignedClasses = [];
let syllabusRecords = [];

let editingChapterId = null;
let isSaving = false;


/* =========================================================
   GENERAL HELPERS
========================================================= */

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[character]);
}

function showFormMessage(message, type = "info") {
  formMessage.textContent = message;
  formMessage.className = `syllabus-message ${type}`;
  formMessage.hidden = false;
}

function hideFormMessage() {
  formMessage.textContent = "";
  formMessage.hidden = true;
}

function showListMessage(message) {
  listMessage.textContent = message;
  listMessage.hidden = false;
}

function hideListMessage() {
  listMessage.textContent = "";
  listMessage.hidden = true;
}

function getClassById(classId) {
  return assignedClasses.find(item => item.id === classId);
}

function normalizeChapterName(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function getChapterNamesFromTextarea() {
  return chapterTitleInput.value
    .split(/\r?\n/)
    .map(name => name.trim())
    .filter(Boolean);
}

function setSubmitButtonMode(mode) {
  if (mode === "edit") {
    addChapterButton.textContent = "Update Chapter";
    addChapterButton.classList.add("edit-mode");
  } else {
    addChapterButton.textContent = "Add Chapter(s)";
    addChapterButton.classList.remove("edit-mode");
  }
}


/* =========================================================
   CLEAR / RESET FORM
========================================================= */

function clearChapterForm(showMessage = true) {
  const selectedClassId = classSelect.value;
  const selectedSubject = subjectSelect.value;

  chapterTitleInput.value = "";
  editingChapterId = null;

  classSelect.value = selectedClassId;
  updateSubjectDropdown(selectedClassId, selectedSubject);

  setSubmitButtonMode("add");
  addChapterButton.disabled = false;
  clearChapterButton.disabled = false;

  hideFormMessage();

  if (showMessage) {
    showFormMessage(
      "Chapter form cleared. You can add new chapters.",
      "success"
    );
  }
}

clearChapterButton.addEventListener("click", () => {
  if (isSaving) return;
  clearChapterForm(true);
});


/* =========================================================
   TEACHER PROFILE
========================================================= */

async function loadTeacherProfile(user) {
  const profileSnapshot = await getDoc(
    doc(db, "users", user.uid)
  );

  if (!profileSnapshot.exists()) {
    throw new Error("Teacher profile was not found.");
  }

  const profile = profileSnapshot.data();

  if (
    profile.role !== "teacher" ||
    profile.isActive !== true ||
    !profile.academyId
  ) {
    throw new Error("Your teacher account is inactive or invalid.");
  }

  currentTeacher = {
    uid: user.uid,
    academyId: profile.academyId,
    name:
      profile.fullName ||
      profile.name ||
      profile.displayName ||
      user.displayName ||
      "Teacher"
  };
}


/* =========================================================
   LOAD ASSIGNED CLASSES & SUBJECTS
========================================================= */

async function loadAssignedClasses() {
  const classesQuery = query(
    collection(db, "classes"),
    where("academyId", "==", currentTeacher.academyId)
  );

  const snapshot = await getDocs(classesQuery);

  assignedClasses = snapshot.docs
    .map(document => ({
      id: document.id,
      ...document.data()
    }))
    .filter(item => {
      const status = String(item.status || "").toLowerCase();
      if (["inactive", "cancelled", "canceled"].includes(status)) return false;
      const subjects = Array.isArray(item.subjects) ? item.subjects : [];
      return subjects.some(subj => subj.teacherId === currentTeacher.uid);
    });

  classSelect.innerHTML = '<option value="">Select assigned class</option>';
  filterClass.innerHTML = '<option value="all">All assigned classes</option>';

  assignedClasses.forEach(classItem => {
    const className = classItem.className || classItem.name || "Class";

    const option = document.createElement("option");
    option.value = classItem.id;
    option.textContent = className;
    classSelect.appendChild(option);

    const filterOption = document.createElement("option");
    filterOption.value = classItem.id;
    filterOption.textContent = className;
    filterClass.appendChild(filterOption);
  });

  if (assignedClasses.length === 0) {
    classSelect.innerHTML = '<option value="">No assigned classes found</option>';
  }
}

function updateSubjectDropdown(classId, selectedSubject = "") {
  subjectSelect.innerHTML = '<option value="">Select subject</option>';

  if (!classId) {
    subjectSelect.innerHTML = '<option value="">Select a class first</option>';
    return;
  }

  const selectedClass = getClassById(classId);
  if (!selectedClass) return;

  const teacherSubjects = (selectedClass.subjects || []).filter(
    s => s.teacherId === currentTeacher.uid
  );

  teacherSubjects.forEach(subj => {
    const subName = subj.subjectName || "";
    if (!subName) return;

    const option = document.createElement("option");
    option.value = subName;
    option.textContent = subName;
    subjectSelect.appendChild(option);
  });

  if (teacherSubjects.length === 0 && selectedClass.subject) {
    const option = document.createElement("option");
    option.value = selectedClass.subject;
    option.textContent = selectedClass.subject;
    subjectSelect.appendChild(option);
  }

  if (selectedSubject) {
    subjectSelect.value = selectedSubject;
  }
}

classSelect.addEventListener("change", () => {
  updateSubjectDropdown(classSelect.value);

  if (editingChapterId) {
    clearChapterForm(false);
  }
});


/* =========================================================
   LOAD TEACHER SYLLABUS
========================================================= */

async function loadSyllabus() {
  showListMessage("Loading your syllabus...");

  const syllabusQuery = query(
    collection(db, "syllabus"),
    where("academyId", "==", currentTeacher.academyId),
    where("teacherId", "==", currentTeacher.uid)
  );

  const snapshot = await getDocs(syllabusQuery);

  syllabusRecords = snapshot.docs.map(document => ({
    id: document.id,
    ...document.data()
  }));

  syllabusRecords.sort((a, b) =>
    (b.createdAt?.seconds || 0) -
    (a.createdAt?.seconds || 0)
  );

  renderSyllabus();
}


/* =========================================================
   UPDATE SUBJECT FILTER OPTIONS
========================================================= */

function updateSubjectFilterOptions() {
  const selectedClassId = filterClass.value || "all";

  // Filter records by class first to extract relevant subjects
  const records = syllabusRecords.filter(record =>
    selectedClassId === "all" || record.classId === selectedClassId
  );

  const subjects = [
    ...new Set(
      records
        .map(record => String(record.subject || "").trim())
        .filter(Boolean)
    )
  ].sort((a, b) => a.localeCompare(b));

  const previousValue = filterSubject.value;

  filterSubject.innerHTML = '<option value="all">All subjects</option>';

  subjects.forEach(subject => {
    const option = document.createElement("option");
    option.value = subject;
    option.textContent = subject;
    filterSubject.appendChild(option);
  });

  if (subjects.includes(previousValue)) {
    filterSubject.value = previousValue;
  }
}


/* =========================================================
   RENDER SYLLABUS
========================================================= */

function renderSyllabus() {
  updateSubjectFilterOptions();

  const selectedClassId = filterClass.value || "all";
  const selectedSubject = filterSubject.value || "all";

  const filteredRecords = syllabusRecords.filter(record => {
    const matchesClass =
      selectedClassId === "all" ||
      record.classId === selectedClassId;

    const matchesSubject =
      selectedSubject === "all" ||
      record.subject === selectedSubject;

    return matchesClass && matchesSubject;
  });

  const totalChapters = filteredRecords.length;
  const completedChapters = filteredRecords.filter(
    chapter => chapter.isCompleted === true
  ).length;

  const completionPercentage = totalChapters > 0
    ? Math.round((completedChapters / totalChapters) * 100)
    : 0;

  totalChaptersElement.textContent = totalChapters;
  completedChaptersElement.textContent = completedChapters;
  overallProgressElement.textContent = `${completionPercentage}%`;

  chaptersContainer.innerHTML = "";

  if (filteredRecords.length === 0) {
    hideListMessage();

    chaptersContainer.innerHTML = `
      <div class="syllabus-empty">
        ${syllabusRecords.length
          ? "No syllabus chapters found for the selected filters."
          : "You have not added any syllabus chapters yet."}
      </div>
    `;
    return;
  }

  hideListMessage();

  filteredRecords.forEach(chapter => {
    const chapterElement = document.createElement("article");
    chapterElement.className = "syllabus-chapter";

    const isCompleted = chapter.isCompleted === true;

    chapterElement.innerHTML = `
      <div class="syllabus-chapter-header">
        <div class="syllabus-chapter-title">
          <h3>${escapeHTML(chapter.chapterTitle)}</h3>
          <p>
            ${escapeHTML(chapter.className || "Class")}
            ${chapter.subject ? ` · ${escapeHTML(chapter.subject)}` : ""}
          </p>
          <span class="syllabus-chapter-status ${isCompleted ? "completed" : ""}">
            ${isCompleted ? "Completed" : "Pending"}
          </span>
        </div>

        <div class="syllabus-chapter-actions">
          <button
            type="button"
            class="syllabus-complete-btn ${isCompleted ? "completed" : ""}"
            data-action="completion"
            ${isSaving && editingChapterId === chapter.id ? "disabled" : ""}
          >
            ${isCompleted ? "Mark Incomplete" : "Mark Completed"}
          </button>

          <button
            type="button"
            class="syllabus-edit-btn"
            data-action="edit"
            ${editingChapterId === chapter.id && isSaving ? "disabled" : ""}
          >
            Edit
          </button>

          <button
            type="button"
            class="syllabus-delete-btn"
            data-action="delete"
            ${isSaving && editingChapterId === chapter.id ? "disabled" : ""}
          >
            Delete
          </button>
        </div>
      </div>
    `;

    chapterElement.querySelector('[data-action="edit"]').addEventListener("click", () => {
      editChapter(chapter.id);
    });

    chapterElement.querySelector('[data-action="delete"]').addEventListener("click", () => {
      deleteChapter(chapter.id);
    });

    chapterElement.querySelector('[data-action="completion"]').addEventListener("click", () => {
      toggleChapterCompletion(chapter.id);
    });

    chaptersContainer.appendChild(chapterElement);
  });
}


/* =========================================================
   CHAPTER COMPLETION TRACKING
========================================================= */

async function toggleChapterCompletion(chapterId) {
  if (isSaving) return;

  const chapter = syllabusRecords.find(record => record.id === chapterId);
  if (!chapter) {
    showFormMessage("Chapter not found.", "error");
    return;
  }

  const newCompletionStatus = chapter.isCompleted !== true;
  isSaving = true;
  renderSyllabus();

  try {
    await updateDoc(doc(db, "syllabus", chapterId), {
      isCompleted: newCompletionStatus,
      updatedAt: serverTimestamp()
    });

    syllabusRecords = syllabusRecords.map(record =>
      record.id === chapterId ? { ...record, isCompleted: newCompletionStatus } : record
    );

    renderSyllabus();
    showFormMessage(
      newCompletionStatus ? `"${chapter.chapterTitle}" marked as completed.` : `"${chapter.chapterTitle}" marked as incomplete.`,
      "success"
    );
  } catch (error) {
    console.error("Chapter completion update failed:", error);
    showFormMessage("Could not update chapter completion.", "error");
  } finally {
    isSaving = false;
    renderSyllabus();
  }
}

filterClass.addEventListener("change", () => {
  filterSubject.value = "all"; // Reset subject filter when class changes
  if (editingChapterId) {
    clearChapterForm(false);
  }
  renderSyllabus();
});

filterSubject.addEventListener("change", () => {
  if (editingChapterId) {
    clearChapterForm(false);
  }
  renderSyllabus();
});


/* =========================================================
   EDIT CHAPTER
========================================================= */

function editChapter(chapterId) {
  const chapter = syllabusRecords.find(record => record.id === chapterId);
  if (!chapter) {
    showFormMessage("Chapter not found.", "error");
    return;
  }

  const selectedClass = getClassById(chapter.classId);
  if (!selectedClass) {
    showFormMessage("Assigned class is no longer available.", "error");
    return;
  }

  editingChapterId = chapterId;

  classSelect.value = chapter.classId;
  updateSubjectDropdown(chapter.classId, chapter.subject);

  chapterTitleInput.value = chapter.chapterTitle || "";
  setSubmitButtonMode("edit");
  hideFormMessage();

  syllabusForm.scrollIntoView({ behavior: "smooth", block: "center" });
  chapterTitleInput.focus();

  showFormMessage("Editing chapter. Make your changes and click Update Chapter.", "info");
  renderSyllabus();
}


/* =========================================================
   DELETE CHAPTER
========================================================= */

async function deleteChapter(chapterId) {
  if (isSaving) return;

  const chapter = syllabusRecords.find(record => record.id === chapterId);
  if (!chapter) return;

  if (!window.confirm(`Are you sure you want to delete "${chapter.chapterTitle}"?`)) return;

  try {
    await deleteDoc(doc(db, "syllabus", chapterId));
    syllabusRecords = syllabusRecords.filter(record => record.id !== chapterId);

    if (editingChapterId === chapterId) {
      clearChapterForm(false);
    }

    renderSyllabus();
    showFormMessage("Chapter deleted successfully.", "success");
  } catch (error) {
    console.error("Delete syllabus chapter failed:", error);
    showFormMessage("Could not delete this chapter.", "error");
  }
}


/* =========================================================
   VALIDATE CHAPTER NAMES
========================================================= */

function validateChapterNames(chapterNames, classId, subjectName, excludedId = null) {
  if (chapterNames.length === 0) return "Enter at least one chapter name.";

  const normalizedNames = chapterNames.map(normalizeChapterName);
  if (normalizedNames.some(name => !name)) return "One or more chapter names are empty.";
  if (new Set(normalizedNames).size !== normalizedNames.length) return "Duplicate chapter names were found in your entries.";

  const existingNames = new Set(
    syllabusRecords
      .filter(record => record.classId === classId && record.subject === subjectName && record.id !== excludedId)
      .map(record => normalizeChapterName(record.chapterTitle))
  );

  const duplicateNames = chapterNames.filter(name => existingNames.has(normalizeChapterName(name)));
  if (duplicateNames.length > 0) {
    return `These chapter(s) already exist for this class and subject: ${duplicateNames.join(", ")}`;
  }

  return null;
}


/* =========================================================
   FORM SUBMISSION
========================================================= */

syllabusForm.addEventListener("submit", async event => {
  event.preventDefault();
  if (!currentTeacher || isSaving) return;

  const classId = classSelect.value;
  const subjectName = subjectSelect.value;
  const selectedClass = getClassById(classId);

  if (!selectedClass) {
    showFormMessage("Please select one of your assigned classes.", "error");
    return;
  }

  if (!subjectName) {
    showFormMessage("Please select a subject for this class.", "error");
    return;
  }

  const chapterNames = getChapterNamesFromTextarea();

  if (editingChapterId) {
    if (chapterNames.length !== 1) {
      showFormMessage("Enter exactly one chapter name when editing an existing chapter.", "error");
      return;
    }

    const validationError = validateChapterNames(chapterNames, classId, subjectName, editingChapterId);
    if (validationError) {
      showFormMessage(validationError, "error");
      return;
    }

    await saveEditedChapter(editingChapterId, chapterNames[0], selectedClass, subjectName);
    return;
  }

  const validationError = validateChapterNames(chapterNames, classId, subjectName);
  if (validationError) {
    showFormMessage(validationError, "error");
    return;
  }

  await saveNewChapters(chapterNames, classId, selectedClass, subjectName);
});


/* =========================================================
   SAVE NEW CHAPTERS
========================================================= */

async function saveNewChapters(chapterNames, classId, selectedClass, subjectName) {
  isSaving = true;
  addChapterButton.disabled = true;
  clearChapterButton.disabled = true;
  addChapterButton.textContent = "Saving...";

  let savedCount = 0;

  try {
    for (const chapterTitle of chapterNames) {
      const chapterData = {
        academyId: currentTeacher.academyId,
        classId,
        className: selectedClass.className || selectedClass.name || "",
        teacherId: currentTeacher.uid,
        teacherName: currentTeacher.name,
        subject: subjectName,
        chapterTitle: chapterTitle.trim(),
        topics: [],
        isCompleted: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      const documentRef = await addDoc(collection(db, "syllabus"), chapterData);

      syllabusRecords.unshift({
        id: documentRef.id,
        ...chapterData,
        createdAt: { seconds: Math.floor(Date.now() / 1000) }
      });

      savedCount++;
    }

    clearChapterForm(false);
    showFormMessage(`${savedCount} chapter(s) added successfully.`, "success");
    renderSyllabus();
  } catch (error) {
    console.error("Add syllabus chapter failed:", error);
    showFormMessage(
      `Could not save chapters: ${error.code || "Unknown"} - ${error.message}`,
      "error"
    );
  } finally {
    isSaving = false;
    addChapterButton.disabled = false;
    clearChapterButton.disabled = false;
    setSubmitButtonMode("add");
  }
}


/* =========================================================
   UPDATE EXISTING CHAPTER
========================================================= */

async function saveEditedChapter(chapterId, chapterTitle, selectedClass, subjectName) {
  isSaving = true;
  addChapterButton.disabled = true;
  clearChapterButton.disabled = true;
  addChapterButton.textContent = "Updating...";

  try {
    const chapterRef = doc(db, "syllabus", chapterId);
    const updatedData = {
      chapterTitle: chapterTitle.trim(),
      className: selectedClass.className || selectedClass.name || "",
      subject: subjectName,
      updatedAt: serverTimestamp()
    };

    await updateDoc(chapterRef, updatedData);

    syllabusRecords = syllabusRecords.map(record =>
      record.id === chapterId ? { ...record, ...updatedData, updatedAt: { seconds: Math.floor(Date.now() / 1000) } } : record
    );

    clearChapterForm(false);
    showFormMessage("Chapter updated successfully.", "success");
    renderSyllabus();
  } catch (error) {
    console.error("Update syllabus chapter failed:", error);
    showFormMessage("Could not update this chapter.", "error");
  } finally {
    isSaving = false;
    addChapterButton.disabled = false;
    clearChapterButton.disabled = false;
    setSubmitButtonMode("add");
  }
}


/* =========================================================
   INITIALIZE
========================================================= */

onAuthStateChanged(auth, async user => {
  if (!user) {
    currentTeacher = null;
    showListMessage("Please log in to access your syllabus.");
    return;
  }

  try {
    await loadTeacherProfile(user);
    await loadAssignedClasses();
    await loadSyllabus();
  } catch (error) {
    console.error("Teacher syllabus initialization failed:", error);
    showListMessage(error.message || "Could not load your syllabus.");
  }
});