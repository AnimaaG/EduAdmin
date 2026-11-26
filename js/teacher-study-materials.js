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
  deleteDoc,
  query,
  where,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

const $ = id => document.getElementById(id);

const messageBox = $("materials-message");

const openSavedFolderBtn = $("open-saved-folder-btn");
const driveShortcutStatus = $("drive-shortcut-status");
const folderUrlInput = $("shared-folder-url-input");
const saveFolderBtn = $("save-folder-shortcut-btn");
const clearFolderBtn = $("clear-folder-shortcut-btn");

const statAssignedClasses = $("stat-assigned-classes");
const statMaterialsCount = $("stat-materials-count");
const statFolderShortcut = $("stat-folder-shortcut");

const uploadForm = $("upload-material-form");
const classSelect = $("material-class-select");
const subjectSelect = $("material-subject-select");
const titleInput = $("material-title");
const sourceTypeSelect = $("material-source-type");
const driveLinkFields = $("drive-link-fields");
const externalLinkFields = $("external-link-fields");
const driveUrlInput = $("material-drive-url");
const videoUrlInput = $("material-video-url");
const testPreviewBtn = $("test-link-preview-btn");
const driveLinkStatus = $("drive-link-status");
const inlinePreviewBox = $("inline-link-preview");
const submitBtn = $("submit-material-btn");

const filterClassSelect = $("filter-class-select");
const filterSubjectSelect = $("filter-subject-select");
const viewTbody = $("view-materials-tbody");
const cleanTbody = $("clean-materials-tbody");

const viewerModal = $("material-viewer-modal");
const viewerTitle = $("viewer-modal-title");
const viewerBody = $("viewer-modal-body");
const closeViewerBtn = $("close-viewer-modal");

let teacherProfile = null;
let assignedClasses = [];
let materials = [];

function showMessage(text, type = "info") {
  if (!messageBox) return;
  messageBox.textContent = text;
  messageBox.className = `form-message ${type}`;
  messageBox.hidden = !text;
}

