
/**
 * EduAdmin - Fees and Payments
 *
 * Frontend only.
 * No payment settings or approval decisions are saved.
 */

(() => {
  "use strict";

  const paymentSearch = document.getElementById("payment-search");
  const paymentStatusFilter = document.getElementById("payment-status-filter");
  const paymentTable = document.getElementById("payment-approvals-table-body");
  const settingsForm = document.getElementById("upi-settings-form");
  const upiIdInput = document.getElementById("upi-id");
  const payeeNameInput = document.getElementById("upi-payee-name");
  const qrFileInput = document.getElementById("upi-qr-file");

  if (!settingsForm || !paymentTable) {
    console.error("EduAdmin: Fees page elements were not found.");
    return;
  }

  function showFormMessage(form, messageText, type = "info") {
    let message = form.querySelector(".form-message");

    if (!message) {
      message = document.createElement("div");
      message.className = "form-message";
      message.setAttribute("role", "status");
      form.prepend(message);
    }

    message.textContent = messageText;
    message.className = `form-message ${type}`;
    message.setAttribute("role", type === "error" ? "alert" : "status");
  }

  function renderEmptyState(messageText) {
    paymentTable.replaceChildren();

    const row = document.createElement("tr");
    const cell = document.createElement("td");
    const heading = document.createElement("strong");
    const description = document.createElement("p");

    cell.colSpan = 7;
    cell.className = "empty-state";

    heading.textContent = messageText;
    description.textContent =
      "Payment requests will appear here after backend integration.";

    cell.append(heading, description);
    row.appendChild(cell);
    paymentTable.appendChild(row);
  }

  function filterPaymentRequests() {
    const hasSearch = Boolean(paymentSearch?.value.trim());
    const status = paymentStatusFilter?.value || "all";

    if (hasSearch || status !== "all") {
      renderEmptyState("No matching payment requests are available");
    } else {
      renderEmptyState("No payment requests loaded");
    }
  }

  paymentSearch?.addEventListener("input", filterPaymentRequests);
  paymentStatusFilter?.addEventListener("change", filterPaymentRequests);

  settingsForm.addEventListener("submit", (event) => {
    event.preventDefault();

    const upiId = upiIdInput.value.trim();
    const payeeName = payeeNameInput.value.trim();
    const qrFile = qrFileInput.files[0];

    if (!upiId && !payeeName && !qrFile) {
      showFormMessage(
        settingsForm,
        "Enter a UPI ID, payee name, or select a QR image before validating.",
        "error"
      );
      return;
    }

    if (upiId && !/^[\w.-]+@[\w.-]+$/.test(upiId)) {
      showFormMessage(
        settingsForm,
        "Check the UPI ID format. Example: yourname@bank. This format check does not verify that the UPI ID exists.",
        "error"
      );
      upiIdInput.focus();
      return;
    }

    if (payeeName.length > 100) {
      showFormMessage(
        settingsForm,
        "The payee name must be 100 characters or fewer.",
        "error"
      );
      payeeNameInput.focus();
      return;
    }

    if (qrFile) {
      const allowedTypes = [
        "image/png",
        "image/jpeg",
        "image/webp"
      ];

      if (!allowedTypes.includes(qrFile.type)) {
        showFormMessage(
          settingsForm,
          "Select a PNG, JPEG, or WebP QR image.",
          "error"
        );
        qrFileInput.value = "";
        return;
      }

      const maxSize = 5 * 1024 * 1024;

      if (qrFile.size > maxSize) {
        showFormMessage(
          settingsForm,
          "The QR image must be 5 MB or smaller.",
          "error"
        );
        qrFileInput.value = "";
        return;
      }
    }

    showFormMessage(
      settingsForm,
      "Validation complete. Nothing has been saved or uploaded. Connect secure backend storage before using these settings for real payments.",
      "info"
    );
  });

  renderEmptyState("No payment requests loaded");
})();
