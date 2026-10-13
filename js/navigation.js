
/* ==========================================
   EduAdmin - Shared Navigation
========================================== */

(function () {
    "use strict";

    /**
     * Navigate to a page using a relative or absolute path.
     */
    function goTo(path) {
        if (typeof path !== "string" || !path.trim()) {
            console.error("EduAdmin: A valid navigation path is required.");
            return;
        }

        window.location.href = path;
    }

    /**
     * Handle elements that use data-go-to.
     * Example: <button data-go-to="pages/login.html">Login</button>
     */
    function initNavigation() {
        document.querySelectorAll("[data-go-to]").forEach(function (element) {
            element.addEventListener("click", function () {
                const path = element.getAttribute("data-go-to");

                if (path) {
                    goTo(path);
                }
            });
        });

        setActiveLink();
    }

    /**
     * Highlight navigation links using data-nav-path.
     */
    function setActiveLink() {
        const currentPath = window.location.pathname
            .replace(/\/+$/, "")
            .toLowerCase();

        document.querySelectorAll("[data-nav-path]").forEach(function (link) {
            const targetPath = link.getAttribute("data-nav-path");

            if (!targetPath) {
                return;
            }

            const normalizedTarget = targetPath
                .replace(/\\/g, "/")
                .replace(/^\/+/, "")
                .toLowerCase();

            const isActive = currentPath.endsWith("/" + normalizedTarget) ||
                currentPath.endsWith(normalizedTarget);

            link.classList.toggle("active", isActive);

            if (isActive) {
                link.setAttribute("aria-current", "page");
            } else {
                link.removeAttribute("aria-current");
            }
        });
    }

    window.EduNavigation = Object.freeze({
        goTo: goTo,
        init: initNavigation,
        setActiveLink: setActiveLink
    });

    document.addEventListener("DOMContentLoaded", initNavigation);
})();