function escapeHTML(val) {
  return String(val ?? "").replace(/[&<>"']/g, ch => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[ch]));
}

function getFolderStorageKey() {
  const uid = auth.currentUser?.uid || teacherProfile?.uid || "default";
  return `eduadmin_drive_folder_${uid}`;
}

function extractDriveFileId(rawUrl) {
  const input = String(rawUrl || "").trim();
  if (!input) return "";

  if (/^[a-zA-Z0-9_-]{15,}$/.test(input)) {
    return input;
  }

  const patterns = [
    /\/file\/d\/([a-zA-Z0-9_-]+)/,
    /\/d\/([a-zA-Z0-9_-]+)/,
    /[?&]id=([a-zA-Z0-9_-]+)/
  ];

  for (const re of patterns) {
    const match = input.match(re);
    if (match && match[1]) return match[1];
  }

  return "";
}

function extractDriveFolderUrl(rawUrl) {
  const input = String(rawUrl || "").trim();
  if (!input) return "";

  const folderMatch = input.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (folderMatch && folderMatch[1]) {
    return `https://drive.google.com/drive/folders/${folderMatch[1]}`;
  }

  if (/^[a-zA-Z0-9_-]{15,}$/.test(input)) {
    return `https://drive.google.com/drive/folders/${input}`;
  }

  try {
    const parsed = new URL(input);
    if (parsed.hostname.endsWith("google.com") && parsed.pathname.includes("/drive/")) {
      return parsed.toString();
    }
  } catch {
    return "";
  }

  return "";
}

function buildDriveLinks(rawUrl) {
  const trimmed = String(rawUrl || "").trim();
  const fileId = extractDriveFileId(trimmed);

  if (fileId) {
    return {
      driveFileId: fileId,
      viewUrl: `https://drive.google.com/file/d/${fileId}/view`,
      previewUrl: `https://drive.google.com/file/d/${fileId}/preview`,
      imageUrl: `https://drive.google.com/thumbnail?id=${fileId}&sz=w1200`
    };
  }

  return {
    driveFileId: "",
    viewUrl: trimmed,
    previewUrl: trimmed,
    imageUrl: trimmed
  };
}

function toEmbedVideoUrl(url) {
  const trimmed = String(url || "").trim();
  const ytMatch = trimmed.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([A-Za-z0-9_-]{6,})/);
  if (ytMatch) {
    return `https://www.youtube.com/embed/${ytMatch[1]}`;
  }
  const vimeoMatch = trimmed.match(/vimeo\.com\/(\d+)/);
  if (vimeoMatch) {
    return `https://player.vimeo.com/video/${vimeoMatch[1]}`;
  }
  return trimmed;
}

function detectMaterialType(title, url) {
  const combined = `${title || ""} ${url || ""}`.toLowerCase();
  if (/\.(png|jpe?g|gif|webp|bmp|svg)(\?|#|$)/i.test(combined)) return "photo";
  if (/\.(mp4|mov|webm|mkv|avi)(\?|#|$)/i.test(combined) || /youtube\.com|youtu\.be|vimeo\.com/i.test(combined)) {
    return "video";
  }
  if (/\.pdf(\?|#|$)/i.test(combined) || /notes|worksheet|chapter|pdf/i.test(title || "")) {
    return "pdf";
  }
  return "file";
}

function syncFolderShortcutUI() {
  const savedUrl = localStorage.getItem(getFolderStorageKey()) || "";
  if (folderUrlInput && document.activeElement !== folderUrlInput) {
    folderUrlInput.value = savedUrl;
  }

  if (savedUrl) {
    if (openSavedFolderBtn) {
      openSavedFolderBtn.href = savedUrl;
      openSavedFolderBtn.hidden = false;
    }
    if (statFolderShortcut) statFolderShortcut.textContent = "Saved";
    if (driveShortcutStatus) {
      driveShortcutStatus.textContent =
        "Saved folder shortcut ready—click 'Open Saved Drive Folder' to drop files straight into your shared folder.";
    }
  } else {
    if (openSavedFolderBtn) {
      openSavedFolderBtn.href = "#";
      openSavedFolderBtn.hidden = true;
    }
    if (statFolderShortcut) statFolderShortcut.textContent = "Not Set";
    if (driveShortcutStatus) {
      driveShortcutStatus.textContent =
        "Uses your own Google Drive storage with no extra login or app approval needed.";
    }
  }
}

function renderInlinePreview(rawUrl) {
  if (!inlinePreviewBox || !driveLinkStatus) return;

  const trimmed = String(rawUrl || "").trim();
  if (!trimmed) {
    inlinePreviewBox.hidden = true;
    inlinePreviewBox.innerHTML = "";
    driveLinkStatus.className = "link-status-hint";
    driveLinkStatus.textContent = "Paste any Google Drive file link—EduAdmin will format it for in-app viewing.";
    return;
  }

  const parsed = buildDriveLinks(trimmed);
  if (!parsed.driveFileId) {
    driveLinkStatus.className = "link-status-hint warn";
    driveLinkStatus.textContent =
      "Could not detect a Drive file ID. Make sure you copied a file link (not a folder link) set to 'Anyone with the link'.";
    inlinePreviewBox.hidden = true;
    inlinePreviewBox.innerHTML = "";
    return;
  }

  driveLinkStatus.className = "link-status-hint ok";
  driveLinkStatus.textContent =
    "Drive file link detected. Check the preview below—if you see a sign-in or access wall, set sharing in Drive to 'Anyone with the link'.";

  inlinePreviewBox.hidden = false;
  inlinePreviewBox.innerHTML = `
    <iframe
      src="${escapeHTML(parsed.previewUrl)}"
      style="width: 100%; height: 280px; border: 0; border-radius: 8px; background: #ffffff;"
      allow="autoplay; encrypted-media"
      allowfullscreen
    ></iframe>
  `;
}

function getSubjectsForClass(classItem) {
  if (!classItem) return ["General"];
  const subs = Array.isArray(classItem.subjects)
    ? classItem.subjects.map(s => s.subjectName || s.name).filter(Boolean)
    : [];
  if (subs.length) return [...new Set(subs)];
  return classItem.subject ? [classItem.subject] : ["General"];
}

function populateClassDropdowns() {
  const optionsHtml = assignedClasses
    .map(c => `<option value="${escapeHTML(c.id)}">${escapeHTML(c.className || c.name || "Class")}</option>`)
    .join("");

  classSelect.innerHTML = optionsHtml || '<option value="">No assigned classes</option>';
  filterClassSelect.innerHTML = '<option value="">All Assigned Classes</option>' + optionsHtml;
  statAssignedClasses.textContent = String(assignedClasses.length);

  populateSubjectDropdownForUpload();
  populateSubjectDropdownForFilter();
}

function populateSubjectDropdownForUpload() {
  const cls = assignedClasses.find(c => c.id === classSelect.value);
  const subjects = getSubjectsForClass(cls);
  subjectSelect.innerHTML = subjects
    .map(sub => `<option value="${escapeHTML(sub)}">${escapeHTML(sub)}</option>`)
    .join("");
}

function populateSubjectDropdownForFilter() {
  const selectedClsId = filterClassSelect.value;
  const pool = selectedClsId
    ? assignedClasses.filter(c => c.id === selectedClsId)
    : assignedClasses;

  const allSubs = [...new Set(pool.flatMap(c => getSubjectsForClass(c)))];
  const prev = filterSubjectSelect.value;
  filterSubjectSelect.innerHTML = '<option value="">All Subjects</option>' + allSubs
    .map(sub => `<option value="${escapeHTML(sub)}">${escapeHTML(sub)}</option>`)
    .join("");
  if (allSubs.includes(prev)) filterSubjectSelect.value = prev;
}

function renderViewList() {
  const clsFilter = filterClassSelect.value;
  const subFilter = filterSubjectSelect.value;

  const filtered = materials.filter(item => {
    if (clsFilter && item.classId !== clsFilter) return false;
    if (subFilter && item.subject !== subFilter) return false;
    return true;
  });

  if (!filtered.length) {
    viewTbody.innerHTML = '<tr><td colspan="6" class="empty-state">No study materials found for this selection.</td></tr>';
    return;
  }

  viewTbody.innerHTML = filtered.map(item => `
    <tr>
      <td><strong>${escapeHTML(item.title)}</strong></td>
      <td>${escapeHTML(item.className || "—")}</td>
      <td>${escapeHTML(item.subject || "—")}</td>
      <td>${escapeHTML(String(item.materialType || "file").toUpperCase())}</td>
      <td>${escapeHTML(item.createdAtDate || "—")}</td>
      <td>
        <button type="button" class="btn btn-secondary" data-view-id="${escapeHTML(item.id)}">View</button>
      </td>
    </tr>
  `).join("");
}

function renderCleanList() {
  if (!materials.length) {
    cleanTbody.innerHTML = '<tr><td colspan="5" class="empty-state">No materials to manage.</td></tr>';
    return;
  }

  cleanTbody.innerHTML = materials.map(item => {
    const openHref = item.viewUrl || item.videoUrl || item.previewUrl || "#";
    return `
      <tr>
        <td><strong>${escapeHTML(item.title)}</strong></td>
        <td>${escapeHTML(item.className || "—")} · ${escapeHTML(item.subject || "—")}</td>
        <td>${escapeHTML(item.sourceType === "drive-file" ? "Google Drive" : "Video Link")}</td>
        <td>
          <a href="${escapeHTML(openHref)}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary">
            Open Link
          </a>
        </td>
        <td>
          <button type="button" class="btn btn-secondary" data-delete-id="${escapeHTML(item.id)}">Delete</button>
        </td>
      </tr>
    `;
  }).join("");
}

function openMaterialViewer(item) {
  viewerTitle.textContent = item.title || "Study Material";
  viewerBody.innerHTML = "";

  if (item.materialType === "photo" && item.imageUrl) {
    const img = document.createElement("img");
    img.src = item.imageUrl;
    img.alt = item.title || "Material image";
    img.style.maxWidth = "100%";
    img.style.maxHeight = "70vh";
    img.style.borderRadius = "8px";
    viewerBody.appendChild(img);
  } else if (item.previewUrl) {
    const iframe = document.createElement("iframe");
    iframe.src = item.previewUrl;
    iframe.style.width = "100%";
    iframe.style.height = "68vh";
    iframe.style.border = "0";
    iframe.allow = "autoplay; encrypted-media";
    iframe.allowFullscreen = true;
    viewerBody.appendChild(iframe);
  } else {
    viewerBody.textContent = "Preview unavailable for this item.";
  }

  viewerModal.hidden = false;
}

async function loadMaterials() {
  if (!teacherProfile?.academyId || !auth.currentUser) return;

  const snap = await getDocs(query(
    collection(db, "studyMaterials"),
    where("academyId", "==", teacherProfile.academyId),
    where("uploadedBy", "==", auth.currentUser.uid)
  ));

  materials = snap.docs.map(d => {
    const data = d.data();
    const createdDate = data.createdAt?.toDate ? data.createdAt.toDate() : null;
    return {
      id: d.id,
      ...data,
      createdAtDate: createdDate
        ? createdDate.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })
        : "—"
    };
  });

  statMaterialsCount.textContent = String(materials.length);
  renderViewList();
  renderCleanList();
}

async function loadTeacherSetup(user) {
  const profileSnap = await getDoc(doc(db, "users", user.uid));
  if (!profileSnap.exists()) throw new Error("Teacher profile not found.");

  teacherProfile = { ...profileSnap.data(), uid: user.uid };
  if (teacherProfile.role !== "teacher" || teacherProfile.isActive !== true || !teacherProfile.academyId) {
    throw new Error("Active teacher account is required.");
  }

  syncFolderShortcutUI();

  const classSnap = await getDocs(query(
    collection(db, "classes"),
    where("academyId", "==", teacherProfile.academyId)
  ));

  assignedClasses = classSnap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(c => {
      if (String(c.status || "").toLowerCase() !== "active") return false;
      if (c.teacherId === user.uid) return true;
      const subs = Array.isArray(c.subjects) ? c.subjects : [];
      return subs.some(s => s.teacherId === user.uid);
    });

  populateClassDropdowns();
  await loadMaterials();
}

// Sub-button tab switching
document.querySelectorAll(".sub-tab-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    const tab = btn.dataset.tab;
    document.querySelectorAll(".sub-tab-btn").forEach(b => b.classList.toggle("active", b === btn));
    $("panel-upload").hidden = tab !== "upload";
    $("panel-view").hidden = tab !== "view";
    $("panel-clean").hidden = tab !== "clean";
  });
});

