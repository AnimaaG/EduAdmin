
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
const subjectInput = document.getElementById("syllabus-subject");
const chapterTitleInput = document.getElementById("chapter-title");

const syllabusForm = document.getElementById("syllabus-form");
const addChapterButton = document.getElementById("add-chapter-button");
const clearChapterButton = document.getElementById("clear-chapter-button");
const formHeading = document.getElementById("form-heading");

const formMessage = document.getElementById("syllabus-form-message");
const listMessage = document.getElementById("syllabus-list-message");
const chaptersContainer = document.getElementById("syllabus-chapters");

const filterClass = document.getElementById("syllabus-filter-class");
const filterSubject = document.getElementById("syllabus-filter-subject");

const totalChaptersElement = document.getElementById("total-chapters");
const completedChaptersElement = document.getElementById("completed-chapters");
const overallProgressElement = document.getElementById("overall-progress");


/* =========================================================
   APPLICATION STATE
========================================================= */

let currentAdmin = null;
let academyClasses = [];
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
  return academyClasses.find(item => item.id === classId);
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
    formHeading.textContent = "Edit Syllabus Chapter";
  } else {
    addChapterButton.textContent = "Add Chapter(s)";
    addChapterButton.classList.remove("edit-mode");
    formHeading.textContent = "Add Syllabus Chapter";
  }
}


/* =========================================================
   ADMIN PROFILE
========================================================= */

async function loadAdminProfile(user) {

  const profileSnapshot = await getDoc(
    doc(db, "users", user.uid)
  );

  if (!profileSnapshot.exists()) {
    throw new Error("Admin profile was not found.");
  }

  const profile = profileSnapshot.data();

  if (
    profile.role !== "admin" ||
    profile.isActive !== true ||
    !profile.academyId
  ) {
    throw new Error("Your admin account is inactive or invalid.");
  }

  currentAdmin = {
    uid: user.uid,
    academyId: profile.academyId,
    name:
      profile.fullName ||
      profile.name ||
      profile.displayName ||
      user.displayName ||
      "Admin"
  };
}


/* =========================================================
   LOAD ACADEMY CLASSES
========================================================= */

async function loadAcademyClasses() {

  const classesQuery = query(
    collection(db, "classes"),
    where("academyId", "==", currentAdmin.academyId)
  );

  const snapshot = await getDocs(classesQuery);

  academyClasses = snapshot.docs
    .map(document => ({
      id: document.id,
      ...document.data()
    }))
    .filter(item => {
      const status = String(item.status || "").toLowerCase();

      return !["inactive", "cancelled", "canceled"].includes(status);
    });

  academyClasses.sort((a, b) =>
    String(a.className || "").localeCompare(
      String(b.className || "")
    )
  );

  classSelect.innerHTML =
    '<option value="">Select class</option>';

  filterClass.innerHTML =
    '<option value="all">All classes</option>';

  academyClasses.forEach(classItem => {

    const label =
      `${classItem.className || "Class"}` +
      `${classItem.subject ? ` — ${classItem.subject}` : ""}`;

    const option = document.createElement("option");
    option.value = classItem.id;
    option.textContent = label;

    classSelect.appendChild(option);

    const filterOption = document.createElement("option");
    filterOption.value = classItem.id;
    filterOption.textContent = label;

    filterClass.appendChild(filterOption);
  });

  if (academyClasses.length === 0) {
    classSelect.innerHTML =
      '<option value="">No academy classes found</option>';
  }
}


/* =========================================================
   CLASS SELECTION
========================================================= */

classSelect.addEventListener("change", () => {

  const selectedClass = getClassById(classSelect.value);

  subjectInput.value = selectedClass?.subject || "";

  if (editingChapterId) {
    clearChapterForm(false);
  }
});


/* =========================================================
   LOAD ACADEMY SYLLABUS
========================================================= */

