import { auth, db } from "./firebase-config.js";

import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  where
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

import { onAuthStateChanged } from
  "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";

(() => {
  "use strict";

  let studentProfile = null;
  let studentUid = "";
  let unsubscribeLive = null;
  let jitsiApi = null;
  let currentActiveSessionId = "";
  let dismissedSessionId = "";

  let modalBackdrop = null;
  let titleEl = null;
  let metaEl = null;
  let stageEl = null;
  let joinBtn = null;
  let closeBtn = null;

  function ensureJitsiScript() {
    return new Promise((resolve) => {
      if (typeof window.JitsiMeetExternalAPI === "function") {
        resolve(true);
        return;
      }

      const existing = document.querySelector('script[src*="meet.jit.si/external_api.js"]');
      if (existing) {
        existing.addEventListener("load", () => resolve(typeof window.JitsiMeetExternalAPI === "function"), { once: true });
        existing.addEventListener("error", () => resolve(false), { once: true });
        return;
      }

      const script = document.createElement("script");
      script.src = "https://meet.jit.si/external_api.js";
      script.async = true;
      script.onload = () => resolve(typeof window.JitsiMeetExternalAPI === "function");
      script.onerror = () => resolve(false);
      document.head.appendChild(script);
    });
  }

  function ensureStudentLiveModal() {
    if (document.getElementById("student-live-class-modal")) return;

    const style = document.createElement("style");
    style.id = "student-live-class-styles";
    style.textContent = `
      #student-live-class-modal {
        position: fixed;
        inset: 0;
        background: rgba(15, 23, 42, 0.78);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 1rem;
        z-index: 1500;
      }
      #student-live-class-modal[hidden] {
        display: none !important;
      }
      .student-live-dialog {
        width: min(1020px, 100%);
        background: #ffffff;
        border-radius: 16px;
        overflow: hidden;
        box-shadow: 0 24px 60px rgba(0, 0, 0, 0.35);
        display: flex;
        flex-direction: column;
      }
      .student-live-header {
        display: flex;
        flex-wrap: wrap;
        justify-content: space-between;
        align-items: center;
        gap: 0.75rem;
        padding: 0.9rem 1.2rem;
        background: #0f172a;
        color: #ffffff;
      }
      .student-live-badge {
        display: inline-block;
        background: #dc2626;
        color: #ffffff;
        font-size: 0.72rem;
        font-weight: 700;
        padding: 0.2rem 0.55rem;
        border-radius: 999px;
        margin-right: 0.5rem;
        vertical-align: middle;
        text-transform: uppercase;
      }
      .student-live-actions {
        display: flex;
        gap: 0.5rem;
        align-items: center;
      }
      .student-live-join-btn {
        background: #2563eb;
        color: #ffffff;
        border: none;
        border-radius: 8px;
        padding: 0.5rem 0.9rem;
        font: inherit;
        font-size: 0.88rem;
        font-weight: 600;
        cursor: pointer;
      }
      .student-live-close-btn {
        background: rgba(255, 255, 255, 0.14);
        color: #ffffff;
        border: 1px solid rgba(255, 255, 255, 0.25);
        border-radius: 8px;
        padding: 0.5rem 0.85rem;
        font: inherit;
        font-size: 0.88rem;
        font-weight: 600;
        cursor: pointer;
      }
      .student-live-stage {
        width: 100%;
        height: min(72vh, 620px);
        background: #020617;
      }
      .student-live-stage iframe {
        width: 100%;
        height: 100%;
        border: 0;
      }
    `;
    document.head.appendChild(style);

    modalBackdrop = document.createElement("div");
    modalBackdrop.id = "student-live-class-modal";
    modalBackdrop.hidden = true;

    const dialog = document.createElement("div");
    dialog.className = "student-live-dialog";
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-labelledby", "student-live-title");

    const header = document.createElement("div");
    header.className = "student-live-header";

    const infoWrap = document.createElement("div");
    titleEl = document.createElement("strong");
    titleEl.id = "student-live-title";

    metaEl = document.createElement("div");
    metaEl.id = "student-live-meta";
    metaEl.style.fontSize = "0.82rem";
    metaEl.style.color = "#cbd5e1";
    metaEl.style.marginTop = "0.2rem";

    infoWrap.append(titleEl, metaEl);

    const actionsWrap = document.createElement("div");
    actionsWrap.className = "student-live-actions";

    joinBtn = document.createElement("button");
    joinBtn.type = "button";
    joinBtn.className = "student-live-join-btn";
    joinBtn.textContent = "Connect / Rejoin";
    joinBtn.addEventListener("click", () => {
      if (window.__eduStudentActiveSession) {
        mountClassroom(window.__eduStudentActiveSession);
      }
    });

    closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "student-live-close-btn";
    closeBtn.textContent = "Leave / Hide";
    closeBtn.addEventListener("click", () => {
      dismissedSessionId = currentActiveSessionId;
      hideStudentLiveModal();
    });

    actionsWrap.append(joinBtn, closeBtn);
    header.append(infoWrap, actionsWrap);

    stageEl = document.createElement("div");
    stageEl.className = "student-live-stage";
    stageEl.id = "student-live-stage";

    dialog.append(header, stageEl);
    modalBackdrop.appendChild(dialog);
    document.body.appendChild(modalBackdrop);
  }

  function destroyClassroomStage() {
    if (jitsiApi) {
      try {
        jitsiApi.dispose();
      } catch (err) {
        console.warn("Student Jitsi dispose warning:", err);
      }
      jitsiApi = null;
    }
    if (stageEl) {
      stageEl.replaceChildren();
    }
  }

  function hideStudentLiveModal() {
    destroyClassroomStage();
    if (modalBackdrop) {
      modalBackdrop.hidden = true;
    }
    window.__eduStudentActiveSession = null;
  }

  async function mountClassroom(session) {
    ensureStudentLiveModal();
    destroyClassroomStage();

    const studentName =
      studentProfile?.fullName ||
      studentProfile?.name ||
      studentProfile?.displayName ||
      "Student";

    if (session.mode === "jitsi" && session.roomName) {
      const loaded = await ensureJitsiScript();
      if (!loaded) {
        const fallback = document.createElement("p");
        fallback.style.color = "#ffffff";
        fallback.style.padding = "1.5rem";
        fallback.textContent = "Unable to load the live meeting room right now. Click Connect / Rejoin to retry.";
        stageEl.appendChild(fallback);
        return;
      }

      jitsiApi = new window.JitsiMeetExternalAPI("meet.jit.si", {
        roomName: session.roomName,
        parentNode: stageEl,
        width: "100%",
        height: "100%",
        userInfo: {
          displayName: `${studentName} (Student)`
        },
        configOverwrite: {
          prejoinPageEnabled: false,
          startWithAudioMuted: true,
          startWithVideoMuted: true
        }
      });

      jitsiApi.addListener("readyToClose", () => {
        dismissedSessionId = session.id;
        hideStudentLiveModal();
      });
    } else if (session.mode === "youtube" && session.youtubeVideoId) {
      const iframe = document.createElement("iframe");
      iframe.src = `https://www.youtube.com/embed/${encodeURIComponent(session.youtubeVideoId)}?autoplay=1&rel=0`;
      iframe.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture";
      iframe.allowFullscreen = true;
      stageEl.appendChild(iframe);
    }
  }

  function openStudentLiveModal(session) {
    ensureStudentLiveModal();

    const badge = document.createElement("span");
    badge.className = "student-live-badge";
    badge.textContent = "LIVE";

    titleEl.replaceChildren(
      badge,
      document.createTextNode(`${session.subject || "Live Class"} — ${session.className || "Class"}`)
    );

    metaEl.textContent =
      `Teacher: ${session.teacherName || "Teacher"} • ${session.startTime || ""} – ${session.endTime || ""}`;

    window.__eduStudentActiveSession = session;
    modalBackdrop.hidden = false;
    mountClassroom(session);
  }
  window.openStudentLiveClassModal = (session) => {
    currentActiveSessionId = session.id;
    dismissedSessionId = "";
    openStudentLiveModal(session);
  };

  function isStudentEnrolledInSession(session) {
    if (!studentProfile) return false;

    const studentClassId = studentProfile.classId || "";
    const studentClassIds = Array.isArray(studentProfile.classIds)
      ? studentProfile.classIds
      : [];
    const studentClassName = String(studentProfile.className || "").trim().toLowerCase();

    const sessionClassId = session.classId || "";
    const sessionClassName = String(session.className || "").trim().toLowerCase();

    if (studentClassId && sessionClassId && studentClassId === sessionClassId) {
      return true;
    }
    if (sessionClassId && studentClassIds.includes(sessionClassId)) {
      return true;
    }
    if (studentClassName && sessionClassName && studentClassName === sessionClassName) {
      return true;
    }
    return false;
  }

  function startLiveListener(academyId) {
    if (unsubscribeLive) {
      unsubscribeLive();
      unsubscribeLive = null;
    }

    const q = query(
      collection(db, "liveClasses"),
      where("academyId", "==", academyId),
      where("status", "==", "live")
    );

    unsubscribeLive = onSnapshot(
      q,
      (snapshot) => {
        const matchingSessions = snapshot.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter(isStudentEnrolledInSession);

        if (!matchingSessions.length) {
          if (currentActiveSessionId) {
            currentActiveSessionId = "";
            dismissedSessionId = "";
            hideStudentLiveModal();
          }
          return;
        }

        const activeSession = matchingSessions[0];

        if (activeSession.id !== currentActiveSessionId) {
          currentActiveSessionId = activeSession.id;
          dismissedSessionId = "";
          openStudentLiveModal(activeSession);
        } else if (
          dismissedSessionId !== activeSession.id &&
          modalBackdrop &&
          modalBackdrop.hidden
        ) {
          openStudentLiveModal(activeSession);
        }
      },
      (err) => {
        console.warn("Student live class listener skipped:", err.code || err.message);
      }
    );
  }

  onAuthStateChanged(auth, async (user) => {
    if (unsubscribeLive) {
      unsubscribeLive();
      unsubscribeLive = null;
    }
    currentActiveSessionId = "";
    hideStudentLiveModal();

    if (!user) return;

    try {
      const snap = await getDoc(doc(db, "users", user.uid));
      if (!snap.exists()) return;

      const profile = snap.data();
      if (profile.role !== "student" || profile.isActive !== true || !profile.academyId) {
        return;
      }

      studentUid = user.uid;
      studentProfile = profile;
      startLiveListener(profile.academyId);
    } catch (err) {
      console.warn("Student live class init skipped:", err.code || err.message);
    }
  });
})();