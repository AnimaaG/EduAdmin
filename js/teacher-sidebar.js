/* =========================================================
   EduAdmin — Teacher Sidebar
   File: js/teacher-sidebar.js

   Features:
   - Teacher navigation
   - Active page highlighting
   - Responsive mobile sidebar
   - Firebase authentication
   - Teacher account validation
   - Teacher profile display
   - Live notification badges
   ========================================================= */

(function () {
  "use strict";

  // This file is located directly inside /js/.
  const scriptUrl = document.currentScript
    ? document.currentScript.src
    : new URL("../../js/teacher-sidebar.js", window.location.href).href;

  function initTeacherSidebar() {
    const mount = document.getElementById("teacher-sidebar-mount");

    if (!mount) {
      console.error(
        "EduAdmin: #teacher-sidebar-mount was not found."
      );
      return;
    }

    if (document.getElementById("teacher-sidebar")) return;

    mount.innerHTML = `
      <aside
        class="dashboard-sidebar"
        id="teacher-sidebar"
        aria-label="Teacher navigation"
      >

        <a class="brand" href="../../index.html">
          <span class="brand-icon" aria-hidden="true">E</span>
          <span>EduAdmin</span>
        </a>

        <div class="academy-profile">
          <span class="academy-avatar" id="teacher-sidebar-avatar"
            aria-hidden="true">T</span>

          <div>
            <strong id="teacher-sidebar-name">Teacher Portal</strong>
            <small>Teacher workspace</small>
          </div>
        </div>

        <p class="sidebar-label">TEACHER MENU</p>

        <nav class="sidebar-nav" aria-label="Teacher menu">

          <a href="dashboard.html"
             data-nav-path="dashboard.html">
            <span class="nav-icon" aria-hidden="true">▦</span>
            <span>Dashboard</span>
          </a>

          <a href="attendance.html"
             data-nav-path="attendance.html">
            <span class="nav-icon" aria-hidden="true">✓</span>
            <span>Attendance</span>
          </a>

          <a href="classes.html"
             data-nav-path="classes.html">
            <span class="nav-icon" aria-hidden="true">▤</span>
            <span>My Classes</span>
          </a>

          <a href="timetable.html"
             data-nav-path="timetable.html">
            <span class="nav-icon" aria-hidden="true">◷</span>
            <span>Timetable</span>
          </a>

          <a href="syllabus.html"
             data-nav-path="syllabus.html">
            <span class="nav-icon" aria-hidden="true">☷</span>
            <span>Syllabus</span>
          </a>

          <a href="materials.html"
             data-nav-path="materials.html">
            <span class="nav-icon" aria-hidden="true">▣</span>
            <span>Study Materials</span>
          </a>

          <a href="announcements.html"
            data-nav-path="announcements.html">
            <span class="nav-icon" aria-hidden="true">📢</span>
            <span>Announcements</span>
            <span id="badge-announcements" class="sidebar-badge" hidden>0</span>
          </a>

        </nav>

        <div class="sidebar-bottom">
          <a href="../login.html"
             class="sidebar-link"
             id="teacher-logout-link">
            <span class="nav-icon" aria-hidden="true">↪</span>
            <span>Back to Login</span>
          </a>
        </div>

      </aside>
    `;

    const sidebar = document.getElementById("teacher-sidebar");
    const toggle = document.getElementById("sidebar-toggle");
    const overlay = document.getElementById("sidebar-overlay");

    function isMobile() {
      return window.matchMedia("(max-width: 900px)").matches;
    }

    function openSidebar() {
      if (!sidebar || !toggle || !overlay) return;

      sidebar.classList.add("open");
      overlay.classList.add("visible");
      document.body.classList.add("sidebar-open");

      toggle.setAttribute("aria-expanded", "true");
      toggle.setAttribute(
        "aria-label",
        "Close navigation menu"
      );
    }

    function closeSidebar() {
      if (!sidebar || !toggle || !overlay) return;

      sidebar.classList.remove("open");
      overlay.classList.remove("visible");
      document.body.classList.remove("sidebar-open");

      toggle.setAttribute("aria-expanded", "false");
      toggle.setAttribute(
        "aria-label",
        "Open navigation menu"
      );
    }

    function setActiveLink() {
      const currentFile = window.location.pathname
        .split("/")
        .pop()
        .toLowerCase();

      sidebar.querySelectorAll("[data-nav-path]").forEach((link) => {
        const target = link
          .getAttribute("data-nav-path")
          .toLowerCase();

        const active = target === currentFile;

        link.classList.toggle("active", active);

        if (active) {
          link.setAttribute("aria-current", "page");
          const badge = link.querySelector(".sidebar-badge");
          if (badge) badge.hidden = true;
        } else {
          link.removeAttribute("aria-current");
        }
      });
    }

    if (toggle) {
      toggle.addEventListener("click", () => {
        if (sidebar.classList.contains("open")) {
          closeSidebar();
        } else {
          openSidebar();
        }
      });
    }

    if (overlay) {
      overlay.addEventListener("click", closeSidebar);
    }

    sidebar
      .querySelectorAll(".sidebar-nav a, .sidebar-bottom a")
      .forEach((link) => {
        link.addEventListener("click", () => {
          if (isMobile()) closeSidebar();
        });
      });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        closeSidebar();
      }
    });

    window.addEventListener("resize", () => {
      if (!isMobile()) closeSidebar();
    });

    setActiveLink();

    if (
      window.EduNavigation &&
      typeof window.EduNavigation.setActiveLink === "function"
    ) {
      window.EduNavigation.setActiveLink();
    }

    validateTeacherAccount();
    initTeacherBadges();
  }

  async function validateTeacherAccount() {
    try {
      // firebase-config.js is in the same /js/ folder.
      const configUrl = new URL(
        "./firebase-config.js",
        scriptUrl
      );

      const config = await import(configUrl.href);

      if (!config.db || !config.auth) {
        throw new Error(
          "firebase-config.js must export db and auth."
        );
      }

      const authModule = await import(
        "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js"
      );

      const firestore = await import(
        "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js"
      );

      const { onAuthStateChanged } = authModule;
      const { doc, getDoc } = firestore;

      const user = await new Promise((resolve, reject) => {
        let unsubscribe = null;

        unsubscribe = onAuthStateChanged(
          config.auth,
          (currentUser) => {
            if (unsubscribe) unsubscribe();
            resolve(currentUser);
          },
          (error) => {
            if (unsubscribe) unsubscribe();
            reject(error);
          }
        );
      });

      if (!user) {
        throw new Error("No authenticated teacher account.");
      }

      const profileSnapshot = await getDoc(
        doc(config.db, "users", user.uid)
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
        throw new Error(
          "An active academy teacher account is required."
        );
      }

      window.currentTeacher = {
        uid: user.uid,
        ...profile
      };

      // Display teacher name in the sidebar.
      const nameElement = document.getElementById(
        "teacher-sidebar-name"
      );

      const avatarElement = document.getElementById(
        "teacher-sidebar-avatar"
      );

      const teacherName =
        profile.name ||
        profile.fullName ||
        profile.displayName ||
        "Teacher Portal";

      if (nameElement) {
        nameElement.textContent = teacherName;
      }

      if (avatarElement) {
        avatarElement.textContent =
          teacherName.charAt(0).toUpperCase();
      }

      document.dispatchEvent(
        new CustomEvent("eduadmin:teacher-ready", {
          detail: window.currentTeacher
        })
      );

    } catch (error) {
      console.error(
        "EduAdmin: Teacher account validation failed.",
        error
      );
    }
  }

  async function initTeacherBadges() {
    try {
      const { auth, db } = await import("./firebase-config.js");
      const { onAuthStateChanged } = await import("https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js");
      const { collection, query, where, onSnapshot } = await import("https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js");

      onAuthStateChanged(auth, async (user) => {
        if (!user) return;
        const currentFile = window.location.pathname.split("/").pop().toLowerCase();

        if (currentFile !== "announcements.html") {
          const qAnnounce = query(collection(db, "notifications"), where("teacherId", "==", user.uid), where("read", "==", false));
          onSnapshot(qAnnounce, (snap) => {
            const b = document.getElementById("badge-announcements");
            if (b) {
              b.textContent = snap.size;
              b.hidden = snap.size === 0;
            }
          });
        }
      });
    } catch (e) {
      console.error("Teacher badge initialization failed:", e);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      initTeacherSidebar,
      { once: true }
    );
  } else {
    initTeacherSidebar();
  }

})();