async function loadSyllabus() {

  showListMessage("Loading academy syllabus...");

  const syllabusQuery = query(
    collection(db, "syllabus"),
    where("academyId", "==", currentAdmin.academyId)
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
   FILTER SUBJECTS
========================================================= */

function updateSubjectFilter() {

  const selectedClassId = filterClass.value || "all";

  const records = syllabusRecords.filter(record =>
    selectedClassId === "all" ||
    record.classId === selectedClassId
  );

  const subjects = [
    ...new Set(
      records
        .map(record => String(record.subject || "").trim())
        .filter(Boolean)
    )
  ].sort((a, b) => a.localeCompare(b));

  const previousValue = filterSubject.value;

  filterSubject.innerHTML =
    '<option value="all">All subjects</option>';

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

  updateSubjectFilter();

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


  /* SUMMARY */

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


  /* CHAPTER LIST */

  chaptersContainer.innerHTML = "";

  if (filteredRecords.length === 0) {

    hideListMessage();

    chaptersContainer.innerHTML = `
      <div class="syllabus-empty">
        ${
          syllabusRecords.length
            ? "No syllabus chapters found for the selected filters."
            : "No syllabus chapters have been added to your academy yet."
        }
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
            ${chapter.subject
              ? ` · ${escapeHTML(chapter.subject)}`
              : ""}
            ${chapter.teacherName
              ? ` · Teacher: ${escapeHTML(chapter.teacherName)}`
              : ""}
          </p>

          <span class="syllabus-chapter-status ${isCompleted ? "completed" : ""}">
            ${isCompleted ? "Completed" : "Pending"}
          </span>

        </div>

        <div class="syllabus-chapter-actions">

          <button
            type="button"
            class="syllabus-edit-btn"
            data-action="edit"
            ${isSaving ? "disabled" : ""}
          >
            Edit
          </button>

          <button
            type="button"
            class="syllabus-delete-btn"
            data-action="delete"
            ${isSaving ? "disabled" : ""}
          >
            Delete
          </button>

        </div>

      </div>
    `;

    chapterElement
      .querySelector('[data-action="edit"]')
      .addEventListener("click", () => {
        editChapter(chapter.id);
      });

    chapterElement
      .querySelector('[data-action="delete"]')
      .addEventListener("click", () => {
        deleteChapter(chapter.id);
      });

    chaptersContainer.appendChild(chapterElement);
  });
}


/* =========================================================
   FILTER EVENTS
========================================================= */

filterClass.addEventListener("change", () => {

  filterSubject.value = "all";

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
   CLEAR FORM
========================================================= */

function clearChapterForm(showMessage = true) {

  const selectedClassId = classSelect.value;

  syllabusForm.reset();

  chapterTitleInput.value = "";

  editingChapterId = null;

  classSelect.value = selectedClassId;

  const selectedClass = getClassById(selectedClassId);

  subjectInput.value = selectedClass?.subject || "";

  setSubmitButtonMode("add");

  addChapterButton.disabled = false;
  clearChapterButton.disabled = false;

  hideFormMessage();

  if (showMessage) {
    showFormMessage(
      "Form cleared. You can add new syllabus chapters.",
      "success"
    );
  }
}


clearChapterButton.addEventListener("click", () => {

  if (isSaving) return;

  clearChapterForm(true);
});


/* =========================================================
   VALIDATE CHAPTER NAMES
========================================================= */

function validateChapterNames(
  chapterNames,
  classId,
  excludedId = null
) {

  if (chapterNames.length === 0) {
    return "Enter at least one chapter name.";
  }

  const normalizedNames = chapterNames.map(
    normalizeChapterName
  );

  if (new Set(normalizedNames).size !== normalizedNames.length) {
    return "Duplicate chapter names were found in your entries.";
  }

  const existingNames = new Set(
    syllabusRecords
      .filter(record =>
        record.classId === classId &&
        record.id !== excludedId
      )
      .map(record =>
        normalizeChapterName(record.chapterTitle)
      )
  );

  const duplicateNames = chapterNames.filter(name =>
    existingNames.has(normalizeChapterName(name))
  );

  if (duplicateNames.length > 0) {
    return `These chapters already exist for this class: ${duplicateNames.join(", ")}`;
  }

  return null;
}


/* =========================================================
   FORM SUBMISSION
========================================================= */

syllabusForm.addEventListener("submit", async event => {

  event.preventDefault();

  if (!currentAdmin || isSaving) return;

  const classId = classSelect.value;
  const selectedClass = getClassById(classId);

  if (!selectedClass) {
    showFormMessage(
      "Please select a valid academy class.",
      "error"
    );
    return;
  }

  if (!selectedClass.subject) {
    showFormMessage(
      "The selected class does not have a subject assigned.",
      "error"
    );
    return;
  }

  const chapterNames = getChapterNamesFromTextarea();


  /* EDIT MODE */

  if (editingChapterId) {

    if (chapterNames.length !== 1) {
      showFormMessage(
        "Enter exactly one chapter name when editing.",
        "error"
      );
      return;
    }

    const validationError = validateChapterNames(
      chapterNames,
      classId,
      editingChapterId
    );

    if (validationError) {
      showFormMessage(validationError, "error");
      return;
    }

    await saveEditedChapter(
      editingChapterId,
      chapterNames[0]
    );

    return;
  }


  /* ADD MODE */

  const validationError = validateChapterNames(
    chapterNames,
    classId
  );

  if (validationError) {
    showFormMessage(validationError, "error");
    return;
  }

  await saveNewChapters(
    chapterNames,
    classId,
    selectedClass
  );
});


/* =========================================================
   SAVE NEW CHAPTERS
========================================================= */

async function saveNewChapters(
  chapterNames,
  classId,
  selectedClass
) {

  isSaving = true;

  addChapterButton.disabled = true;
  clearChapterButton.disabled = true;

  addChapterButton.textContent = "Saving...";

  let savedCount = 0;

  try {

    for (const chapterTitle of chapterNames) {

      const chapterData = {

        academyId: currentAdmin.academyId,

        classId,

        className: selectedClass.className || "",

        // Keep existing teacher ownership compatible.
        // Teacher can see admin-created syllabus for the class
        // if the class has an assigned teacher.
        teacherId: selectedClass.teacherId || "",

        teacherName: selectedClass.teacherName || "",

        subject: selectedClass.subject,

        chapterTitle: chapterTitle.trim(),

        topics: [],

        isCompleted: false,

        createdAt: serverTimestamp(),

        updatedAt: serverTimestamp()
      };

      const documentRef = await addDoc(
        collection(db, "syllabus"),
        chapterData
      );

      syllabusRecords.unshift({
        id: documentRef.id,
        ...chapterData,
        createdAt: {
          seconds: Math.floor(Date.now() / 1000)
        }
      });

      savedCount++;
    }

    clearChapterForm(false);

    showFormMessage(
      `${savedCount} chapter(s) added successfully.`,
      "success"
    );

    renderSyllabus();

  } catch (error) {

    console.error("Add syllabus chapter failed:", error);

    try {
      await loadSyllabus();
    } catch (refreshError) {
      console.error("Could not refresh syllabus:", refreshError);
    }

    showFormMessage(
      error.code === "permission-denied"
        ? `Permission denied. ${savedCount} chapter(s) were saved before the error. Check Firestore syllabus rules.`
        : `Could not save all chapters. ${savedCount} chapter(s) were saved before the error.`,
      "error"
    );

  } finally {

    isSaving = false;

    addChapterButton.disabled = false;
    clearChapterButton.disabled = false;

    setSubmitButtonMode("add");

    renderSyllabus();
  }
}


/* =========================================================
   EDIT CHAPTER
========================================================= */

function editChapter(chapterId) {

  if (isSaving) return;

  const chapter = syllabusRecords.find(
    record => record.id === chapterId
  );

  if (!chapter) {
    showFormMessage(
      "Chapter not found. Please refresh the syllabus.",
      "error"
    );
    return;
  }

  const selectedClass = getClassById(chapter.classId);

  if (!selectedClass) {
    showFormMessage(
      "The class associated with this chapter was not found.",
      "error"
    );
    return;
  }

  editingChapterId = chapterId;

  classSelect.value = chapter.classId;

  subjectInput.value =
    chapter.subject || selectedClass.subject || "";

  chapterTitleInput.value = chapter.chapterTitle || "";

  setSubmitButtonMode("edit");

  hideFormMessage();

  showFormMessage(
    "Editing chapter. Make your changes and click Update Chapter.",
    "info"
  );

  syllabusForm.scrollIntoView({
    behavior: "smooth",
    block: "center"
  });

  chapterTitleInput.focus();
}


/* =========================================================
   UPDATE EXISTING CHAPTER
========================================================= */

async function saveEditedChapter(
  chapterId,
  chapterTitle
) {

  isSaving = true;

  addChapterButton.disabled = true;
  clearChapterButton.disabled = true;

  addChapterButton.textContent = "Updating...";

  try {

    const chapterRef = doc(
      db,
      "syllabus",
      chapterId
    );

    await updateDoc(chapterRef, {

      chapterTitle: chapterTitle.trim(),

      updatedAt: serverTimestamp()

    });

    syllabusRecords = syllabusRecords.map(record =>
      record.id === chapterId
        ? {
            ...record,
            chapterTitle: chapterTitle.trim()
          }
        : record
    );

    clearChapterForm(false);

    showFormMessage(
      "Chapter updated successfully.",
      "success"
    );

    renderSyllabus();

  } catch (error) {

    console.error("Update syllabus chapter failed:", error);

    showFormMessage(
      error.code === "permission-denied"
        ? "Permission denied. Check your Firestore syllabus update rules."
        : "Could not update this chapter. Please try again.",
      "error"
    );

    try {
      await loadSyllabus();
    } catch (refreshError) {
      console.error("Could not refresh syllabus:", refreshError);
    }

  } finally {

    isSaving = false;

    addChapterButton.disabled = false;
    clearChapterButton.disabled = false;

    setSubmitButtonMode(
      editingChapterId ? "edit" : "add"
    );

    renderSyllabus();
  }
}


/* =========================================================
   DELETE CHAPTER
========================================================= */

async function deleteChapter(chapterId) {

  if (isSaving) return;

  const chapter = syllabusRecords.find(
    record => record.id === chapterId
  );

  if (!chapter) {
    showFormMessage(
      "Chapter not found. Please refresh the syllabus.",
      "error"
    );
    return;
  }

  const confirmed = window.confirm(
    `Are you sure you want to delete "${chapter.chapterTitle}"?\n\nThis action cannot be undone.`
  );

  if (!confirmed) return;

  isSaving = true;

  renderSyllabus();

  try {

    await deleteDoc(
      doc(db, "syllabus", chapterId)
    );

    syllabusRecords = syllabusRecords.filter(
      record => record.id !== chapterId
    );

    if (editingChapterId === chapterId) {
      clearChapterForm(false);
    }

    showFormMessage(
      "Chapter deleted successfully.",
      "success"
    );

    renderSyllabus();

  } catch (error) {

    console.error("Delete syllabus chapter failed:", error);

    showFormMessage(
      error.code === "permission-denied"
        ? "Permission denied. Check your Firestore syllabus delete rules."
        : "Could not delete this chapter. Please try again.",
      "error"
    );

    try {
      await loadSyllabus();
    } catch (refreshError) {
      console.error("Could not refresh syllabus:", refreshError);
    }

  } finally {

    isSaving = false;

    renderSyllabus();
  }
}


/* =========================================================
   INITIALIZE
========================================================= */

onAuthStateChanged(auth, async user => {

  if (!user) {

    currentAdmin = null;

    showListMessage(
      "Please log in to access the academy syllabus."
    );

    return;
  }

  try {

    await loadAdminProfile(user);

    await loadAcademyClasses();

    await loadSyllabus();

  } catch (error) {

    console.error(
      "Admin syllabus initialization failed:",
      error
    );

    showListMessage(
      error.code === "permission-denied"
        ? "You do not have permission to load academy syllabus data. Check Firestore rules."
        : error.message || "Could not load academy syllabus."
    );
  }
});
