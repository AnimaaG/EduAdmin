
import { auth, db } from "./firebase-config.js";

import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  addDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";

document.addEventListener("DOMContentLoaded", () => {
  const searchInput = document.getElementById("student-payment-search");
  const statusFilter = document.getElementById("student-payment-status-filter");
  const tableBody = document.getElementById("student-payments-table-body");
  const paymentForm = document.getElementById("student-payment-form");
  const message = document.getElementById("student-payment-message");

  const totalFeesElement = document.getElementById("student-total-fees");
  const amountPaidElement = document.getElementById("student-amount-paid");
  const outstandingElement = document.getElementById("student-outstanding-balance");

  const upiElement = document.getElementById("student-academy-upi");
  const payeeElement = document.getElementById("student-academy-payee");

  const feeSelect = document.getElementById("student-fee-select");
  const amountInput = document.getElementById("student-payment-amount");
  const methodSelect = document.getElementById("student-payment-method");
  const referenceInput = document.getElementById("student-payment-reference");
  const dateInput = document.getElementById("student-payment-date");

  let currentUser = null;
  let studentProfile = null;
  let feeRecords = [];
  let paymentRecords = [];
  let academyId = null;
  let isSubmitting = false;

  function showMessage(text, type = "info") {
    if (!message) return;

    message.textContent = text;
    message.dataset.type = type;
  }

  function formatAmount(amount) {
    const value = Number(amount);

    if (!Number.isFinite(value)) return "₹0.00";

    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value);
  }

  function formatDate(value) {
    if (!value) return "—";

    // Firestore Timestamp
    if (typeof value.toDate === "function") {
      return value.toDate().toLocaleDateString("en-IN");
    }

    // Date strings stored as YYYY-MM-DD
    const date = new Date(`${value}T00:00:00`);

    if (Number.isNaN(date.getTime())) return String(value);

    return date.toLocaleDateString("en-IN");
  }

  function formatStatus(status) {
    const labels = {
      pending: "Pending review",
      approved: "Approved",
      rejected: "Rejected"
    };

    return labels[String(status || "").toLowerCase()] || "Unknown";
  }

  function setText(element, value) {
    if (element) element.textContent = value;
  }

  function getFeeBalance(fee) {
    return Math.max(
      0,
      Number(fee.amount || 0) - Number(fee.amountPaid || 0)
    );
  }

  function updateSummary() {
    const totalFees = feeRecords.reduce(
      (sum, fee) => sum + Number(fee.amount || 0),
      0
    );

    const totalPaid = feeRecords.reduce(
      (sum, fee) => sum + Number(fee.amountPaid || 0),
      0
    );

    const outstanding = feeRecords.reduce(
      (sum, fee) => sum + getFeeBalance(fee),
      0
    );

    setText(totalFeesElement, formatAmount(totalFees));
    setText(amountPaidElement, formatAmount(totalPaid));
    setText(outstandingElement, formatAmount(outstanding));
  }

  function renderFeeOptions() {
    if (!feeSelect) return;

    feeSelect.replaceChildren();

    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = feeRecords.length
      ? "Select a fee to pay"
      : "No outstanding fees available";

    feeSelect.appendChild(placeholder);

    const payableFees = feeRecords.filter(
      (fee) => getFeeBalance(fee) > 0
    );

    payableFees.forEach((fee) => {
      const option = document.createElement("option");
      option.value = fee.id;

      const description = fee.feeType || fee.description || "Fee";
      option.textContent =
        `${description} — Balance: ${formatAmount(getFeeBalance(fee))}`;

      feeSelect.appendChild(option);
    });

    feeSelect.disabled = payableFees.length === 0;
  }

  function updateAmountLimit() {
    if (!feeSelect || !amountInput) return;

    const fee = feeRecords.find((item) => item.id === feeSelect.value);

    if (!fee) {
      amountInput.removeAttribute("max");
      return;
    }

    const balance = getFeeBalance(fee);

    amountInput.max = String(balance);
    amountInput.placeholder = `Maximum ${balance.toFixed(2)}`;

    if (Number(amountInput.value) > balance) {
      amountInput.value = balance.toFixed(2);
    }
  }

  function renderPayments() {
    if (!tableBody) return;

    const searchTerm = (searchInput?.value || "").trim().toLowerCase();
    const selectedStatus = (statusFilter?.value || "").toLowerCase();

    const filteredPayments = paymentRecords.filter((payment) => {
      const searchableText = [
        payment.date,
        payment.description,
        payment.reference,
        payment.status
      ].filter(Boolean).join(" ").toLowerCase();

      return searchableText.includes(searchTerm) &&
        (!selectedStatus ||
          String(payment.status || "").toLowerCase() === selectedStatus);
    });

    tableBody.replaceChildren();

    if (!filteredPayments.length) {
      const row = document.createElement("tr");
      const cell = document.createElement("td");
      const emptyState = document.createElement("div");
      const heading = document.createElement("h3");
      const description = document.createElement("p");

      cell.colSpan = 5;
      emptyState.className = "empty-state";
      heading.textContent = "No payment records available";
      description.textContent = paymentRecords.length
        ? "No payments match the selected search or status filter."
        : "Your submitted payments will appear here.";

      emptyState.append(heading, description);
      cell.appendChild(emptyState);
      row.appendChild(cell);
      tableBody.appendChild(row);
      return;
    }

    filteredPayments.forEach((payment) => {
      const row = document.createElement("tr");

      [
        formatDate(payment.paymentDate || payment.createdAt),
        payment.description || payment.feeType || "Fee payment",
        formatAmount(payment.amount),
        payment.transactionReference || "—",
        formatStatus(payment.status)
      ].forEach((value) => {
        const cell = document.createElement("td");
        cell.textContent = value;
        row.appendChild(cell);
      });

      tableBody.appendChild(row);
    });
  }

  async function loadStudentData(user) {
    currentUser = user;

    const profileRef = doc(db, "users", user.uid);
    const profileSnapshot = await getDoc(profileRef);

    if (!profileSnapshot.exists()) {
      throw new Error("Your student profile was not found.");
    }

    studentProfile = profileSnapshot.data();

    if (studentProfile.role !== "student" || studentProfile.isActive !== true) {
      throw new Error("Your account is not an active student account.");
    }

    academyId = studentProfile.academyId;

    if (!academyId) {
      throw new Error("Your account is not linked to an academy.");
    }

    await Promise.all([
      loadAcademyPaymentDetails(),
      loadFees(),
      loadPaymentHistory()
    ]);
  }

  async function loadAcademyPaymentDetails() {
    if (!academyId) return;

    if (upiElement) upiElement.textContent = "Not configured";
    if (payeeElement) payeeElement.textContent = "Not configured";

    const academySnapshot = await getDoc(
      doc(db, "academies", academyId)
    );

    if (!academySnapshot.exists()) return;

    const academy = academySnapshot.data();
    const paymentSettings = academy.settings?.payment || {};

    setText(
      upiElement,
      paymentSettings.upiId || "Not configured by your academy"
    );

    setText(
      payeeElement,
      paymentSettings.payeeName || "Not configured by your academy"
    );
  }

  async function loadFees() {
    const feesQuery = query(
      collection(db, "fees"),
      where("academyId", "==", academyId),
      where("studentId", "==", currentUser.uid)
    );

    const snapshot = await getDocs(feesQuery);

    feeRecords = snapshot.docs.map((feeDoc) => ({
      id: feeDoc.id,
      ...feeDoc.data()
    }));

    updateSummary();
    renderFeeOptions();
    updateAmountLimit();
  }

  async function loadPaymentHistory() {
    const historyQuery = query(
      collection(db, "paymentSubmissions"),
      where("academyId", "==", academyId),
      where("studentId", "==", currentUser.uid)
    );

    const snapshot = await getDocs(historyQuery);

    paymentRecords = snapshot.docs.map((paymentDoc) => {
      const payment = paymentDoc.data();

      return {
        id: paymentDoc.id,
        ...payment,
        date: formatDate(payment.paymentDate || payment.createdAt),
        description: payment.description || payment.feeType || "Fee payment",
        reference: payment.transactionReference || ""
      };
    });

    renderPayments();
  }

  async function submitPayment(event) {
    event.preventDefault();

    if (isSubmitting || !currentUser || !studentProfile || !academyId) {
      return;
    }

    const feeId = feeSelect?.value || "";
    const amount = Number(amountInput?.value);
    const method = methodSelect?.value || "";
    const reference = referenceInput?.value.trim() || "";
    const paymentDate = dateInput?.value || "";

    const fee = feeRecords.find((item) => item.id === feeId);

    if (!fee) {
      showMessage("Select a fee before submitting payment details.", "error");
      return;
    }

    const balance = getFeeBalance(fee);

    if (!Number.isFinite(amount) || amount <= 0) {
      showMessage("Enter a valid payment amount greater than zero.", "error");
      return;
    }

    if (amount > balance) {
      showMessage(
        `The amount cannot exceed the outstanding balance of ${formatAmount(balance)}.`,
        "error"
      );
      return;
    }

    if (!["upi", "bank-transfer"].includes(method)) {
      showMessage("Select a valid payment method.", "error");
      return;
    }

    if (!reference) {
      showMessage("Enter the transaction reference.", "error");
      return;
    }

    if (!paymentDate) {
      showMessage("Select the date you made the payment.", "error");
      return;
    }

    // Avoid submitting a reference that is already in this student's
    // currently loaded payment history.
    const duplicateReference = paymentRecords.some(
      (payment) =>
        String(payment.transactionReference || "").trim().toLowerCase() ===
        reference.toLowerCase()
    );

    if (duplicateReference) {
      showMessage(
        "This transaction reference is already in your payment history. Check the reference and try again.",
        "error"
      );
      return;
    }

    isSubmitting = true;

    const submitButton = paymentForm.querySelector('button[type="submit"]');
    if (submitButton) submitButton.disabled = true;

    try {
      await addDoc(collection(db, "paymentSubmissions"), {
        academyId,
        studentId: currentUser.uid,
        studentName:
          studentProfile.fullName ||
          studentProfile.name ||
          currentUser.email ||
          "Student",
        feeId: fee.id,
        feeType: fee.feeType || fee.description || "Fee",
        amount,
        method,
        transactionReference: reference,
        paymentDate,
        status: "pending",
        createdAt: serverTimestamp()
      });

      paymentForm.reset();

      showMessage(
        "Payment details submitted. Your payment is pending academy verification.",
        "success"
      );

      await loadPaymentHistory();
    } catch (error) {
      console.error("Payment submission failed:", error);

      showMessage(
        error.code === "permission-denied"
          ? "Firebase denied this submission. Check your Firestore rules for paymentSubmissions."
          : "Could not submit payment details. Check your connection and try again.",
        "error"
      );
    } finally {
      isSubmitting = false;
      if (submitButton) submitButton.disabled = false;
      updateAmountLimit();
    }
  }

  searchInput?.addEventListener("input", renderPayments);
  statusFilter?.addEventListener("change", renderPayments);
  feeSelect?.addEventListener("change", updateAmountLimit);

  if (paymentForm) {
    paymentForm.addEventListener("submit", submitPayment);

    // Enable the form if the HTML still contains a disabled fieldset.
    const fieldset = paymentForm.querySelector("fieldset");
    if (fieldset) fieldset.disabled = false;
  }

  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      showMessage("Sign in to view your fees and payment history.", "error");
      return;
    }

    try {
      showMessage("Loading your fees and payment details...");

      await loadStudentData(user);

      showMessage("");
    } catch (error) {
      console.error("Could not load student payment data:", error);

      showMessage(
        error.code === "permission-denied"
          ? "Firebase denied access. Check your Firestore rules for users, fees, academies, and paymentSubmissions."
          : error.message || "Could not load your payment details.",
        "error"
      );
    }
  });
});
