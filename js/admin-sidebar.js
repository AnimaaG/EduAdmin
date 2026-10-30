/* =========================================================
   EduAdmin — Admin Sidebar + Live Notification Badge
   File: js/admin-sidebar.js
   ========================================================= */

(function () {
  "use strict";

  const scriptUrl = document.currentScript
    ? document.currentScript.src
    : new URL("./admin-sidebar.js", window.location.href).href;

  let stopBadgeListener = null;

  function initAdminSidebar() {
    const mount = document.getElementById("admin-sidebar-mount");

    if (!mount) {
      console.error("EduAdmin: #admin-sidebar-mount was not found.");
      return;
    }

    if (document.getElementById("admin-sidebar")) return;

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

          <a
            href="notifications.html"
            class="sidebar-link"
            data-nav-path="notifications.html"
            id="admin-notifications-nav"
          >
            <span class="nav-icon" aria-hidden="true">!</span>
            <span class="notification-nav-label">Notifications</span>
            <span
              id="admin-notification-dot"
              class="admin-notification-dot"
              aria-label="Unread notifications"
              title="Unread notifications"
              hidden
            ></span>
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
          <a href="../login.html" class="sidebar-link" id="student-logout-link">
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

    function setActiveLink() {
      const currentFile = window.location.pathname
        .split("/")
        .pop()
        .toLowerCase();

      sidebar.querySelectorAll("[data-nav-path]").forEach((link) => {
        const target = link.getAttribute("data-nav-path").toLowerCase();
        const active = target === currentFile;

        link.classList.toggle("active", active);

        if (active) {
          link.setAttribute("aria-current", "page");
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

    sidebar
      .querySelectorAll(".sidebar-nav a, .sidebar-bottom a")
      .forEach((link) => {
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

    if (
      window.EduNavigation &&
      typeof window.EduNavigation.setActiveLink === "function"
    ) {
      window.EduNavigation.setActiveLink();
    }

    setupLiveNotificationBadge();
  }

function setupLiveNotificationBadge() {
  const dot = document.getElementById(
    "admin-notification-dot"
  );

  if (!dot) return;

  if (
    !document.getElementById(
      "admin-notification-badge-styles"
    )
  ) {
    const style = document.createElement("style");

    style.id = "admin-notification-badge-styles";

    style.textContent = `
      #admin-notifications-nav {
        position: relative;
        display: flex;
        align-items: center;
        gap: 10px;
      }

      #admin-notifications-nav .notification-nav-label {
        flex: 1;
      }

      .admin-notification-dot {
        display: inline-block;
        flex: 0 0 9px;
        width: 9px;
        height: 9px;
        margin-left: auto;
        border-radius: 50%;
        background: #e11d48;
        box-shadow: 0 0 0 3px rgba(225, 29, 72, 0.13);
      }

      .admin-notification-dot[hidden] {
        display: none !important;
      }
    `;

    document.head.appendChild(style);
  }

  const configUrl = new URL(
    "./firebase-config.js",
    scriptUrl
  );

  import(configUrl.href)
    .then(async (config) => {
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

      const {
        doc,
        getDoc,
        collection,
        query,
        where,
        onSnapshot
      } = firestore;

      const user = await new Promise((resolve, reject) => {
        const unsubscribe = onAuthStateChanged(
          config.auth,
          (currentUser) => {
            unsubscribe();
            resolve(currentUser);
          },
          reject
        );
      });

      if (!user) {
        throw new Error("No authenticated user.");
      }

      const profileSnapshot = await getDoc(
        doc(config.db, "users", user.uid)
      );

      if (!profileSnapshot.exists()) {
        throw new Error("User profile not found.");
      }

      const profile = profileSnapshot.data();

      if (
        profile.role !== "admin" ||
        profile.isActive !== true ||
        !profile.academyId
      ) {
        throw new Error(
          "An active academy admin account is required."
        );
      }

      const unreadQuery = query(
        collection(config.db, "notifications"),
        where("academyId", "==", profile.academyId),
        where("recipientRole", "==", "admin")
      );

      stopBadgeListener = onSnapshot(
        unreadQuery,
        (snapshot) => {
          let unread = 0;

          snapshot.forEach((notification) => {
            const data = notification.data();

            if (
              data.read !== true &&
              data.isRead !== true
            ) {
              unread++;
            }
          });

          dot.hidden = unread === 0;

          dot.title = unread
            ? `${unread} unread notification${
                unread === 1 ? "" : "s"
              }`
            : "No unread notifications";

          dot.setAttribute(
            "aria-hidden",
            unread === 0 ? "true" : "false"
          );
        },
        (error) => {
          dot.hidden = true;

          console.error(
            "EduAdmin: Notification badge listener failed.",
            error
          );
        }
      );
    })
    .catch((error) => {
      dot.hidden = true;

      console.error(
        "EduAdmin: Could not connect the notification badge.",
        error
      );
    });
}

  window.addEventListener("beforeunload", () => {
    if (typeof stopBadgeListener === "function") {
      stopBadgeListener();
    }
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initAdminSidebar, {
      once: true
    });
  } else {
    initAdminSidebar();
  }
})();