// Optional shared Drive folder shortcut
saveFolderBtn?.addEventListener("click", () => {
  const cleanFolderUrl = extractDriveFolderUrl(folderUrlInput?.value);
  if (!cleanFolderUrl) {
    showMessage("Paste a valid Google Drive folder URL (containing /folders/...).", "error");
    return;
  }
  localStorage.setItem(getFolderStorageKey(), cleanFolderUrl);
  syncFolderShortcutUI();
  showMessage("Saved your Google Drive folder shortcut for quick repeat uploads.", "success");
});

clearFolderBtn?.addEventListener("click", () => {
  localStorage.removeItem(getFolderStorageKey());
  if (folderUrlInput) folderUrlInput.value = "";
  syncFolderShortcutUI();
  showMessage("Cleared saved Google Drive folder shortcut.", "info");
});

// Source type toggle & live preview check
sourceTypeSelect?.addEventListener("change", () => {
  const isDrive = sourceTypeSelect.value === "drive-file";
  driveLinkFields.hidden = !isDrive;
  externalLinkFields.hidden = isDrive;
});

testPreviewBtn?.addEventListener("click", () => {
  renderInlinePreview(driveUrlInput?.value);
});

driveUrlInput?.addEventListener("paste", () => {
  setTimeout(() => renderInlinePreview(driveUrlInput.value), 0);
});

