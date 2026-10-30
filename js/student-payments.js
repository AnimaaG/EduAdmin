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

import { onAuthStateChanged } from
  "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";

document.addEventListener("DOMContentLoaded", () => {
  const $ = (id) => document.getElementById(id);

  const searchInput = $("student-payment-search");
  const statusFilter = $("student-payment-status-filter");
  const tableBody = $("student-payments-table-body");
  const paymentForm = $("student-payment-form");
  const message = $("student-payment-message");

  const totalFeesElement = $("student-total-fees");
  const amountPaidElement = $("student-amount-paid");
  const outstandingElement = $("student-outstanding-balance");

  const upiElement = $("student-academy-upi");
  const payeeElement = $("student-academy-payee");

  const feeSelect = $("student-fee-select");
  const installmentGroup = $("student-installment-group");
  const installmentSelect = $("student-installment-select");
  const installmentHelp = $("student-installment-help");
  const amountInput = $("student-payment-amount");
  const methodSelect = $("student-payment-method");
  const referenceInput = $("student-payment-reference");
  const dateInput = $("student-payment-date");

  let currentUser = null;
  let studentProfile = null;
  let feeRecords = [];
  let paymentRecords = [];
  let academyId = "";
  let isSubmitting = false;

  function showMessage(text, type = "info") {
    if (!message) return;

    message.textContent = text;
    message.dataset.type = type;
  }

  function setText(element, value) {
    if (element) element.textContent = value;
  }

  function formatAmount(amount) {
    const value = Number(amount);

    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(Number.isFinite(value) ? value : 0);
  }

  function formatDate(value) {
    if (!value) return "—";

    if (typeof value.toDate === "function") {
      return value.toDate().toLocaleDateString("en-IN");
    }

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

  function getFeeBalance(fee) {
    return Math.max(
      0,
      (Number(fee.amount) || 0) - (Number(fee.amountPaid) || 0)
    );
  }

  function getInstallmentBalance(installment) {
    return Math.max(
      0,
      (Number(installment.amount) || 0) -
      (Number(installment.amountPaid) || 0)
    );
  }

  function getSelectedFee() {
    return feeRecords.find((fee) => fee.id === feeSelect?.value) || null;
  }

  function getSelectedInstallment(fee = getSelectedFee()) {
    if (!fee || fee.paymentPlan !== "installments") return null;

    return (Array.isArray(fee.installments) ? fee.installments : [])
      .find((item) => Number(item.number) === Number(installmentSelect?.value))
      || null;
  }

  function getPayableBalance(fee = getSelectedFee()) {
    if (!fee) return 0;

    if (fee.paymentPlan === "installments") {
      const installment = getSelectedInstallment(fee);
      return installment ? getInstallmentBalance(installment) : 0;
    }

    return getFeeBalance(fee);
  }

  function updateSummary() {
    const totalFees = feeRecords.reduce(
      (sum, fee) => sum + (Number(fee.amount) || 0), 0
    );

    const totalPaid = feeRecords.reduce(
      (sum, fee) => sum + (Number(fee.amountPaid) || 0), 0
    );

    const outstanding = feeRecords.reduce(
      (sum, fee) => sum + getFeeBalance(fee), 0
    );

    setText(totalFeesElement, formatAmount(totalFees));
    setText(amountPaidElement, formatAmount(totalPaid));
    setText(outstandingElement, formatAmount(outstanding));
  }

  function renderFeeOptions() {
    if (!feeSelect) return;

    const previousValue = feeSelect.value;
    feeSelect.replaceChildren();

    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Select a fee to pay";
    feeSelect.appendChild(placeholder);

    const payableFees = feeRecords.filter((fee) => getFeeBalance(fee) > 0);

    payableFees.forEach((fee) => {
      const option = document.createElement("option");
      option.value = fee.id;

      const description = fee.feeType || fee.description || "Fee";
      option.textContent =
        `${description} — Balance: ${formatAmount(getFeeBalance(fee))}`;

      feeSelect.appendChild(option);
    });

    feeSelect.disabled = payableFees.length === 0;

    if (payableFees.some((fee) => fee.id === previousValue)) {
      feeSelect.value = previousValue;
    }
  }

  function renderInstallmentOptions(fee) {
    if (!installmentGroup || !installmentSelect) return;

    const isInstallmentPlan =
      fee?.paymentPlan === "installments" &&
      Array.isArray(fee.installments);

    installmentGroup.hidden = !isInstallmentPlan;
    installmentSelect.required = Boolean(isInstallmentPlan);
    installmentSelect.replaceChildren();

    if (!isInstallmentPlan) {
      updateAmountLimit();
      return;
    }

    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Select an installment";
    installmentSelect.appendChild(placeholder);

    const payable = fee.installments.filter(
      (item) => getInstallmentBalance(item) > 0
    );

    payable.forEach((item) => {
      const option = document.createElement("option");
      option.value = String(item.number);
      option.textContent =
        `Installment ${item.number} — Due ${item.dueDate || "—"} — ` +
        `Balance ${formatAmount(getInstallmentBalance(item))}`;

      installmentSelect.appendChild(option);
    });

    installmentSelect.disabled = payable.length === 0;

    if (installmentHelp) {
      installmentHelp.textContent = payable.length
        ? "Choose the installment you are paying. The amount cannot exceed its remaining balance."
        : "No installments are currently outstanding.";
    }

    updateAmountLimit();
  }

  function updateAmountLimit() {
    const fee = getSelectedFee();

    if (!fee || (fee.paymentPlan === "installments" && !getSelectedInstallment(fee))) {
      amountInput?.removeAttribute("max");
      if (amountInput) amountInput.placeholder = "Select a fee and installment";
      renderUpiQr();
      return;
    }

    const balance = getPayableBalance(fee);

    if (amountInput) {
            const balanceInPaise = Math.round(balance * 100);
      const enteredInPaise = Math.round(
        (Number(amountInput.value) || 0) * 100
      );

      amountInput.max = (balanceInPaise / 100).toFixed(2);
      amountInput.placeholder =
        `Maximum ${(balanceInPaise / 100).toFixed(2)}`;

      if (enteredInPaise > balanceInPaise) {
        amountInput.value = (balanceInPaise / 100).toFixed(2);
      }
    }

    renderUpiQr();
  }

  function renderPayments() {
    if (!tableBody) return;

    const searchTerm = (searchInput?.value || "").trim().toLowerCase();
    const selectedStatus = (statusFilter?.value || "").toLowerCase();

    const filtered = paymentRecords.filter((payment) => {
      const searchable = [
        payment.date,
        payment.description,
        payment.reference,
        payment.status,
        payment.installmentNumber
      ].filter(Boolean).join(" ").toLowerCase();

      return searchable.includes(searchTerm) &&
        (!selectedStatus ||
          String(payment.status || "").toLowerCase() === selectedStatus);
    });

    tableBody.replaceChildren();

    if (!filtered.length) {
      const row = document.createElement("tr");
      const cell = document.createElement("td");
      cell.colSpan = 6;
      cell.textContent = paymentRecords.length
        ? "No payments match your search or filter."
        : "Your submitted payments will appear here.";
      row.appendChild(cell);
      tableBody.appendChild(row);
      return;
    }

    filtered.forEach((payment) => {
      const row = document.createElement("tr");

      [
        formatDate(payment.paymentDate || payment.createdAt),
        payment.description || payment.feeType || "Fee payment",
        payment.installmentNumber
          ? `#${payment.installmentNumber}`
          : "—",
        formatAmount(payment.amount),
        payment.transactionReference || "—",
        formatStatus(payment.status)
      ].forEach((value) => {
        const cell = document.createElement("td");
        cell.textContent = String(value);
        row.appendChild(cell);
      });

      tableBody.appendChild(row);
    });
  }

  function renderUpiQr() {
    const section = $("student-upi-qr-section");
    const qrContainer = $("student-upi-qr");
    const amountLabel = $("student-upi-qr-amount");

    if (!section || !qrContainer || !amountLabel) return;

    qrContainer.replaceChildren();

    const upiId = upiElement?.textContent?.trim() || "";
    const payeeName = payeeElement?.textContent?.trim() || "";

    if (
      !/^[\w.-]+@[\w.-]+$/.test(upiId) ||
      !payeeName ||
      upiId === "Not configured by your academy"
    ) {
      section.hidden = true;
      return;
    }

    const fee = getSelectedFee();
    const installment = getSelectedInstallment(fee);
    const enteredAmount = Number(amountInput?.value);
    const balance = getPayableBalance(fee);

    const upiUrl = new URL("upi://pay");
    upiUrl.searchParams.set("pa", upiId);
    upiUrl.searchParams.set("pn", payeeName);
    upiUrl.searchParams.set("cu", "INR");

    if (
      fee &&
      (fee.paymentPlan !== "installments" || installment) &&
      Number.isFinite(enteredAmount) &&
      enteredAmount > 0 &&
      enteredAmount <= balance
    ) {
      upiUrl.searchParams.set("am", enteredAmount.toFixed(2));

      const note = installment
        ? `${fee.feeType || "Fee"} installment ${installment.number}`
        : fee.feeType || fee.description || "Fee payment";

      upiUrl.searchParams.set("tn", note);
      amountLabel.textContent = `Amount: ${formatAmount(enteredAmount)}`;
    } else {
      amountLabel.textContent =
        "Select a fee, select an installment if applicable, and enter an amount.";
    }

    const image = document.createElement("img");
    image.alt = "UPI payment QR code";
    image.width = 220;
    image.height = 220;
    image.style.display = "block";
    image.style.margin = "12px 0";
    image.src =
      "https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=" +
      encodeURIComponent(upiUrl.toString());

    image.onerror = () => {
      qrContainer.replaceChildren();
      const errorText = document.createElement("p");
      errorText.textContent =
        "QR code could not be loaded. Check your internet connection.";
      qrContainer.appendChild(errorText);
    };

    qrContainer.appendChild(image);
    section.hidden = false;
  }

  async function loadStudentData(user) {
    currentUser = user;

    const profileSnapshot = await getDoc(doc(db, "users", user.uid));

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

    setText(upiElement, "Not configured by your academy");
    setText(payeeElement, "Not configured by your academy");

    const snapshot = await getDoc(doc(db, "academies", academyId));
    if (!snapshot.exists()) return;

    const settings = snapshot.data().settings?.payment || {};

    setText(upiElement, settings.upiId || "Not configured by your academy");
    setText(payeeElement, settings.payeeName || "Not configured by your academy");

    renderUpiQr();
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

    if (feeSelect.value) {
      renderInstallmentOptions(getSelectedFee());
    } else {
      updateAmountLimit();
    }
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

    if (isSubmitting || !currentUser || !studentProfile || !academyId) return;

    const fee = getSelectedFee();
    const installment = getSelectedInstallment(fee);
    const amount = Number(amountInput?.value);
    const method = methodSelect?.value || "";
    const reference = referenceInput?.value.trim() || "";
    const paymentDate = dateInput?.value || "";

    if (!fee) {
      showMessage("Select a fee before submitting payment details.", "error");
      return;
    }

    if (fee.paymentPlan === "installments" && !installment) {
      showMessage("Select an outstanding installment.", "error");
      return;
    }

    const balance = getPayableBalance(fee);

    if (!Number.isFinite(amount) || amount <= 0) {
      showMessage("Enter a valid payment amount greater than zero.", "error");
      return;
    }

        const amountInPaise = Math.round(amount * 100);
        const balanceInPaise = Math.round(balance * 100);

        if (amountInPaise > balanceInPaise) {
          showMessage(
            `The amount cannot exceed the selected balance of ${formatAmount(balance)}.`,
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

    const duplicateReference = paymentRecords.some((payment) =>
      String(payment.transactionReference || "").trim().toLowerCase() ===
      reference.toLowerCase()
    );

    if (duplicateReference) {
      showMessage(
        "This transaction reference is already in your payment history.",
        "error"
      );
      return;
    }

    isSubmitting = true;
    const submitButton = paymentForm.querySelector('button[type="submit"]');
    if (submitButton) submitButton.disabled = true;

    try {
      const payload = {
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
      };

      if (installment) {
        payload.installmentNumber = Number(installment.number);
        payload.installmentDueDate = installment.dueDate || "";
      }

      await addDoc(collection(db, "paymentSubmissions"), payload);

      paymentForm.reset();
      showMessage(
        "Payment details submitted. The payment is pending academy verification.",
        "success"
      );

      await Promise.all([loadPaymentHistory(), loadFees()]);
    } catch (error) {
      console.error("Payment submission failed:", error);

      showMessage(
        error.code === "permission-denied"
          ? "Firebase denied this submission. Check paymentSubmissions and fees rules."
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

  feeSelect?.addEventListener("change", () => {
    renderInstallmentOptions(getSelectedFee());
  });

  installmentSelect?.addEventListener("change", updateAmountLimit);
  amountInput?.addEventListener("input", updateAmountLimit);

  paymentForm?.addEventListener("submit", submitPayment);

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
          ? "Firebase denied access. Check users, fees, academies and paymentSubmissions rules."
          : error.message || "Could not load your payment details.",
        "error"
      );
    }
  });
});