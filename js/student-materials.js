import { auth, db } from "./firebase-config.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";

import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  where
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);

  const messageBox = $("student-materials-message");
  const statClassEl = $("stat-student-class");
  const statTotalEl = $("stat-total-materials");
  const statSavedEl = $("stat-saved-materials");

  const searchInput = $("student-material-search");
  const subjectFilter = $("student-subject-filter");
  const typeFilter = $("student-material-type-filter");

  const browseTbody = $("browse-materials-tbody");
  const myTbody = $("my-materials-tbody");

  const viewerModal = $("student-viewer-modal");
  const viewerTitle = $("student-viewer-title");
  const viewerExternalLink = $("student-viewer-external-link");
  const viewerBody = $("student-viewer-body");
  const closeViewerBtn = $("close-student-viewer-modal");

  let studentProfile = null;
  let allMaterials = [];
  let savedMaterialIds = new Set();
  let unsubscribeMaterials = null;

  function showMessage(text, type = "info") {
    if (!messageBox) return;
    messageBox.textContent = text;
    messageBox.className = `form-message ${type}`;
    messageBox.hidden = !text;
  }

  function escapeHTML(val) {
    return String(val ?? "").replace(/[&<>"']/g, (ch) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[ch]));
  }

  function getSavedStorageKey() {
    const uid = auth.currentUser?.uid || studentProfile?.uid || "student";
    return `eduadmin_saved_materials_${uid}`;
  }

  function loadSavedIds() {
    try {
      const raw = localStorage.getItem(getSavedStorageKey());
      const parsed = raw ? JSON.parse(raw) : [];
      savedMaterialIds = new Set(Array.isArray(parsed) ? parsed : []);
    } catch {
      savedMaterialIds = new Set();
    }
  }

  function persistSavedIds() {
    try {
      localStorage.setItem(getSavedStorageKey(), JSON.stringify(Array.from(savedMaterialIds)));
    } catch (err) {
      console.warn("Could not save bookmarked materials locally:", err);
    }
  }

  function matchesStudentClass(item) {
    if (!studentProfile || !item) return false;

    const sClassId = studentProfile.classId || "";
    const sClassIds = Array.isArray(studentProfile.classIds) ? studentProfile.classIds : [];
    const sClassName = String(studentProfile.className || "").trim().toLowerCase();

    const itemClassId = item.classId || "";
    const itemClassName = String(item.className || "").trim().toLowerCase();

    // If student has no class restriction assigned yet, show academy materials
    if (!sClassId && !sClassIds.length && !sClassName) return true;

    if (sClassId && itemClassId && sClassId === itemClassId) return true;
    if (itemClassId && sClassIds.includes(itemClassId)) return true;
    if (sClassName && itemClassName && sClassName === itemClassName) return true;

    return false;
  }

  function updateStats() {
    if (statClassEl) {
      statClassEl.textContent =
        studentProfile?.className ||
        (Array.isArray(studentProfile?.classIds) && studentProfile.classIds.length
          ? `${studentProfile.classIds.length} Classes`
          : "All Classes");
    }
    if (statTotalEl) statTotalEl.textContent = String(allMaterials.length);

    const validSavedCount = allMaterials.filter((m) => savedMaterialIds.has(m.id)).length;
    if (statSavedEl) statSavedEl.textContent = String(validSavedCount);
  }

  function populateSubjectDropdown() {
    if (!subjectFilter) return;
    const prev = subjectFilter.value;
    const subjects = [...new Set(allMaterials.map((m) => m.subject).filter(Boolean))].sort();

    subjectFilter.innerHTML =
      '<option value="all">All Subjects</option>' +
      subjects.map((sub) => `<option value="${escapeHTML(sub)}">${escapeHTML(sub)}</option>`).join("");

    if (subjects.includes(prev)) {
      subjectFilter.value = prev;
    }
  }

  function renderBrowseTable() {
    if (!browseTbody) return;

    const term = String(searchInput?.value || "").trim().toLowerCase();
    const subVal = subjectFilter?.value || "all";
    const typeVal = typeFilter?.value || "all";

    const filtered = allMaterials.filter((item) => {
      if (subVal !== "all" && item.subject !== subVal) return false;
      if (typeVal !== "all" && (item.materialType || "file") !== typeVal) return false;

      if (term) {
        const hay = `${item.title || ""} ${item.subject || ""} ${item.className || ""} ${item.uploadedByName || ""}`.toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });

    if (!filtered.length) {
      browseTbody.innerHTML = `
        <tr>
          <td colspan="7" class="empty-state">
            <strong>No study materials found</strong>
            <p>No materials match your current filter or none have been published for your class yet.</p>
          </td>
        </tr>
      `;
      return;
    }

    browseTbody.innerHTML = filtered.map((item) => {
      const isSaved = savedMaterialIds.has(item.id);
      return `
        <tr>
          <td><strong>${escapeHTML(item.title || "Untitled Material")}</strong></td>
          <td>${escapeHTML(item.subject || "—")}</td>
          <td>${escapeHTML(item.className || "—")}</td>
          <td>${escapeHTML(String(item.materialType || "file").toUpperCase())}</td>
          <td>${escapeHTML(item.uploadedByName || "Teacher")}</td>
          <td>${escapeHTML(item.createdAtDate || "—")}</td>
          <td>
            <div class="action-btn-group">
              <button type="button" class="btn btn-primary" data-view-id="${escapeHTML(item.id)}">View</button>
              <button type="button" class="btn btn-secondary" data-toggle-save-id="${escapeHTML(item.id)}">
                ${isSaved ? "Saved ✓" : "Save"}
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join("");
  }

  function renderMyMaterialsTable() {
    if (!myTbody) return;

    const savedList = allMaterials.filter((item) => savedMaterialIds.has(item.id));

    if (!savedList.length) {
      myTbody.innerHTML = `
        <tr>
          <td colspan="6" class="empty-state">
            <strong>No saved materials yet</strong>
            <p>Click <strong>Save</strong> on any material in Browse Material to keep it here for quick revision.</p>
          </td>
        </tr>
      `;
      return;
    }

    myTbody.innerHTML = savedList.map((item) => `
      <tr>
        <td><strong>${escapeHTML(item.title || "Untitled Material")}</strong></td>
        <td>${escapeHTML(item.subject || "—")}</td>
        <td>${escapeHTML(item.className || "—")}</td>
        <td>${escapeHTML(String(item.materialType || "file").toUpperCase())}</td>
        <td>${escapeHTML(item.uploadedByName || "Teacher")}</td>
        <td>
          <div class="action-btn-group">
            <button type="button" class="btn btn-primary" data-view-id="${escapeHTML(item.id)}">View</button>
            <button type="button" class="btn btn-secondary" data-toggle-save-id="${escapeHTML(item.id)}">Remove</button>
          </div>
        </td>
      </tr>
    `).join("");
  }

  function openMaterialViewer(item) {
    if (!viewerModal || !viewerTitle || !viewerBody) return;

    viewerTitle.textContent = item.title || "Study Material";
    viewerBody.innerHTML = "";

    const externalHref = item.viewUrl || item.videoUrl || item.previewUrl || "#";
    if (viewerExternalLink) {
      viewerExternalLink.href = externalHref;
      viewerExternalLink.hidden = externalHref === "#";
    }

    if (item.materialType === "photo" && item.imageUrl) {
      const img = document.createElement("img");
      img.src = item.imageUrl;
      img.alt = item.title || "Study material image";
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
      viewerBody.textContent = "Preview unavailable. Use 'Open in New Tab' to view this file.";
    }

    viewerModal.hidden = false;
  }

  function toggleSaveMaterial(materialId) {
    if (!materialId) return;
    if (savedMaterialIds.has(materialId)) {
      savedMaterialIds.delete(materialId);
    } else {
      savedMaterialIds.add(materialId);
    }
    persistSavedIds();
    updateStats();
    renderBrowseTable();
    renderMyMaterialsTable();
  }

  function handleTableAction(event) {
    const viewBtn = event.target.closest("button[data-view-id]");
    if (viewBtn) {
      const item = allMaterials.find((m) => m.id === viewBtn.dataset.viewId);
      if (item) openMaterialViewer(item);
      return;
    }

    const saveBtn = event.target.closest("button[data-toggle-save-id]");
    if (saveBtn) {
      toggleSaveMaterial(saveBtn.dataset.toggleSaveId);
    }
  }

  function subscribeStudyMaterials(academyId) {
    if (unsubscribeMaterials) unsubscribeMaterials();

    const q = query(
      collection(db, "studyMaterials"),
      where("academyId", "==", academyId)
    );

    unsubscribeMaterials = onSnapshot(
      q,
      (snapshot) => {
        allMaterials = snapshot.docs
          .map((d) => {
            const data = d.data();
            const createdDate = data.createdAt?.toDate ? data.createdAt.toDate() : null;
            return {
              id: d.id,
              ...data,
              createdAtMs: createdDate ? createdDate.getTime() : 0,
              createdAtDate: createdDate
                ? createdDate.toLocaleDateString(undefined, {
                    day: "numeric",
                    month: "short",
                    year: "numeric"
                  })
                : "—"
            };
          })
          .filter(matchesStudentClass)
          .sort((a, b) => b.createdAtMs - a.createdAtMs);

        populateSubjectDropdown();
        updateStats();
        renderBrowseTable();
        renderMyMaterialsTable();
      },
      (err) => {
        console.error("Student study materials listener error:", err);
        showMessage("Could not load study materials right now.", "error");
      }
    );
  }

  // Sub-tab switching: Browse Material | My Material
  document.querySelectorAll(".sub-tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tab = btn.dataset.tab;
      document.querySelectorAll(".sub-tab-btn").forEach((b) =>
        b.classList.toggle("active", b === btn)
      );
      $("panel-browse").hidden = tab !== "browse";
      $("panel-my").hidden = tab !== "my";
    });
  });

  searchInput?.addEventListener("input", renderBrowseTable);
  subjectFilter?.addEventListener("change", renderBrowseTable);
  typeFilter?.addEventListener("change", renderBrowseTable);

  browseTbody?.addEventListener("click", handleTableAction);
  myTbody?.addEventListener("click", handleTableAction);

  closeViewerBtn?.addEventListener("click", () => {
    if (viewerModal) viewerModal.hidden = true;
    if (viewerBody) viewerBody.innerHTML = "";
  });

  onAuthStateChanged(auth, async (user) => {
    if (unsubscribeMaterials) {
      unsubscribeMaterials();
      unsubscribeMaterials = null;
    }

    if (!user) {
      window.location.href = "../../index.html";
      return;
    }

    try {
      const snap = await getDoc(doc(db, "users", user.uid));
      if (!snap.exists()) throw new Error("Student profile not found.");

      const profile = snap.data();
      if (profile.role !== "student" || profile.isActive !== true || !profile.academyId) {
        throw new Error("An active student account is required.");
      }

      studentProfile = { ...profile, uid: user.uid };
      loadSavedIds();
      updateStats();
      subscribeStudyMaterials(profile.academyId);
    } catch (err) {
      console.error("Student materials init failed:", err);
      showMessage(err.message || "Unable to load study materials.", "error");
    }
  });
})();