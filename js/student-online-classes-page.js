import { auth, db } from "./firebase-config.js";

import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  where
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

import { onAuthStateChanged } from
  "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";

(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);

  let studentProfile = null;
  let todaySessions = [];
  let liveSessionsMap = new Map();
  let unsubscribeLive = null;

  const messageEl = $("student-online-message");
  const liveGridEl = $("student-live-now-grid");
  const scheduleGridEl = $("student-today-schedule-grid");

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

  function matchesStudentClass(classId, className) {
    if (!studentProfile) return false;

    const sClassId = studentProfile.classId || "";
    const sClassIds = Array.isArray(studentProfile.classIds) ? studentProfile.classIds : [];
    const sClassName = String(studentProfile.className || "").trim().toLowerCase();
    const targetClassName = String(className || "").trim().toLowerCase();

    if (sClassId && classId && sClassId === classId) return true;
    if (classId && sClassIds.includes(classId)) return true;
    if (sClassName && targetClassName && sClassName === targetClassName) return true;

    return false;
  }

  function launchSessionModal(session) {
    if (typeof window.openStudentLiveClassModal === "function") {
      window.openStudentLiveClassModal(session);
      return;
    }

    const modal = document.getElementById("student-live-class-modal");
    const joinBtn = modal?.querySelector(".student-live-join-btn");
    window.__eduStudentActiveSession = session;
    if (modal) modal.hidden = false;
    if (joinBtn) joinBtn.click();
  }

  function renderLiveNow() {
    if (!liveGridEl) return;
    liveGridEl.replaceChildren();

    const activeList = Array.from(liveSessionsMap.values()).filter(
      (s) => s.status === "live"
    );

    if (!activeList.length) {
      const empty = document.createElement("p");
      empty.textContent = "No live classes are running right now. When your teacher starts a session, it will appear here automatically.";
      liveGridEl.appendChild(empty);
      return;
    }

    activeList.forEach((session) => {
      const card = document.createElement("article");
      card.className = "student-session-card is-live";

      const topRow = document.createElement("div");
      topRow.className = "session-top-row";

      const title = document.createElement("h3");
      title.style.margin = "0";
      title.textContent = session.subject || "Live Class";

      const badge = document.createElement("span");
      badge.className = "live-status-pill live";
      badge.textContent = "LIVE NOW";

      topRow.append(title, badge);

      const meta = document.createElement("p");
      meta.style.margin = "0";
      meta.style.color = "#334155";
      meta.style.fontSize = "0.9rem";
      meta.textContent = `Class: ${session.className || "—"} • Teacher: ${session.teacherName || "Teacher"}`;

      const timeInfo = document.createElement("p");
      timeInfo.style.margin = "0";
      timeInfo.style.color = "#64748b";
      timeInfo.style.fontSize = "0.85rem";
      timeInfo.textContent = `Time: ${session.startTime || "—"} – ${session.endTime || "—"}`;

      const modeTag = document.createElement("span");
      modeTag.className = "mode-tag";
      modeTag.textContent =
        session.mode === "youtube" ? "YouTube Live Broadcast" : "Interactive Live Classroom";

      const joinBtn = document.createElement("button");
      joinBtn.type = "button";
      joinBtn.className = "btn btn-primary";
      joinBtn.style.marginTop = "auto";
      joinBtn.textContent = "Join Live Class Now";
      joinBtn.addEventListener("click", () => launchSessionModal(session));

      card.append(topRow, meta, timeInfo, modeTag, joinBtn);
      liveGridEl.appendChild(card);
    });
  }

  function renderTodaySchedule() {
    if (!scheduleGridEl) return;
    scheduleGridEl.replaceChildren();

    if (!todaySessions.length) {
      const empty = document.createElement("p");
      empty.textContent = "No classes scheduled for your batch today.";
      scheduleGridEl.appendChild(empty);
      return;
    }

    todaySessions.forEach((sched) => {
      const liveRec = liveSessionsMap.get(sched.id);
      const isLive = liveRec && liveRec.status === "live";
      const isEnded = liveRec && liveRec.status === "ended";

      const card = document.createElement("article");
      card.className = `student-session-card${isLive ? " is-live" : ""}`;

      const topRow = document.createElement("div");
      topRow.className = "session-top-row";

      const title = document.createElement("h3");
      title.style.margin = "0";
      title.textContent = sched.subject || "Subject";

      const badge = document.createElement("span");
      badge.className = `live-status-pill ${isLive ? "live" : isEnded ? "ended" : "upcoming"}`;
      badge.textContent = isLive ? "LIVE NOW" : isEnded ? "Ended" : "Scheduled";

      topRow.append(title, badge);

      const meta = document.createElement("p");
      meta.style.margin = "0";
      meta.style.color = "#475569";
      meta.style.fontSize = "0.9rem";
      meta.textContent = `Class: ${sched.className || "—"} • Teacher: ${sched.teacherName || "Teacher"}`;

      const timeInfo = document.createElement("p");
      timeInfo.style.margin = "0";
      timeInfo.style.color = "#64748b";
      timeInfo.style.fontSize = "0.85rem";
      timeInfo.textContent = `Time: ${sched.startTime || "—"} – ${sched.endTime || "—"}`;

      card.append(topRow, meta, timeInfo);

      if (isLive) {
        const joinBtn = document.createElement("button");
        joinBtn.type = "button";
        joinBtn.className = "btn btn-primary";
        joinBtn.style.marginTop = "auto";
        joinBtn.textContent = "Join Live Class";
        joinBtn.addEventListener("click", () => launchSessionModal(liveRec));
        card.appendChild(joinBtn);
      }

      scheduleGridEl.appendChild(card);
    });
  }

  async function loadTodayStudentClasses(academyId, todayStr) {
    const q = query(
      collection(db, "classes"),
      where("academyId", "==", academyId),
      where("status", "==", "active")
    );

    const snapshot = await getDocs(q);
    const list = [];

    snapshot.docs.forEach((classDoc) => {
      const classData = classDoc.data();
      if (!matchesStudentClass(classDoc.id, classData.className)) return;

      const subjects = Array.isArray(classData.subjects) ? classData.subjects : [];
      subjects.forEach((subj, subjIdx) => {
        const sessions = Array.isArray(subj.sessions) ? subj.sessions : [];
        sessions.forEach((sess, sessIdx) => {
          if (sess && sess.date === todayStr) {
            list.push({
              id: `${classDoc.id}__${subjIdx}__${sessIdx}`,
              classId: classDoc.id,
              className: classData.className || "Class",
              subject: subj.subjectName || subj.name || "Subject",
              teacherName: subj.teacherName || "Teacher",
              date: sess.date,
              startTime: sess.startTime || "",
              endTime: sess.endTime || ""
            });
          }
        });
      });
    });

    todaySessions = list.sort((a, b) =>
      String(a.startTime || "").localeCompare(String(b.startTime || ""))
    );

    renderTodaySchedule();
  }

  function subscribeLiveSessions(academyId) {
    if (unsubscribeLive) unsubscribeLive();

    const q = query(
      collection(db, "liveClasses"),
      where("academyId", "==", academyId)
    );

    unsubscribeLive = onSnapshot(
      q,
      (snapshot) => {
        liveSessionsMap.clear();
        snapshot.docs.forEach((docSnap) => {
          const data = { id: docSnap.id, ...docSnap.data() };
          if (matchesStudentClass(data.classId, data.className)) {
            liveSessionsMap.set(docSnap.id, data);
          }
        });

        renderLiveNow();
        renderTodaySchedule();
      },
      (err) => {
        console.error("Student live sessions listener error:", err);
        showMessage("Could not sync live classes right now.", "error");
      }
    );
  }

  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      showMessage("Sign in as an active student to view online classes.", "error");
      return;
    }

    try {
      const snap = await getDoc(doc(db, "users", user.uid));
      if (!snap.exists()) throw new Error("Student profile not found.");

      const profile = snap.data();
      if (profile.role !== "student" || profile.isActive !== true || !profile.academyId) {
        throw new Error("An active student account is required.");
      }

      studentProfile = profile;

      const todayStr = getTodayLocalStr();
      if ($("student-today-date")) $("student-today-date").textContent = todayStr;

      await loadTodayStudentClasses(profile.academyId, todayStr);
      subscribeLiveSessions(profile.academyId);
    } catch (error) {
      console.error("Student online classes page init error:", error);
      showMessage(error.message || "Could not load online classes.", "error");
    }
  });
})();