import { auth, db } from "./firebase-config.js";
import {
  connectGoogleDrive,
  getDriveQuotaInfo,
  formatBytes,
  uploadFileToDrive,
  deleteDriveFile,
  isDriveConnected
} from "./google-drive-service.js";

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
const connectDriveBtn = $("connect-drive-btn");
const switchDriveBtn = $("switch-drive-btn");
const driveBadge = $("drive-connection-badge");
const driveAccountLabel = $("drive-account-label");

const statDriveStatus = $("stat-drive-status");
const statStorageUsed = $("stat-storage-used");
const statStorageRemaining = $("stat-storage-remaining");
const statStorageTotal = $("stat-storage-total");
const statMaterialsCount = $("stat-materials-count");
const quotaBar = $("drive-quota-bar");

const uploadForm = $("upload-material-form");
const classSelect = $("material-class-select");
const subjectSelect = $("material-subject-select");
const titleInput = $("material-title");
const sourceTypeSelect = $("material-source-type");
const driveFileFields = $("drive-file-fields");
const externalLinkFields = $("external-link-fields");
const fileInput = $("material-file-input");
const videoUrlInput = $("material-video-url");
const uploadProgressText = $("upload-progress-text");
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
let academyName = "Academy";
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

function toEmbedVideoUrl(url) {
  const trimmed = String(url || "").trim();
  const ytMatch = trimmed.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([A-Za-z0-9_-]{6,})/);
  if (ytMatch) {
    return `https://www.youtube.com/embed/${ytMatch[1]}`;
  }
  const vimeoMatch = trimmed.match(/vimeo\.com\/(\d+)/);
  if (vimeoMatch) {
    return `https://player.vimeo.com/video/${vimeoMatch[1]}`;
  }
  return trimmed;
}

function detectFileCategory(file) {
  const mime = String(file?.type || "").toLowerCase();
  if (mime.startsWith("image/")) return "photo";
  if (mime.startsWith("video/")) return "video";
  if (mime === "application/pdf") return "pdf";
  return "file";
}

function renderDriveStats(quota = null) {
  const connected = isDriveConnected();
  driveBadge.textContent = connected ? "Connected" : "Disconnected";
  driveBadge.classList.toggle("connected", connected);
  statDriveStatus.textContent = connected ? "Connected" : "Disconnected";
  statMaterialsCount.textContent = String(materials.length);

  if (connected && quota) {
    driveAccountLabel.textContent = `Connected Google Drive: ${quota.emailAddress}`;
    statStorageUsed.textContent = formatBytes(quota.usedBytes);
    statStorageRemaining.textContent = formatBytes(quota.remainingBytes);
    statStorageTotal.textContent = quota.limitBytes > 0 ? formatBytes(quota.limitBytes) : "Unlimited";
    quotaBar.style.width = `${quota.percentUsed}%`;
  } else {
    statStorageUsed.textContent = "—";
    statStorageRemaining.textContent = "—";
    statStorageTotal.textContent = "—";
    quotaBar.style.width = "0%";
  }
}

async function refreshQuota() {
  if (!isDriveConnected()) {
    renderDriveStats(null);
    return;
  }
  try {
    const quota = await getDriveQuotaInfo();
    renderDriveStats(quota);
  } catch (err) {
    console.warn("Quota refresh failed:", err);
  }
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
    cleanTbody.innerHTML = '<tr><td colspan="5" class="empty-state">No materials to clean.</td></tr>';
    return;
  }

  cleanTbody.innerHTML = materials.map(item => `
    <tr>
      <td><strong>${escapeHTML(item.title)}</strong></td>
      <td>${escapeHTML(item.className || "—")} · ${escapeHTML(item.subject || "—")}</td>
      <td>${escapeHTML(item.sourceType === "drive-file" ? "Google Drive" : "Video Link")}</td>
      <td>${escapeHTML(item.fileSize ? formatBytes(item.fileSize) : "—")}</td>
      <td>
        <button type="button" class="btn btn-secondary" data-delete-id="${escapeHTML(item.id)}">Delete</button>
      </td>
    </tr>
  `).join("");
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

  const academySnap = await getDoc(doc(db, "academies", teacherProfile.academyId));
  if (academySnap.exists()) {
    academyName = academySnap.data()?.name || "Academy";
  }

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
  renderDriveStats(null);
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

connectDriveBtn?.addEventListener("click", async () => {
  try {
    showMessage("Connecting to Google Drive...", "info");
    const quota = await connectGoogleDrive({ switchAccount: false });
    renderDriveStats(quota);
    showMessage(`Connected Google Drive (${quota.emailAddress}).`, "success");
  } catch (err) {
    showMessage(err.message || "Google Drive connection failed.", "error");
  }
});

switchDriveBtn?.addEventListener("click", async () => {
  try {
    showMessage("Opening Google account selector...", "info");
    const quota = await connectGoogleDrive({ switchAccount: true });
    renderDriveStats(quota);
    showMessage(`Switched to Google Drive (${quota.emailAddress}).`, "success");
  } catch (err) {
    showMessage(err.message || "Could not switch Google Drive account.", "error");
  }
});

sourceTypeSelect?.addEventListener("change", () => {
  const isDrive = sourceTypeSelect.value === "drive-file";
  driveFileFields.hidden = !isDrive;
  externalLinkFields.hidden = isDrive;
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
  uploadProgressText.textContent = "";

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
      const file = fileInput.files?.[0];
      if (!file) throw new Error("Please choose a photo, video, or PDF file.");
      if (!isDriveConnected()) {
        throw new Error("Please connect Google Drive before uploading a file.");
      }

      uploadProgressText.textContent = "Uploading to Google Drive...";
      const uploaded = await uploadFileToDrive({
        file,
        academyName,
        className: payload.className,
        subjectName: selectedSubject,
        onProgress: pct => {
          uploadProgressText.textContent = `Uploading to Google Drive: ${pct}%`;
        }
      });

      payload = {
        ...payload,
        materialType: detectFileCategory(file),
        driveFileId: uploaded.driveFileId,
        driveAccount: uploaded.driveAccount,
        fileName: uploaded.fileName,
        mimeType: uploaded.mimeType,
        fileSize: uploaded.fileSize,
        previewUrl: uploaded.previewUrl,
        imageUrl: uploaded.imageUrl
      };
      renderDriveStats(uploaded.quota);
    } else {
      const rawUrl = videoUrlInput.value.trim();
      if (!rawUrl) throw new Error("Please enter a valid video URL.");
      payload = {
        ...payload,
        materialType: "video",
        videoUrl: rawUrl,
        previewUrl: toEmbedVideoUrl(rawUrl),
        imageUrl: "",
        driveFileId: "",
        fileSize: 0
      };
    }

    await addDoc(collection(db, "studyMaterials"), payload);
    uploadForm.reset();
    populateSubjectDropdownForUpload();
    uploadProgressText.textContent = "";
    showMessage("Study material saved successfully.", "success");
    await loadMaterials();
  } catch (err) {
    console.error("Upload failed:", err);
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
    if (item.sourceType === "drive-file" && item.driveFileId) {
      if (!isDriveConnected()) {
        throw new Error("Connect Google Drive first so the file can be removed from Drive.");
      }
      await deleteDriveFile(item.driveFileId);
    }
    await deleteDoc(doc(db, "studyMaterials", item.id));
    showMessage(`Deleted "${item.title}" and cleaned storage.`, "success");
    await loadMaterials();
    await refreshQuota();
  } catch (err) {
    console.error("Delete failed:", err);
    showMessage(err.message || "Could not delete material.", "error");
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