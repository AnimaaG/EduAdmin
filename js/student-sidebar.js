
/**
 * EduAdmin - Student Sidebar
 *
 * Shared navigation for Student Portal pages.
 * Student account data and authentication are not connected yet.
 */

(() => {
  "use strict";

  const mount = document.getElementById("student-sidebar-mount");

  if (!mount) {
    console.error("EduAdmin: Student sidebar mount was not found.");
    return;
  }

  mount.innerHTML = `
    <aside class="dashboard-sidebar" id="student-sidebar">
      <div class="sidebar-brand">
        <span class="brand-icon">E</span>
        <span>EduAdmin</span>
      </div>

      <div class="academy-profile">
        <div class="academy-avatar">S</div>
        <div>
          <strong>Student Portal</strong>
          <small>Learning workspace</small>
        </div>
      </div>

      
<nav class="sidebar-nav" aria-label="Student navigation">
  <p class="sidebar-label">STUDENT MENU</p>

  <a href="dashboard.html"
     class="sidebar-link"
     data-nav-path="dashboard.html">
    <span class="nav-icon" aria-hidden="true">▦</span>
    <span>Dashboard</span>
  </a>

  <a href="attendance.html"
     class="sidebar-link"
     data-nav-path="attendance.html">
    <span class="nav-icon" aria-hidden="true">✓</span>
    <span>Attendance</span>
  </a>

  <a href="schedules.html"
     class="sidebar-link"
     data-nav-path="schedules.html">
    <span class="nav-icon" aria-hidden="true">◷</span>
    <span>Schedules</span>
  </a>

  <a href="materials.html"
     class="sidebar-link"
     data-nav-path="materials.html">
    <span class="nav-icon" aria-hidden="true">▤</span>
    <span>Study Materials</span>
  </a>

  <a href="payments.html"
     class="sidebar-link"
     data-nav-path="payments.html">
    <span class="nav-icon" aria-hidden="true">₹</span>
    <span>Fees &amp; Payments</span>
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

  const sidebar = document.getElementById("student-sidebar");
  const toggle = document.getElementById("sidebar-toggle");
  const overlay = document.getElementById("sidebar-overlay");

  function setActiveLink() {
    const currentFile = window.location.pathname.split("/").pop() || "dashboard.html";

    sidebar.querySelectorAll("[data-nav-path]").forEach((link) => {
      const isActive = link.dataset.navPath === currentFile;

      link.classList.toggle("active", isActive);

      if (isActive) {
        link.setAttribute("aria-current", "page");
      } else {
        link.removeAttribute("aria-current");
      }
    });
  }

  function closeSidebar() {
    sidebar.classList.remove("is-open");
    overlay?.classList.remove("is-visible");
    toggle?.setAttribute("aria-expanded", "false");
  }

  function toggleSidebar() {
    const isOpen = sidebar.classList.toggle("is-open");

    overlay?.classList.toggle("is-visible", isOpen);
    toggle?.setAttribute("aria-expanded", String(isOpen));
  }

  toggle?.addEventListener("click", toggleSidebar);
  overlay?.addEventListener("click", closeSidebar);

  sidebar.querySelectorAll(".sidebar-link").forEach((link) => {
    link.addEventListener("click", closeSidebar);
  });

  window.addEventListener("resize", () => {
    if (window.innerWidth > 900) {
      closeSidebar();
    }
  });

  setActiveLink();
})();
