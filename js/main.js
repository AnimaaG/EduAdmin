
/* ==========================================
   EduAdmin - Shared JavaScript Utilities
========================================== */

(function () {
    "use strict";

    /**
     * Find an HTML element by its ID.
     * Returns null when the element does not exist.
     */
    function getElement(id) {
        return document.getElementById(id);
    }

    /**
     * Display a message inside a designated element.
     *
     * Example:
     * EduAdmin.showMessage("Saved successfully", "success", "form-message");
     */
    function showMessage(message, type, elementId) {
        const element = getElement(elementId || "app-message");

        if (!element) {
            console.info(message);
            return;
        }

        element.textContent = String(message);
        element.className = "message " + (type || "info");
        element.hidden = false;
        element.setAttribute("role", type === "error" ? "alert" : "status");
    }

    /**
     * Hide a message element.
     */
    function hideMessage(elementId) {
        const element = getElement(elementId || "app-message");

        if (!element) {
            return;
        }

        element.textContent = "";
        element.hidden = true;
    }

    /**
     * Format a number as Indian Rupees.
     */
    function formatCurrency(amount) {
        const value = Number(amount);

        if (!Number.isFinite(value)) {
            return "₹0.00";
        }

        return new Intl.NumberFormat("en-IN", {
            style: "currency",
            currency: "INR",
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(value);
    }

    /**
     * Format a valid date for display.
     */
    function formatDate(dateValue) {
        const date = dateValue instanceof Date
            ? dateValue
            : new Date(dateValue);

        if (Number.isNaN(date.getTime())) {
            return "—";
        }

        return new Intl.DateTimeFormat("en-IN", {
            day: "2-digit",
            month: "short",
            year: "numeric"
        }).format(date);
    }

    /**
     * Check whether a value is empty.
     */
    function isEmpty(value) {
        return value === null ||
            value === undefined ||
            String(value).trim() === "";
    }

    /**
     * Read a form field safely.
     */
    function getFieldValue(id) {
        const element = getElement(id);

        return element ? element.value.trim() : "";
    }

    /**
     * Set a button's loading appearance.
     */
    function setButtonLoading(button, isLoading, loadingText) {
        if (!button) {
            return;
        }

        if (isLoading) {
            if (!button.dataset.originalText) {
                button.dataset.originalText = button.textContent.trim();
            }

            button.disabled = true;
            button.textContent = loadingText || "Please wait...";
            button.setAttribute("aria-busy", "true");
        } else {
            button.disabled = false;

            if (button.dataset.originalText) {
                button.textContent = button.dataset.originalText;
                delete button.dataset.originalText;
            }

            button.removeAttribute("aria-busy");
        }
    }

    /**
     * Shared application utilities.
     */
    window.EduAdmin = Object.freeze({
        getElement: getElement,
        showMessage: showMessage,
        hideMessage: hideMessage,
        formatCurrency: formatCurrency,
        formatDate: formatDate,
        isEmpty: isEmpty,
        getFieldValue: getFieldValue,
        setButtonLoading: setButtonLoading
    });

    document.addEventListener("DOMContentLoaded", function () {
        document.documentElement.classList.add("app-ready");
    });
})();
