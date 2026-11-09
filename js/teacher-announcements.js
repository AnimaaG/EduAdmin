
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
  where,
  addDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

const form = document.getElementById("announcement-form");
const messageBox = document.getElementById("announcement-message");
const titleInput = document.getElementById("announcement-title");
const bodyInput = document.getElementById("announcement-message-text");
const dateInput = document.getElementById("announcement-date");
const targetSelect = document.getElementById("announcement-target");
const classFields = document.getElementById("class-fields");
const classSelect = document.getElementById("announcement-class");
const publishButton = document.getElementById("publish-announcement");
const cancelEditButton = document.getElementById("cancel-edit");
const announcementsContainer = document.getElementById("my-announcements");

let currentTeacher = null;
let teacherClasses = [];
let editingAnnouncementId = null;

function showMessage(message, isError = false) {
  messageBox.hidden = !message;
  messageBox.textContent = message;
  messageBox.style.color = isError ? "red" : "green";
}

function escapeHTML(value = "") {
  return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function localDateString() {
  const date = new Date();
  const offset = date.getTimezoneOffset();

  return new Date(date.getTime() - offset * 60000)
    .toISOString()
    .slice(0, 10);
}

dateInput.value = localDateString();

function updateTargetFields() {
  const isClassTarget = targetSelect.value === "class";

  classFields.hidden = !isClassTarget;
  classSelect.required = isClassTarget;
}

targetSelect.addEventListener("change", updateTargetFields);

async function loadTeacherClasses() {
  const classesQuery = query(
    collection(db, "classes"),
    where("academyId", "==", currentTeacher.academyId),
    where("teacherId", "==", currentTeacher.uid)
  );

  const snapshot = await getDocs(classesQuery);

  teacherClasses = snapshot.docs
    .map(item => ({
      id: item.id,
      ...item.data()
    }))
    .filter(item => item.status === "active");

  classSelect.innerHTML =
    '<option value="">Select a class</option>';

  teacherClasses.forEach(item => {
    const option = document.createElement("option");

    option.value = item.id;
    option.textContent =
      `${item.className || "Class"} - ${item.subject || "Subject"}`;

    classSelect.appendChild(option);
  });

  if (!teacherClasses.length) {
    classSelect.innerHTML =
      '<option value="">No assigned active classes found</option>';
  }
}

function resetAnnouncementForm() {
  form.reset();

  editingAnnouncementId = null;

  dateInput.value = localDateString();

  targetSelect.value = "academy";
  classSelect.value = "";

  updateTargetFields();

  publishButton.textContent = "Publish Announcement";
  cancelEditButton.hidden = true;
}

function startEditingAnnouncement(item) {
  editingAnnouncementId = item.id;

  titleInput.value = item.title || "";
  bodyInput.value = item.message || "";
  dateInput.value = item.announcementDate || localDateString();

  targetSelect.value = item.targetType || "academy";

  updateTargetFields();

  if (item.targetType === "class") {
    const selectedClass = teacherClasses.find(
      classItem => classItem.id === item.classId
    );

    if (!selectedClass) {
      showMessage(
        "This class is no longer assigned to you or is inactive. You cannot edit this announcement's class selection.",
        true
      );

      editingAnnouncementId = null;
      return;
    }

    classSelect.value = item.classId;
  }

  publishButton.textContent = "Save Changes";
  cancelEditButton.hidden = false;

  showMessage("Editing announcement.");

  form.scrollIntoView({
    behavior: "smooth",
    block: "start"
  });

  titleInput.focus();
}

async function loadMyAnnouncements() {
  const announcementsQuery = query(
    collection(db, "notifications"),
    where("academyId", "==", currentTeacher.academyId),
    where("teacherId", "==", currentTeacher.uid),
    where("recipientRole", "==", "student"),
    where("type", "==", "announcement")
  );

  const snapshot = await getDocs(announcementsQuery);

  const announcements = snapshot.docs
    .map(item => ({
      id: item.id,
      ...item.data()
    }))
    .sort((a, b) => {
      const dateA = a.createdAt?.toMillis?.() || 0;
      const dateB = b.createdAt?.toMillis?.() || 0;

      return dateB - dateA;
    });

  if (!announcements.length) {
    announcementsContainer.innerHTML =
      "<p>You have not posted any announcements yet.</p>";

    return;
  }

  announcementsContainer.innerHTML = announcements.map(item => `
    <article class="announcement-card">

      <h3>${escapeHTML(item.title)}</h3>

      <p>${escapeHTML(item.message)}</p>

      <p>
        <strong>Posted by:</strong>
        ${escapeHTML(item.teacherName)}
      </p>

      <p>
        <strong>Class:</strong>
        ${
          item.targetType === "academy"
            ? "All Students"
            : escapeHTML(item.className || "Class")
        }
      </p>

      <p>
        <strong>Subject:</strong>
        ${
          item.targetType === "academy"
            ? "All Subjects"
            : escapeHTML(item.subject || "")
        }
      </p>

      <p>
        <strong>Announcement date:</strong>
        ${escapeHTML(item.announcementDate || "")}
      </p>

      <div class="announcement-actions">

        <button
          type="button"
          class="edit-announcement"
          data-action="edit"
          data-id="${escapeHTML(item.id)}"
        >
          Edit
        </button>

        <button
          type="button"
          class="delete-announcement"
          data-action="delete"
          data-id="${escapeHTML(item.id)}"
        >
          Delete
        </button>

      </div>

    </article>
  `).join("");
}

// Handle Edit and Delete button clicks.
announcementsContainer.addEventListener("click", async event => {
  const button = event.target.closest("button[data-action]");

  if (!button) return;

  const announcementId = button.dataset.id;
  const action = button.dataset.action;

  const announcementRef = doc(
    db,
    "notifications",
    announcementId
  );

  if (action === "edit") {
    try {
      const snapshot = await getDoc(announcementRef);

      if (!snapshot.exists()) {
        showMessage("Announcement no longer exists.", true);
        await loadMyAnnouncements();
        return;
      }

      const item = {
        id: snapshot.id,
        ...snapshot.data()
      };

      // Verify ownership before loading the form.
      if (
        item.teacherId !== currentTeacher.uid ||
        item.academyId !== currentTeacher.academyId ||
        item.type !== "announcement"
      ) {
        showMessage("You cannot edit this announcement.", true);
        return;
      }

      startEditingAnnouncement(item);

    } catch (error) {
      console.error("Announcement edit failed:", error);
      showMessage("Could not open this announcement for editing.", true);
    }
  }

  if (action === "delete") {
    const confirmed = window.confirm(
      "Are you sure you want to delete this announcement? This action cannot be undone."
    );

    if (!confirmed) return;

    button.disabled = true;

    try {
      const snapshot = await getDoc(announcementRef);

      if (!snapshot.exists()) {
        showMessage("Announcement no longer exists.", true);
        await loadMyAnnouncements();
        return;
      }

      const item = snapshot.data();

      if (
        item.teacherId !== currentTeacher.uid ||
        item.academyId !== currentTeacher.academyId ||
        item.type !== "announcement"
      ) {
        showMessage("You cannot delete this announcement.", true);
        return;
      }

      await deleteDoc(announcementRef);

      if (editingAnnouncementId === announcementId) {
        resetAnnouncementForm();
      }

      showMessage("Announcement deleted successfully.");

      await loadMyAnnouncements();

    } catch (error) {
      console.error("Announcement deletion failed:", error);

      showMessage(
        error.code === "permission-denied"
          ? "Firestore denied deletion. Check your notification security rules."
          : "Could not delete the announcement.",
        true
      );

    } finally {
      button.disabled = false;
    }
  }
});

// Cancel editing.
cancelEditButton.addEventListener("click", () => {
  resetAnnouncementForm();
  showMessage("Editing cancelled.");
});

// Create a new announcement or update an existing one.
form.addEventListener("submit", async event => {
  event.preventDefault();

  showMessage("");

  if (!currentTeacher) {
    showMessage("Teacher account is not ready.", true);
    return;
  }

  const title = titleInput.value.trim();
  const message = bodyInput.value.trim();
  const announcementDate = dateInput.value;
  const targetType = targetSelect.value;

  if (!title || !message || !announcementDate) {
    showMessage("Please complete all required fields.", true);
    return;
  }

  let classData = null;

  if (targetType === "class") {
    classData = teacherClasses.find(
      item => item.id === classSelect.value
    );

    if (!classData) {
      showMessage(
        "Please select one of your assigned active classes.",
        true
      );
      return;
    }
  }

  publishButton.disabled = true;
  cancelEditButton.disabled = true;

  try {
    const announcementData = {
      title,
      message,
      announcementDate,
      targetType,
      classId: classData?.id || null,
      className: classData?.className || null,
      subject: classData?.subject || null
    };

    if (editingAnnouncementId) {
      // Update existing announcement.
      const announcementRef = doc(
        db,
        "notifications",
        editingAnnouncementId
      );

      await updateDoc(
        announcementRef,
        announcementData
      );

      showMessage("Announcement updated successfully.");

    } else {
      // Create new announcement.
      await addDoc(collection(db, "notifications"), {
        academyId: currentTeacher.academyId,

        ...announcementData,

        type: "announcement",
        recipientRole: "student",

        teacherId: currentTeacher.uid,
        teacherName: currentTeacher.name,

        read: false,
        isRead: false,
        createdAt: serverTimestamp()
      });

      showMessage("Announcement published successfully.");
    }

    resetAnnouncementForm();

    await loadMyAnnouncements();

  } catch (error) {
    console.error("Announcement save failed:", error);

    showMessage(
      error.code === "permission-denied"
        ? "Firestore denied this action. Check your notification security rules."
        : "Could not save the announcement. Please try again.",
      true
    );

  } finally {
    publishButton.disabled = false;
    cancelEditButton.disabled = false;
  }
});

// Authenticate teacher and load page data.
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
      throw new Error("Teacher profile not found.");
    }

    const profile = profileSnapshot.data();

    if (
      profile.role !== "teacher" ||
      profile.isActive !== true ||
      !profile.academyId
    ) {
      throw new Error("An active teacher account is required.");
    }

    currentTeacher = {
      uid: user.uid,
      academyId: profile.academyId,
      name:
        profile.name ||
        profile.fullName ||
        user.displayName ||
        "Teacher"
    };

    await loadTeacherClasses();
    await loadMyAnnouncements();

  } catch (error) {
    console.error(error);

    showMessage(
      error.message || "Could not load teacher information.",
      true
    );
  }
});
