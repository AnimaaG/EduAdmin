
/* =========================================================
   EduAdmin — Admin Sidebar
   File: js/admin-sidebar.js
   ========================================================= */

(function () {
  "use strict";

  function initAdminSidebar() {
    const mount = document.getElementById("admin-sidebar-mount");

    if (!mount) {
      console.error(
        "EduAdmin: #admin-sidebar-mount was not found."
      );
      return;
    }

    /* Prevent duplicate sidebar rendering */
    if (document.getElementById("admin-sidebar")) {
      return;
    }

    /* Render the sidebar */
    mount.innerHTML = `
      <aside
        class="dashboard-sidebar"
        id="admin-sidebar"
        aria-label="Admin navigation"
      >
        <a class="brand" href="../../index.html">
          <span class="brand-icon" aria-hidden="true">E</span>
          <span>EduAdmin</span>
        </a>

        <div class="academy-profile">
          <span class="academy-avatar" aria-hidden="true">A</span>
          <div>
            <strong>Academy workspace</strong>
            <small>Administrator panel</small>
          </div>
        </div>

        <p class="sidebar-label">MAIN MENU</p>

        <nav class="sidebar-nav" aria-label="Main menu">
          <a href="dashboard.html" data-nav-path="dashboard.html">
            <span class="nav-icon" aria-hidden="true">▦</span>
            <span>Dashboard</span>
          </a>

          
          <a href="notifications.html" class="sidebar-link" data-nav-path="notifications.html">
            <span class="nav-icon" aria-hidden="true">!</span>
            <span>Notifications</span>
          </a>
          


          <a href="classes.html" data-nav-path="classes.html">
            <span class="nav-icon" aria-hidden="true">▤</span>
            <span>Classes</span>
          </a>

          <a href="teachers.html" data-nav-path="teachers.html">
            <span class="nav-icon" aria-hidden="true">♙</span>
            <span>Teachers</span>
          </a>

          <a href="students.html" data-nav-path="students.html">
            <span class="nav-icon" aria-hidden="true">♧</span>
            <span>Students</span>
          </a>

          <a href="attendance.html" data-nav-path="attendance.html">
            <span class="nav-icon" aria-hidden="true">✓</span>
            <span>Attendance</span>
          </a>

          <a href="materials.html" data-nav-path="materials.html">
            <span class="nav-icon" aria-hidden="true">▣</span>
            <span>Study materials</span>
          </a>

          <a href="schedules.html" data-nav-path="schedules.html">
            <span class="nav-icon" aria-hidden="true">◷</span>
            <span>Schedules</span>
          </a>

          <a href="fees.html" data-nav-path="fees.html">
            <span class="nav-icon" aria-hidden="true">₹</span>
            <span>Fees</span>
          </a>

       
          <a href="settings.html" data-nav-path="settings.html">
            <span class="nav-icon" aria-hidden="true">⚙</span>
            <span>Settings</span>
          </a>
         </nav>

        <div class="sidebar-bottom">
        <a href="../login.html"
           class="sidebar-link"
           id="student-logout-link">
          <span class="nav-icon" aria-hidden="true">↪</span>
          <span>Back to Login</span>
        </a>
      </div>
    </aside>           
    `;

    const sidebar = document.getElementById("admin-sidebar");
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

    /* Mark the current page */
    function setActiveLink() {
      const currentFile = window.location.pathname
        .split("/")
        .pop()
        .toLowerCase();

      sidebar.querySelectorAll("[data-nav-path]").forEach(function (link) {
        const target = link
          .getAttribute("data-nav-path")
          .toLowerCase();

        const active = target === currentFile;

        link.classList.toggle("active", active);

        if (active) {
          link.setAttribute("aria-current", "page");
        } else {
          link.removeAttribute("aria-current");
        }
      });
    }

    /* Mobile menu button */
    if (toggle) {
      toggle.addEventListener("click", function () {
        if (sidebar.classList.contains("open")) {
          closeSidebar();
        } else {
          openSidebar();
        }
      });
    }

    /* Close when the backdrop is clicked */
    if (overlay) {
      overlay.addEventListener("click", closeSidebar);
    }

    /* Close after choosing a page */
    sidebar.querySelectorAll(".sidebar-nav a, .sidebar-bottom a")
      .forEach(function (link) {
        link.addEventListener("click", function () {
          if (isMobile()) {
            closeSidebar();
          }
        });
      });

    /* Close with Escape */
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") {
        closeSidebar();
      }
    });

    /* Reset mobile state when returning to desktop */
    window.addEventListener("resize", function () {
      if (!isMobile()) {
        closeSidebar();
      }
    });

    setActiveLink();

    /* Keep navigation.js in sync, if available */
    if (
      window.EduNavigation &&
      typeof window.EduNavigation.setActiveLink === "function"
    ) {
      window.EduNavigation.setActiveLink();
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      initAdminSidebar,
      { once: true }
    );
  } else {
    initAdminSidebar();
  }
})();