classSelect?.addEventListener("change", populateSubjectDropdownForUpload);
filterClassSelect?.addEventListener("change", () => {
  populateSubjectDropdownForFilter();
  renderViewList();
});
filterSubjectSelect?.addEventListener("change", renderViewList);

uploadForm?.addEventListener("submit", async event => {
  event.preventDefault();
  if (!teacherProfile || !auth.currentUser) return;

  const selectedClass = assignedClasses.find(c => c.id === classSelect.value);
  const selectedSubject = subjectSelect.value;
  const title = titleInput.value.trim();
  const sourceType = sourceTypeSelect.value;

  if (!selectedClass || !selectedSubject || !title) {
    showMessage("Please select class, subject, and enter a title.", "error");
    return;
  }

  submitBtn.disabled = true;

  try {
    let payload = {
      academyId: teacherProfile.academyId,
      classId: selectedClass.id,
      className: selectedClass.className || selectedClass.name || "Class",
      subject: selectedSubject,
      title,
      sourceType,
      uploadedBy: auth.currentUser.uid,
      uploadedByName: teacherProfile.fullName || teacherProfile.name || "Teacher",
      createdAt: serverTimestamp()
    };

    if (sourceType === "drive-file") {
      const rawDriveUrl = driveUrlInput.value.trim();
      if (!rawDriveUrl) {
        throw new Error("Please paste your Google Drive file link.");
      }

      const driveLinks = buildDriveLinks(rawDriveUrl);
      if (!driveLinks.driveFileId) {
        throw new Error("Please paste a valid Google Drive file link (e.g. https://drive.google.com/file/d/.../view).");
      }

      payload = {
        ...payload,
        materialType: detectMaterialType(title, rawDriveUrl),
        driveFileId: driveLinks.driveFileId,
        viewUrl: driveLinks.viewUrl,
        previewUrl: driveLinks.previewUrl,
        imageUrl: driveLinks.imageUrl,
        videoUrl: ""
      };
    } else {
      const rawUrl = videoUrlInput.value.trim();
      if (!rawUrl) {
        throw new Error("Please enter a valid video URL.");
      }

      payload = {
        ...payload,
        materialType: "video",
        videoUrl: rawUrl,
        viewUrl: rawUrl,
        previewUrl: toEmbedVideoUrl(rawUrl),
        imageUrl: "",
        driveFileId: ""
      };
    }

    await addDoc(collection(db, "studyMaterials"), payload);
    uploadForm.reset();
    syncFolderShortcutUI();
    populateSubjectDropdownForUpload();
    renderInlinePreview("");
    showMessage("Study material saved successfully.", "success");
    await loadMaterials();
  } catch (err) {
    console.error("Save failed:", err);
    showMessage(err.message || "Could not save study material.", "error");
  } finally {
    submitBtn.disabled = false;
  }
});

viewTbody?.addEventListener("click", event => {
  const btn = event.target.closest("button[data-view-id]");
  if (!btn) return;
  const item = materials.find(m => m.id === btn.dataset.viewId);
  if (item) openMaterialViewer(item);
});

cleanTbody?.addEventListener("click", async event => {
  const btn = event.target.closest("button[data-delete-id]");
  if (!btn) return;
  const item = materials.find(m => m.id === btn.dataset.deleteId);
  if (!item) return;

  btn.disabled = true;
  try {
    await deleteDoc(doc(db, "studyMaterials", item.id));
    showMessage(`Removed "${item.title}" from EduAdmin.`, "success");
    await loadMaterials();
  } catch (err) {
    console.error("Delete failed:", err);
    showMessage(err.message || "Could not remove material.", "error");
    btn.disabled = false;
  }
});

closeViewerBtn?.addEventListener("click", () => {
  viewerModal.hidden = true;
  viewerBody.innerHTML = "";
});

onAuthStateChanged(auth, async user => {
  if (!user) {
    window.location.href = "../../index.html";
    return;
  }
  try {
    await loadTeacherSetup(user);
  } catch (err) {
    console.error("Study materials init failed:", err);
    showMessage(err.message || "Unable to load study materials.", "error");
  }
});