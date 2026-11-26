import { auth, db } from "./firebase-config.js";

import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  where,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

import { onAuthStateChanged } from
  "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";

(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);

  let academyId = "";
  let teacherUid = "";
  let teacherName = "";
  let teacherEmail = "";

  let todaySchedules = [];
  let liveSessionsMap = new Map();
  let selectedSchedule = null;
  let selectedMode = "jitsi";
  let activeLiveSessionId = "";
  let jitsiApi = null;
  let unsubscribeLive = null;

  const messageEl = $("online-class-message");
  const gridEl = $("todays-schedules-grid");
  const startModal = $("start-class-modal");
  const activeModal = $("active-live-modal");
  const stageEl = $("live-stage-container");

  function getTodayLocalStr() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  function showMessage(text, type = "info") {
    if (!messageEl) return;
    messageEl.textContent = text;
    messageEl.className = `form-message ${type}`;
    messageEl.hidden = false;
  }

  function extractYouTubeId(input) {
    const raw = String(input || "").trim();
    if (!raw) return "";

    if (/^[a-zA-Z0-9_-]{11}$/.test(raw)) return raw;

    try {
      const url = new URL(raw);
      if (url.hostname.includes("youtu.be")) {
        return url.pathname.replace("/", "").slice(0, 11);
      }
      if (url.searchParams.get("v")) {
        return url.searchParams.get("v").slice(0, 11);
      }
      const pathParts = url.pathname.split("/").filter(Boolean);
      const liveOrEmbedIndex = pathParts.findIndex((p) =>
        ["embed", "live", "shorts"].includes(p)
      );
      if (liveOrEmbedIndex !== -1 && pathParts[liveOrEmbedIndex + 1]) {
        return pathParts[liveOrEmbedIndex + 1].slice(0, 11);
      }
    } catch {
      return "";
    }
    return "";
  }

  function setSetupMode(mode) {
    selectedMode = mode;
    $("mode-btn-jitsi")?.classList.toggle("active", mode === "jitsi");
    $("mode-btn-youtube")?.classList.toggle("active", mode === "youtube");

    if ($("jitsi-mode-info")) $("jitsi-mode-info").hidden = mode !== "jitsi";
    if ($("youtube-mode-fields")) $("youtube-mode-fields").hidden = mode !== "youtube";
  }

  function openStartModal(schedule) {
    selectedSchedule = schedule;
    setSetupMode("jitsi");
    if ($("youtube-live-url")) $("youtube-live-url").value = "";

    if ($("setup-modal-subtitle")) {
      $("setup-modal-subtitle").textContent =
        `${schedule.className || "Class"} • ${schedule.subject || "Subject"} (${schedule.startTime || ""} - ${schedule.endTime || ""})`;
    }

    if (startModal) startModal.hidden = false;
  }

  function closeStartModal() {
    selectedSchedule = null;
    if (startModal) startModal.hidden = true;
  }

  function destroyStage() {
    if (jitsiApi) {
      try {
        jitsiApi.dispose();
      } catch (err) {
        console.warn("Jitsi dispose warning:", err);
      }
      jitsiApi = null;
    }
    if (stageEl) stageEl.replaceChildren();
  }

  function openLiveStage(session) {
    if (!activeModal || !stageEl) return;

    destroyStage();
    activeLiveSessionId = session.id || session.scheduleId;

    if ($("active-live-title")) {
      $("active-live-title").textContent =
        `${session.subject} — ${session.className}`;
    }
    if ($("active-live-meta")) {
      $("active-live-meta").textContent =
        session.mode === "jitsi"
          ? "Interactive Meeting Room • Students connect automatically"
          : "YouTube Live Stream • Broadcasting to students";
    }

    activeModal.hidden = false;

    if (session.mode === "jitsi") {
      if (typeof window.JitsiMeetExternalAPI !== "function") {
        showMessage("Jitsi Meet script failed to load. Check internet connection.", "error");
        return;
      }

      jitsiApi = new window.JitsiMeetExternalAPI("meet.jit.si", {
        roomName: session.roomName,
        parentNode: stageEl,
        width: "100%",
        height: "100%",
        userInfo: {
          displayName: `${teacherName} (Teacher)`,
          email: teacherEmail || undefined
        },
        configOverwrite: {
          prejoinPageEnabled: false,
          startWithAudioMuted: false,
          startWithVideoMuted: false
        }
      });

      jitsiApi.addListener("readyToClose", () => {
        endLiveClass(activeLiveSessionId);
      });
    } else if (session.mode === "youtube" && session.youtubeVideoId) {
      const iframe = document.createElement("iframe");
      iframe.src = `https://www.youtube.com/embed/${encodeURIComponent(session.youtubeVideoId)}?autoplay=1&rel=0`;
      iframe.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture";
      iframe.allowFullscreen = true;
      stageEl.appendChild(iframe);
    }
  }

  async function startLiveClass() {
    if (!selectedSchedule) return;

    let youtubeVideoId = "";
    if (selectedMode === "youtube") {
      youtubeVideoId = extractYouTubeId($("youtube-live-url")?.value);
      if (!youtubeVideoId) {
        showMessage("Enter a valid YouTube Live URL or 11-character Video ID.", "error");
        return;
      }
    }

    const schedule = selectedSchedule;
    const roomName = `EduAdmin_${academyId}_${schedule.id}`.replace(/[^a-zA-Z0-9_-]/g, "_");

    const sessionPayload = {
      id: schedule.id,
      academyId,
      scheduleId: schedule.id,
      classId: schedule.classId,
      className: schedule.className || "Class",
      subject: schedule.subject || "Subject",
      title: schedule.subject || "Online Class",
      teacherId: teacherUid,
      teacherName,
      date: schedule.date,
      startTime: schedule.startTime || "",
      endTime: schedule.endTime || "",
      mode: selectedMode,
      roomName: selectedMode === "jitsi" ? roomName : "",
      youtubeVideoId: selectedMode === "youtube" ? youtubeVideoId : "",
      status: "live",
      startedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };

    try {
      await setDoc(doc(db, "liveClasses", schedule.id), sessionPayload);
      closeStartModal();
      openLiveStage(sessionPayload);
      showMessage("Online class is now LIVE. Enrolled students can join immediately.", "success");
    } catch (error) {
      console.error("Failed to start live class:", error);
      showMessage(
        error.code === "permission-denied"
          ? "Firestore denied starting the live class. Check liveClasses security rules."
          : "Could not start the online class. Try again.",
        "error"
      );
    }
  }

  async function endLiveClass(sessionId) {
    const targetId = sessionId || activeLiveSessionId;
    if (!targetId) return;

    try {
      await updateDoc(doc(db, "liveClasses", targetId), {
        status: "ended",
        endedAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      destroyStage();
      if (activeModal) activeModal.hidden = true;
      activeLiveSessionId = "";
      showMessage("Online class ended.", "info");
    } catch (error) {
      console.error("Failed to end live class:", error);
      showMessage("Could not end the live class cleanly.", "error");
    }
  }

  function renderSchedules() {
    if (!gridEl) return;
    gridEl.replaceChildren();

    if (!todaySchedules.length) {
      const empty = document.createElement("p");
      empty.textContent = "No classes scheduled for you today.";
      gridEl.appendChild(empty);
      return;
    }

    todaySchedules.forEach((sched) => {
      const liveSession = liveSessionsMap.get(sched.id);
      const isLive = liveSession && liveSession.status === "live";

      const card = document.createElement("article");
      card.className = `live-schedule-card${isLive ? " is-live" : ""}`;

      const topRow = document.createElement("div");
      topRow.className = "card-top-row";

      const title = document.createElement("h3");
      title.style.margin = "0";
      title.textContent = `${sched.subject || "Class"}`;

      const badge = document.createElement("span");
      badge.className = `status-pill ${isLive ? "live" : "scheduled"}`;
      badge.textContent = isLive ? "LIVE NOW" : "Scheduled";

      topRow.append(title, badge);

      const meta = document.createElement("p");
      meta.style.margin = "0";
      meta.style.color = "#475569";
      meta.style.fontSize = "0.9rem";
      meta.textContent = `Class: ${sched.className || "—"} • Time: ${sched.startTime || "—"} – ${sched.endTime || "—"}`;

      const actions = document.createElement("div");
      actions.style.display = "flex";
      actions.style.gap = "0.5rem";
      actions.style.marginTop = "auto";

      if (isLive) {
        const reopenBtn = document.createElement("button");
        reopenBtn.type = "button";
        reopenBtn.className = "btn btn-primary";
        reopenBtn.textContent = liveSession.mode === "jitsi" ? "Open Meeting Window" : "Open Live Stream";
        reopenBtn.addEventListener("click", () => openLiveStage(liveSession));

        const endBtn = document.createElement("button");
        endBtn.type = "button";
        endBtn.className = "btn-danger";
        endBtn.textContent = "End Class";
        endBtn.addEventListener("click", () => endLiveClass(sched.id));

        actions.append(reopenBtn, endBtn);
      } else {
        const startBtn = document.createElement("button");
        startBtn.type = "button";
        startBtn.className = "btn btn-primary";
        startBtn.textContent = "Start Online Class";
        startBtn.addEventListener("click", () => openStartModal(sched));

        actions.appendChild(startBtn);
      }

      card.append(topRow, meta, actions);
      gridEl.appendChild(card);
    });
  }

  async function loadTodaysSchedules(todayStr) {
    const q = query(
      collection(db, "classes"),
      where("academyId", "==", academyId),
      where("status", "==", "active")
    );

    const snapshot = await getDocs(q);
    const extracted = [];

    snapshot.docs.forEach((classDoc) => {
      const classData = classDoc.data();
      const subjects = Array.isArray(classData.subjects) ? classData.subjects : [];

      subjects.forEach((subj, subjIdx) => {
        if (subj.teacherId !== teacherUid) return;

        const sessions = Array.isArray(subj.sessions) ? subj.sessions : [];
        sessions.forEach((sess, sessIdx) => {
          if (sess && sess.date === todayStr) {
            extracted.push({
              id: `${classDoc.id}__${subjIdx}__${sessIdx}`,
              classId: classDoc.id,
              className: classData.className || "Class",
              subject: subj.subjectName || subj.name || "Subject",
              date: sess.date,
              day: sess.day || "",
              startTime: sess.startTime || "",
              endTime: sess.endTime || ""
            });
          }
        });
      });
    });

    todaySchedules = extracted.sort((a, b) =>
      String(a.startTime || "").localeCompare(String(b.startTime || ""))
    );

    renderSchedules();
  }

  function subscribeLiveSessions(todayStr) {
    if (unsubscribeLive) unsubscribeLive();

    const q = query(
      collection(db, "liveClasses"),
      where("academyId", "==", academyId),
      where("teacherId", "==", teacherUid),
      where("date", "==", todayStr)
    );

    unsubscribeLive = onSnapshot(q, (snapshot) => {
      liveSessionsMap.clear();
      snapshot.docs.forEach((docSnap) => {
        liveSessionsMap.set(docSnap.id, { id: docSnap.id, ...docSnap.data() });
      });
      renderSchedules();
    });
  }

  $("mode-btn-jitsi")?.addEventListener("click", () => setSetupMode("jitsi"));
  $("mode-btn-youtube")?.addEventListener("click", () => setSetupMode("youtube"));
  $("cancel-start-modal")?.addEventListener("click", closeStartModal);
  $("confirm-start-class")?.addEventListener("click", startLiveClass);
  $("minimize-live-modal")?.addEventListener("click", () => {
    if (activeModal) activeModal.hidden = true;
  });
  $("end-live-class-btn")?.addEventListener("click", () => endLiveClass());

  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      showMessage("Sign in as an active teacher to manage online classes.", "error");
      return;
    }

    try {
      const profileSnap = await getDoc(doc(db, "users", user.uid));
      if (!profileSnap.exists()) throw new Error("Teacher profile not found.");

      const profile = profileSnap.data();
      if (profile.role !== "teacher" || profile.isActive !== true || !profile.academyId) {
        throw new Error("An active teacher account is required.");
      }

      teacherUid = user.uid;
      academyId = profile.academyId;
      teacherName = profile.fullName || profile.name || user.email || "Teacher";
      teacherEmail = profile.email || user.email || "";

      const todayStr = getTodayLocalStr();
      if ($("today-date-label")) $("today-date-label").textContent = todayStr;

      await loadTodaysSchedules(todayStr);
      subscribeLiveSessions(todayStr);
    } catch (error) {
      console.error("Online classes init failed:", error);
      showMessage(error.message || "Could not load today's online classes.", "error");
    }
  });
})();