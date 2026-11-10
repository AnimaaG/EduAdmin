/**
 * EduAdmin - Student Sidebar + Live Notification Badges
 */

(function () {
  "use strict";

  function initStudentSidebar() {
    const mount = document.getElementById("student-sidebar-mount");

    if (!mount) {
      console.error("EduAdmin: Student sidebar mount was not found.");
      return;
    }

    if (document.getElementById("student-sidebar")) return;

    mount.innerHTML = `
      <aside class="dashboard-sidebar" id="student-sidebar" aria-label="Student navigation">
        <a class="brand" href="../../index.html">
          <span class="brand-icon" aria-hidden="true">E</span>
          <span>EduAdmin</span>
        </a>

        <div class="academy-profile">
          <div class="academy-avatar" aria-hidden="true">S</div>
          <div>
            <strong>Student Portal</strong>
            <small>Learning workspace</small>
          </div>
        </div>

        <p class="sidebar-label">STUDENT MENU</p>

        <nav class="sidebar-nav" aria-label="Student navigation">
          <a href="dashboard.html" data-nav-path="dashboard.html">
            <span class="nav-icon" aria-hidden="true">▦</span>
            <span>Dashboard</span>
          </a>

          <a href="attendance.html" data-nav-path="attendance.html">
            <span class="nav-icon" aria-hidden="true">✓</span>
            <span>Attendance</span>
          </a>

          <a href="schedules.html" data-nav-path="schedules.html">
            <span class="nav-icon" aria-hidden="true">◷</span>
            <span>Schedules</span>
          </a>

          <a href="materials.html" data-nav-path="materials.html">
            <span class="nav-icon" aria-hidden="true">▤</span>
            <span>Study Materials</span>
          </a>

          <a href="payments.html" data-nav-path="payments.html">
            <span class="nav-icon" aria-hidden="true">₹</span>
            <span>Fees &amp; Payments</span>
            <span id="badge-payments" class="sidebar-badge" hidden>0</span>
          </a>
        </nav>

        <div class="sidebar-bottom">
          <a href="../login.html" class="sidebar-link" id="student-logout-link">
            <span class="nav-icon" aria-hidden="true">↪</span>
            <span>Back to Login</span>
          </a>
        </div>
      </aside>
    `;

    const sidebar = document.getElementById("student-sidebar");
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
      toggle.setAttribute("aria-label", "Close navigation menu");
    }

    function closeSidebar() {
      if (!sidebar || !toggle || !overlay) return;
      sidebar.classList.remove("open");
      overlay.classList.remove("visible");
      document.body.classList.remove("sidebar-open");
      toggle.setAttribute("aria-expanded", "false");
      toggle.setAttribute("aria-label", "Open navigation menu");
    }

    function setActiveLink() {
      const currentFile = window.location.pathname.split("/").pop().toLowerCase();

      sidebar.querySelectorAll("[data-nav-path]").forEach((link) => {
        const target = link.getAttribute("data-nav-path").toLowerCase();
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

    if (overlay) overlay.addEventListener("click", closeSidebar);

    sidebar.querySelectorAll(".sidebar-nav a, .sidebar-bottom a").forEach((link) => {
      link.addEventListener("click", () => {
        if (isMobile()) closeSidebar();
      });
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeSidebar();
    });

    window.addEventListener("resize", () => {
      if (!isMobile()) closeSidebar();
    });

    setActiveLink();
    initStudentBadges();
  }

  async function initStudentBadges() {
    try {
      const { auth, db } = await import("./firebase-config.js");
      const { onAuthStateChanged } = await import("https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js");
      const { collection, query, where, onSnapshot } = await import("https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js");

      onAuthStateChanged(auth, async (user) => {
        if (!user) return;
        const currentFile = window.location.pathname.split("/").pop().toLowerCase();

        // Monitor pending/unpaid fees for students
        if (currentFile !== "payments.html") {
          const qFees = query(collection(db, "fees"), where("studentId", "==", user.uid), where("status", "in", ["pending", "partial"]));
          onSnapshot(qFees, (snap) => {
            const b = document.getElementById("badge-payments");
            if (b) {
              b.textContent = snap.size;
              b.hidden = snap.size === 0;
            }
          });
        }
      });
    } catch (e) {
      console.error("Student badge initialization failed:", e);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initStudentSidebar, {
      once: true
    });
  } else {
    initStudentSidebar();
  }
})();