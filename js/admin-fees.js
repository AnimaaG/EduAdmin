import { auth, db } from "./firebase-config.js";

import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  writeBatch,
  updateDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

import { onAuthStateChanged } from
  "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";

(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);

  const currency = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2
  });

  let academyId = "";
  let adminUid = "";
  let students = [];
  let fees = [];
  let payments = [];
  let busy = false;

  const assignmentForm = $("fee-assignment-form");
  const studentSelect = $("fee-student");
  const groupSelect = $("fee-group-students");
  const groupAmounts = $("group-student-amounts");
  const assignmentMode = $("fee-assignment-mode");
  const paymentPlan = $("fee-payment-plan");

  const paymentBody = $("payment-approvals-table-body");
  const pendingPaymentBody = $("pending-payments-table-body");
  const feeBody = $("fee-records-table-body");
  const installmentBody = $("installment-records-table-body");
  const message = $("fees-message");

  function showMessage(text, type = "info") {
    if (!message) return;

    message.textContent = text;
    message.className = `form-message ${type}`;
    message.hidden = false;
    message.setAttribute("role", type === "error" ? "alert" : "status");
  }

  function money(value) {
    return currency.format(Number(value) || 0);
  }

  function studentName(student) {
    return student.fullName || student.name || student.email || student.id;
  }

  function dateValue(value) {
    if (!value) return 0;
    if (typeof value.toMillis === "function") return value.toMillis();
    if (typeof value.toDate === "function") return value.toDate().getTime();
    if (value instanceof Date) return value.getTime();

    const parsed = new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function formatDate(value) {
    const timestamp = dateValue(value);
    if (!timestamp) return "—";

    return new Date(timestamp).toLocaleString("en-IN", {
      dateStyle: "medium",
      timeStyle: "short"
    });
  }

  function setBusy(value) {
    busy = value;

    document.querySelectorAll(
      "[data-fees-action], #fee-assignment-form button"
    ).forEach((button) => {
      button.disabled = value;
    });
  }

  function makeCell(value) {
    const td = document.createElement("td");
    td.textContent = String(value ?? "—");
    return td;
  }

  function setSelectOptions(select, options, placeholder) {
    if (!select) return;

    select.replaceChildren();

    const first = document.createElement("option");
    first.value = "";
    first.textContent = placeholder;
    select.appendChild(first);

    options.forEach((item) => {
      const option = document.createElement("option");
      option.value = item.id;
      option.textContent = studentName(item);
      select.appendChild(option);
    });
  }

  // ---------------- TABS ----------------

  function activateTab(panelId) {
    document.querySelectorAll("[data-fee-tab]").forEach((button) => {
      const active = button.dataset.feeTab === panelId;
      button.setAttribute("aria-selected", String(active));
      button.tabIndex = active ? 0 : -1;
    });

    document.querySelectorAll(".fee-tab-panel").forEach((panel) => {
      panel.hidden = panel.id !== panelId;
    });
  }

  document.querySelectorAll("[data-fee-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      activateTab(button.dataset.feeTab);
    });
  });

  // ---------------- INSTALLMENT SCHEDULE ----------------

  function dateFromInput(value) {
    if (!value) return null;

    const parts = value.split("-").map(Number);
    if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) {
      return null;
    }

    const date = new Date(parts[0], parts[1] - 1, parts[2], 12);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function dateToInput(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function addMonthsKeepingDay(date, months) {
    const day = date.getDate();
    const result = new Date(date.getFullYear(), date.getMonth() + months, 1, 12);
    const lastDay = new Date(
      result.getFullYear(),
      result.getMonth() + 1,
      0,
      12
    ).getDate();

    result.setDate(Math.min(day, lastDay));
    return result;
  }

  function buildInstallmentSchedule(totalAmount) {
    const count = Number($("fee-installment-count")?.value);
    const frequency = $("fee-installment-frequency")?.value;
    const firstDate = dateFromInput($("fee-first-installment-date")?.value);
    const finalDate = dateFromInput($("fee-due-date")?.value);

    if (!Number.isInteger(count) || count < 2 || count > 36) {
      throw new Error("Installment count must be between 2 and 36.");
    }

    if (!["weekly", "monthly"].includes(frequency)) {
      throw new Error("Select weekly or monthly installment frequency.");
    }

    if (!firstDate || !finalDate) {
      throw new Error("Choose the first installment date and final due date.");
    }

    if (firstDate > finalDate) {
      throw new Error("The first installment date cannot be after the final due date.");
    }

    const schedule = [];
    const baseAmount = Math.floor((totalAmount / count) * 100) / 100;
    let allocated = 0;

    for (let index = 0; index < count; index += 1) {
      let dueDate;

      if (frequency === "weekly") {
        dueDate = new Date(firstDate);
        dueDate.setDate(dueDate.getDate() + index * 7);
      } else {
        dueDate = addMonthsKeepingDay(firstDate, index);
      }

      if (dueDate > finalDate) {
        throw new Error(
          `The ${count} installments do not fit before the final due date. ` +
          "Change the count, frequency, first date or final due date."
        );
      }

      const amount = index === count - 1
        ? Math.round((totalAmount - allocated) * 100) / 100
        : baseAmount;

      allocated = Math.round((allocated + amount) * 100) / 100;

      schedule.push({
        number: index + 1,
        amount,
        amountPaid: 0,
        dueDate: dateToInput(dueDate),
        status: "pending"
      });
    }

    if (Math.round(allocated * 100) !== Math.round(totalAmount * 100)) {
      throw new Error("Installment amounts do not equal the total fee.");
    }

    return schedule;
  }

  function renderSchedulePreview() {
    const preview = $("installment-schedule-preview");
    if (!preview) return;

    preview.replaceChildren();

    if (paymentPlan?.value !== "installments") return;

    const mode = assignmentMode?.value || "individual";
    const amount = mode === "individual"
      ? Number($("fee-individual-amount")?.value)
      : Number(
          groupAmounts?.querySelector("[data-student-amount]")?.value
        );

    if (!Number.isFinite(amount) || amount <= 0) {
      preview.textContent = "Enter a fee amount to preview its schedule.";
      return;
    }

    try {
      const schedule = buildInstallmentSchedule(amount);
      const table = document.createElement("table");
      const thead = document.createElement("thead");
      const headerRow = document.createElement("tr");

      ["Installment", "Due date", "Amount"].forEach((heading) => {
        const th = document.createElement("th");
        th.textContent = heading;
        headerRow.appendChild(th);
      });

      thead.appendChild(headerRow);
      table.appendChild(thead);

      const tbody = document.createElement("tbody");

      schedule.forEach((item) => {
        const row = document.createElement("tr");
        row.appendChild(makeCell(item.number));
        row.appendChild(makeCell(item.dueDate));
        row.appendChild(makeCell(money(item.amount)));
        tbody.appendChild(row);
      });

      table.appendChild(tbody);
      preview.appendChild(table);
    } catch (error) {
      preview.textContent = error.message;
    }
  }

  function updatePlanVisibility() {
    const isInstallmentPlan = paymentPlan?.value === "installments";
    const fields = $("installment-plan-fields");

    if (fields) fields.hidden = !isInstallmentPlan;

    [
      $("fee-installment-count"),
      $("fee-installment-frequency"),
      $("fee-first-installment-date")
    ].forEach((field) => {
      if (field) field.required = isInstallmentPlan;
    });

    renderSchedulePreview();
  }

  // ---------------- ASSIGNMENT FORM ----------------

  function renderGroupAmounts() {
    if (!groupAmounts || !groupSelect) return;

    const selectedIds = Array.from(groupSelect.selectedOptions)
      .map((option) => option.value)
      .filter(Boolean);

    const previous = new Map(
      Array.from(groupAmounts.querySelectorAll("[data-student-amount]"))
        .map((input) => [input.dataset.studentAmount, input.value])
    );

    groupAmounts.replaceChildren();

    if (!selectedIds.length) {
      groupAmounts.textContent =
        "Select students to enter their individual amounts.";
      renderSchedulePreview();
      return;
    }

    selectedIds.forEach((id) => {
      const student = students.find((item) => item.id === id);
      if (!student) return;

      const row = document.createElement("div");
      row.className = "form-group";

      const label = document.createElement("label");
      label.textContent = `${studentName(student)} — amount (₹)`;

      const input = document.createElement("input");
      input.type = "number";
      input.min = "0.01";
      input.step = "0.01";
      input.required = true;
      input.dataset.studentAmount = id;
      input.id = `group-amount-${id}`;
      input.value = previous.get(id) || "";
      input.addEventListener("input", renderSchedulePreview);

      label.htmlFor = input.id;
      row.append(label, input);
      groupAmounts.appendChild(row);
    });

    renderSchedulePreview();
  }

  function updateModeVisibility() {
    const mode = assignmentMode?.value || "individual";
    const individual = $("individual-fee-fields");
    const group = $("group-fee-fields");

    if (individual) individual.hidden = mode !== "individual";
    if (group) group.hidden = mode !== "group";

    if (studentSelect) studentSelect.required = mode === "individual";

    const individualAmount = $("fee-individual-amount");
    if (individualAmount) {
      individualAmount.required = mode === "individual";
    }

    renderSchedulePreview();
  }

  async function loadStudents() {
    const q = query(
      collection(db, "users"),
      where("academyId", "==", academyId),
      where("role", "==", "student"),
      where("isActive", "==", true)
    );

    const snapshot = await getDocs(q);

    students = snapshot.docs.map((item) => ({
      id: item.id,
      ...item.data()
    })).sort((a, b) => studentName(a).localeCompare(studentName(b)));

        setSelectOptions(studentSelect, students, "Choose a student");
        setSelectOptions(groupSelect, students, "Choose students");
        setSelectOptions(
          $("fee-record-student-filter"),
          students,
          "Choose a student to view fee records"
        );

        renderGroupAmounts();
  }

  function buildFeePayload(student, amount, feeType, description, dueDate, schedule) {
    return {
      academyId,
      studentId: student.id,
      studentName: studentName(student),
      feeType,
      description,
      amount,
      amountPaid: 0,
      dueDate,
      paymentPlan: schedule ? "installments" : "full",
      installmentFrequency: schedule
        ? $("fee-installment-frequency").value
        : null,
      installmentCount: schedule ? schedule.length : 0,
      installments: schedule || [],
      status: "pending",
      createdBy: adminUid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };
  }

  async function assignFees(event) {
    event.preventDefault();

    if (busy || !assignmentForm.reportValidity()) return;

    const mode = assignmentMode.value;
    const feeType = $("fee-type").value.trim();
    const description = $("fee-description").value.trim();
    const dueDate = $("fee-due-date").value;

    if (!feeType || !dueDate) {
      showMessage("Enter a fee type and final due date.", "error");
      return;
    }

    let assignments = [];

    if (mode === "individual") {
      const student = students.find((item) => item.id === studentSelect.value);
      const amount = Number($("fee-individual-amount").value);

      if (!student || !Number.isFinite(amount) || amount <= 0) {
        showMessage("Choose a student and enter a positive amount.", "error");
        return;
      }

      assignments = [{ student, amount }];
    } else {
      const selectedIds = Array.from(groupSelect.selectedOptions)
        .map((option) => option.value)
        .filter(Boolean);

      if (!selectedIds.length) {
        showMessage("Select at least one student.", "error");
        return;
      }

      assignments = selectedIds.map((id) => {
        const student = students.find((item) => item.id === id);
        const input = groupAmounts.querySelector(
          `[data-student-amount="${CSS.escape(id)}"]`
        );

        return { student, amount: Number(input?.value) };
      });

      if (assignments.some((item) =>
        !item.student || !Number.isFinite(item.amount) || item.amount <= 0
      )) {
        showMessage("Enter a valid amount for every selected student.", "error");
        return;
      }
    }

    const useInstallments = paymentPlan?.value === "installments";
    const schedules = new Map();

    try {
      if (useInstallments) {
        for (const item of assignments) {
          schedules.set(item.student.id, buildInstallmentSchedule(item.amount));
        }
      }
    } catch (error) {
      showMessage(error.message, "error");
      return;
    }

    setBusy(true);

    try {
      const batch = writeBatch(db);

      assignments.forEach(({ student, amount }) => {
        const feeRef = doc(collection(db, "fees"));
        batch.set(
          feeRef,
          buildFeePayload(
            student,
            amount,
            feeType,
            description,
            dueDate,
            schedules.get(student.id) || null
          )
        );
      });

      await batch.commit();

      assignmentForm.reset();
      updateModeVisibility();
      updatePlanVisibility();
      renderGroupAmounts();

      await loadFees();

      showMessage(
        `${assignments.length} fee assignment(s) created successfully.`,
        "success"
      );
    } catch (error) {
      console.error("Fee assignment failed:", error);
      showMessage(
        error.code === "permission-denied"
          ? "Firestore denied this fee assignment. Check the fees collection rules."
          : "Could not assign fees. Check the browser console and try again.",
        "error"
      );
    } finally {
      setBusy(false);
    }
  }

  // ---------------- LOAD RECORDS ----------------

  async function loadFees() {
    const q = query(
      collection(db, "fees"),
      where("academyId", "==", academyId)
    );

    const snapshot = await getDocs(q);
    fees = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));

        renderFees();
        updateSummary();
  }

  async function loadPayments() {
    const q = query(
      collection(db, "paymentSubmissions"),
      where("academyId", "==", academyId)
    );

    const snapshot = await getDocs(q);
    payments = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));

    renderPayments();
    renderPendingPayments();
    updateSummary();
  }

  function updateSummary() {
    const totalAssigned = fees.reduce(
      (sum, fee) => sum + (Number(fee.amount) || 0), 0
    );

    const totalPaid = fees.reduce(
      (sum, fee) => sum + (Number(fee.amountPaid) || 0), 0
    );

    const pending = payments.filter((payment) => payment.status === "pending");
    const rejected = payments.filter((payment) => payment.status === "rejected");

    const pendingAmount = pending.reduce(
      (sum, payment) => sum + (Number(payment.amount) || 0), 0
    );

    const rejectedAmount = rejected.reduce(
      (sum, payment) => sum + (Number(payment.amount) || 0), 0
    );

    const values = {
      "total-fees-assigned": money(totalAssigned),
      "total-fees-collected": money(totalPaid),
      "total-fees-outstanding": money(Math.max(0, totalAssigned - totalPaid)),
      "pending-review-amount": money(pendingAmount),
      "rejected-payment-amount": money(rejectedAmount),
      "pending-approvals-count": String(pending.length),
      "rejected-payments-count": String(rejected.length)
    };

    Object.entries(values).forEach(([id, value]) => {
      if ($(id)) $(id).textContent = value;
    });
  }

 
  function createInstallmentDetails(fee) {
    const installments = Array.isArray(fee.installments)
      ? fee.installments
      : [];

    const wrapper = document.createElement("div");
    wrapper.className = "fee-installment-details";

    if (fee.paymentPlan !== "installments" || installments.length === 0) {
      wrapper.textContent = "No installment schedule";
      return wrapper;
    }

    const heading = document.createElement("h4");
    heading.textContent = `Installment Schedule (${installments.length})`;
    wrapper.appendChild(heading);

    const tableContainer = document.createElement("div");
    tableContainer.className = "table-container";

    const table = document.createElement("table");
    table.className = "data-table";

    const thead = document.createElement("thead");
    const headerRow = document.createElement("tr");

    [
      "Installment",
      "Due Date",
      "Scheduled",
      "Paid",
      "Balance",
      "Status"
    ].forEach((headingText) => {
      const th = document.createElement("th");
      th.textContent = headingText;
      headerRow.appendChild(th);
    });

    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");

    installments.forEach((item) => {
      const scheduled = Math.round((Number(item.amount) || 0) * 100) / 100;
      const paid = Math.round((Number(item.amountPaid) || 0) * 100) / 100;
      const balance = Math.max(0, Math.round((scheduled - paid) * 100) / 100);

      const status =
        balance <= 0
          ? "Paid"
          : paid > 0
            ? "Partial"
            : "Pending";

      const row = document.createElement("tr");

      [
        item.number ?? "—",
        item.dueDate || "—",
        money(scheduled),
        money(paid),
        money(balance),
        status
      ].forEach((value) => row.appendChild(makeCell(value)));

      tbody.appendChild(row);
    });

    table.appendChild(tbody);
    tableContainer.appendChild(table);
    wrapper.appendChild(tableContainer);

    return wrapper;
  }

  function renderFees() {
    if (!feeBody) return;

    feeBody.replaceChildren();

    const selectedStudentId =
      $("fee-record-student-filter")?.value || "";

    const term = ($("fee-record-search")?.value || "")
      .trim()
      .toLowerCase();

    const statusFilter = $("fee-record-status")?.value || "all";

    if (!selectedStudentId) {
      const row = document.createElement("tr");
      const cell = makeCell(
        "Choose a student above to view their fee records and installment schedules."
      );
      cell.colSpan = 9;
      row.appendChild(cell);
      feeBody.appendChild(row);
      return;
    }

    const visible = fees
      .filter((fee) => {
        const searchable = [
          fee.feeType,
          fee.description,
          fee.status
        ].join(" ").toLowerCase();

        return (
          fee.studentId === selectedStudentId &&
          searchable.includes(term) &&
          (statusFilter === "all" || fee.status === statusFilter)
        );
      })
      .sort((a, b) => dateValue(b.createdAt) - dateValue(a.createdAt));

    if (!visible.length) {
      const row = document.createElement("tr");
      const cell = makeCell("No matching fee records for this student.");
      cell.colSpan = 9;
      row.appendChild(cell);
      feeBody.appendChild(row);
      return;
    }

    visible.forEach((fee) => {
      const row = document.createElement("tr");

      const total = Number(fee.amount) || 0;
      const paid = Number(fee.amountPaid) || 0;
      const balance = Math.max(0, total - paid);

      [
        fee.studentName || "—",
        fee.feeType || "General",
        money(total),
        money(paid),
        money(balance),
        fee.dueDate || "—",
        fee.paymentPlan === "installments"
          ? "Installments"
          : "Full payment",
        fee.status || "pending",
        fee.paymentPlan === "installments"
          ? `${fee.installments?.length || 0} installments`
          : "Not applicable"
      ].forEach((value) => row.appendChild(makeCell(value)));

      feeBody.appendChild(row);

      // Display the installment schedule immediately below its fee record.
      const detailsRow = document.createElement("tr");
      detailsRow.className = "fee-installment-row";

      const detailsCell = document.createElement("td");
      detailsCell.colSpan = 9;

      detailsCell.appendChild(createInstallmentDetails(fee));
      detailsRow.appendChild(detailsCell);

      feeBody.appendChild(detailsRow);
    });
  }


  function renderInstallments() {
    if (!installmentBody) return;

    installmentBody.replaceChildren();
    let rowsAdded = 0;

    fees.forEach((fee) => {
      (Array.isArray(fee.installments) ? fee.installments : []).forEach((item) => {
        rowsAdded += 1;
        const paid = Number(item.amountPaid) || 0;
        const balance = Math.max(0, (Number(item.amount) || 0) - paid);
        const row = document.createElement("tr");

        [
          fee.studentName || "—",
          fee.feeType || "Fee",
          item.number,
          item.dueDate || "—",
          money(item.amount),
          money(paid),
          money(balance),
          balance <= 0 ? "paid" : (paid > 0 ? "partial" : "pending")
        ].forEach((value) => row.appendChild(makeCell(value)));

        installmentBody.appendChild(row);
      });
    });

    if (!rowsAdded) {
      const row = document.createElement("tr");
      const cell = makeCell("No installment schedules found.");
      cell.colSpan = 8;
      row.appendChild(cell);
      installmentBody.appendChild(row);
    }
  }

  // ---------------- PAYMENT REVIEW ----------------

  function makeReviewButtons(payment) {
    const cell = document.createElement("td");

    if (payment.status !== "pending") {
      cell.textContent = "Reviewed";
      return cell;
    }

    [
      { status: "approved", label: "Approve" },
      { status: "rejected", label: "Reject" }
    ].forEach(({ status, label }) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "btn btn-secondary";
      button.textContent = label;
      button.dataset.feesAction = "review-payment";
      button.dataset.paymentId = payment.id;
      button.dataset.nextStatus = status;
      cell.appendChild(button);
    });

    return cell;
  }

  function installmentLabel(payment) {
    return payment.installmentNumber
      ? `#${payment.installmentNumber}`
      : "—";
  }

  function renderPendingPayments() {
    if (!pendingPaymentBody) return;

    pendingPaymentBody.replaceChildren();

    const pending = payments
      .filter((payment) => payment.status === "pending")
      .sort((a, b) => dateValue(b.createdAt) - dateValue(a.createdAt));

    if (!pending.length) {
      const row = document.createElement("tr");
      const cell = makeCell("No payments are awaiting review.");
      cell.colSpan = 7;
      row.appendChild(cell);
      pendingPaymentBody.appendChild(row);
      return;
    }

    pending.forEach((payment) => {
      const row = document.createElement("tr");

      [
        payment.studentName || "—",
        payment.feeType || "—",
        installmentLabel(payment),
        money(payment.amount),
        payment.transactionReference || "—",
        formatDate(payment.createdAt)
      ].forEach((value) => row.appendChild(makeCell(value)));

      row.appendChild(makeReviewButtons(payment));
      pendingPaymentBody.appendChild(row);
    });
  }

  function renderPayments() {
    if (!paymentBody) return;

    paymentBody.replaceChildren();

    const term = ($("payment-search")?.value || "").trim().toLowerCase();
    const statusFilter = $("payment-status-filter")?.value || "all";

    const visible = payments.filter((payment) => {
      const searchable = [
        payment.studentName,
        payment.transactionReference,
        payment.feeType,
        payment.status
      ].join(" ").toLowerCase();

      return searchable.includes(term) &&
        (statusFilter === "all" || payment.status === statusFilter);
    }).sort((a, b) => dateValue(b.createdAt) - dateValue(a.createdAt));

    if (!visible.length) {
      const row = document.createElement("tr");
      const cell = makeCell("No matching transactions.");
      cell.colSpan = 7;
      row.appendChild(cell);
      paymentBody.appendChild(row);
      return;
    }

    visible.forEach((payment) => {
      const row = document.createElement("tr");

      [
        formatDate(payment.createdAt),
        payment.studentName || "—",
        payment.feeType || "—",
        installmentLabel(payment),
        money(payment.amount),
        payment.transactionReference || "—",
        payment.status || "pending"
      ].forEach((value) => row.appendChild(makeCell(value)));

      paymentBody.appendChild(row);
    });
  }

  async function reviewPayment(paymentId, nextStatus) {
    if (busy || !["approved", "rejected"].includes(nextStatus)) return;

    const payment = payments.find((item) => item.id === paymentId);
    if (!payment || payment.status !== "pending") return;

    if (
      nextStatus === "approved" &&
      !confirm("Confirm you verified this payment in your bank/UPI account?")
    ) {
      return;
    }

    setBusy(true);

    try {
      const fee = fees.find((item) => item.id === payment.feeId);

      if (!fee) {
        throw new Error("The fee record linked to this payment was not found.");
      }

      const paymentRef = doc(db, "paymentSubmissions", paymentId);
      const feeRef = doc(db, "fees", fee.id);

      if (nextStatus === "rejected") {
        await updateDoc(paymentRef, {
          status: "rejected",
          reviewedBy: adminUid,
          reviewedAt: serverTimestamp()
        });
      } else {
        const amount = Number(payment.amount);
        const currentPaid = Number(fee.amountPaid) || 0;
        const total = Number(fee.amount) || 0;

        if (!Number.isFinite(amount) || amount <= 0 || currentPaid + amount > total) {
          throw new Error("This payment would exceed the fee balance.");
        }

        const feeUpdate = {
          amountPaid: Math.round((currentPaid + amount) * 100) / 100,
          status: currentPaid + amount >= total ? "paid" : "partial",
          updatedAt: serverTimestamp()
        };

        if (fee.paymentPlan === "installments" && payment.installmentNumber) {
          const installments = Array.isArray(fee.installments)
            ? fee.installments.map((item) => ({ ...item }))
            : [];

          const index = installments.findIndex(
            (item) => Number(item.number) === Number(payment.installmentNumber)
          );

          if (index < 0) {
            throw new Error("The installment linked to this payment was not found.");
          }

          const installment = installments[index];
          const installmentPaid = Number(installment.amountPaid) || 0;
          const installmentTotal = Number(installment.amount) || 0;

          if (installmentPaid + amount > installmentTotal) {
            throw new Error("This payment would exceed the installment balance.");
          }

          installments[index].amountPaid =
            Math.round((installmentPaid + amount) * 100) / 100;

          installments[index].status =
            installments[index].amountPaid >= installmentTotal
              ? "paid"
              : "partial";

          feeUpdate.installments = installments;
        }

        const batch = writeBatch(db);

        batch.update(paymentRef, {
          status: "approved",
          reviewedBy: adminUid,
          reviewedAt: serverTimestamp()
        });

        batch.update(feeRef, feeUpdate);
        await batch.commit();
      }

      await Promise.all([loadFees(), loadPayments()]);
      showMessage(`Payment ${nextStatus}.`, "success");
    } catch (error) {
      console.error("Payment review failed:", error);
      showMessage(error.message || "Could not review this payment.", "error");
    } finally {
      setBusy(false);
    }
  }

  document.addEventListener("click", (event) => {
    const button = event.target.closest('[data-fees-action="review-payment"]');
    if (!button) return;

    reviewPayment(button.dataset.paymentId, button.dataset.nextStatus);
  });

  // ---------------- EVENTS AND AUTH ----------------

  assignmentForm?.addEventListener("submit", assignFees);
  assignmentMode?.addEventListener("change", updateModeVisibility);
  groupSelect?.addEventListener("change", renderGroupAmounts);
  paymentPlan?.addEventListener("change", updatePlanVisibility);

  [
    "fee-individual-amount",
    "fee-installment-count",
    "fee-installment-frequency",
    "fee-first-installment-date",
    "fee-due-date"
  ].forEach((id) => {
    $(id)?.addEventListener("input", renderSchedulePreview);
    $(id)?.addEventListener("change", renderSchedulePreview);
  });

  $("fee-record-student-filter")?.addEventListener("change", renderFees);
  $("fee-record-search")?.addEventListener("input", renderFees);
  $("fee-record-status")?.addEventListener("change", renderFees);
  $("payment-search")?.addEventListener("input", renderPayments);
  $("payment-status-filter")?.addEventListener("change", renderPayments);

  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      showMessage("Sign in as an active academy administrator.", "error");
      return;
    }

    try {
      const profileSnapshot = await getDoc(doc(db, "users", user.uid));

      if (!profileSnapshot.exists()) {
        throw new Error("User profile not found.");
      }

      const profile = profileSnapshot.data();

      if (
        profile.role !== "admin" ||
        profile.isActive !== true ||
        !profile.academyId
      ) {
        throw new Error("An active academy administrator account is required.");
      }

      adminUid = user.uid;
      academyId = profile.academyId;

      await Promise.all([loadStudents(), loadFees(), loadPayments()]);

      updateModeVisibility();
      updatePlanVisibility();
      renderGroupAmounts();
      activateTab("panel-assign");

      showMessage("Fee records and payment submissions loaded from Firebase.");
    } catch (error) {
      console.error("Fees page initialization failed:", error);
      showMessage(
        error.code === "permission-denied"
          ? "Firestore denied access. Check users, fees and paymentSubmissions rules."
          : error.message || "Could not load the Fees page.",
        "error"
      );
    }
  });
})();