
import { auth, db } from "./firebase-config.js";

import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  addDoc,
  updateDoc,
  writeBatch,
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
  const paymentBody = $("payment-approvals-table-body");
  const feeBody = $("fee-records-table-body");
  const message = $("fees-message");

  function showMessage(text, type = "info") {
    if (!message) return;
    message.textContent = text;
    message.className = `form-message ${type}`;
    message.hidden = false;
    message.setAttribute("role", type === "error" ? "alert" : "status");
  }

  function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;",
      '"': "&quot;", "'": "&#39;"
    })[char]);
  }

  function money(value) {
    return currency.format(Number(value) || 0);
  }

  function studentName(student) {
    return student.fullName || student.name || student.email || student.id;
  }

  function setBusy(value) {
    busy = value;
    document.querySelectorAll("[data-fees-action], #fee-assignment-form button")
      .forEach((button) => {
        button.disabled = value;
      });
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

  function renderGroupAmounts() {
    if (!groupAmounts) return;

    const selectedIds = Array.from(groupSelect.selectedOptions)
      .map((option) => option.value)
      .filter(Boolean);

    const previous = new Map(
      Array.from(groupAmounts.querySelectorAll("[data-student-amount]"))
        .map((input) => [input.dataset.studentAmount, input.value])
    );

    groupAmounts.replaceChildren();

    if (!selectedIds.length) {
      groupAmounts.textContent = "Select students to enter their individual amounts.";
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
      input.value = previous.get(id) || $("fee-common-amount")?.value || "";
      label.htmlFor = `group-amount-${id}`;
      input.id = `group-amount-${id}`;

      row.append(label, input);
      groupAmounts.appendChild(row);
    });
  }

  function updateModeVisibility() {
    const mode = assignmentMode?.value || "individual";
    const individual = $("individual-fee-fields");
    const group = $("group-fee-fields");

    if (individual) individual.hidden = mode !== "individual";
    if (group) group.hidden = mode !== "group";
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
    })).sort((a, b) =>
      studentName(a).localeCompare(studentName(b))
    );

    setSelectOptions(studentSelect, students, "Choose a student");
    setSelectOptions(groupSelect, students, "Choose students");
    renderGroupAmounts();
  }

  async function loadFees() {
    const q = query(
      collection(db, "fees"),
      where("academyId", "==", academyId)
    );

    const snapshot = await getDocs(q);
    fees = snapshot.docs.map((item) => ({
      id: item.id,
      ...item.data()
    }));

    renderFees();
    updateSummary();
  }

  async function loadPayments() {
    const q = query(
      collection(db, "paymentSubmissions"),
      where("academyId", "==", academyId)
    );

    const snapshot = await getDocs(q);
    payments = snapshot.docs.map((item) => ({
      id: item.id,
      ...item.data()
    }));

    renderPayments();
    updateSummary();
  }

  function updateSummary() {
    const totalAssigned = fees.reduce((sum, fee) =>
      sum + (Number(fee.amount) || 0), 0);

    const totalPaid = fees.reduce((sum, fee) =>
      sum + (Number(fee.amountPaid) || 0), 0);

    const pending = payments.filter((item) => item.status === "pending").length;
    const rejected = payments.filter((item) => item.status === "rejected").length;

    if ($("total-fees-assigned")) $("total-fees-assigned").textContent = money(totalAssigned);
    if ($("total-fees-collected")) $("total-fees-collected").textContent = money(totalPaid);
    if ($("total-fees-outstanding")) {
      $("total-fees-outstanding").textContent = money(
        Math.max(0, totalAssigned - totalPaid)
      );
    }
    if ($("pending-approvals-count")) {
      $("pending-approvals-count").textContent = String(pending);
    }
    if ($("rejected-payments-count")) {
      $("rejected-payments-count").textContent = String(rejected);
    }
  }

  function renderFees() {
    if (!feeBody) return;
    feeBody.replaceChildren();

    const term = ($("fee-record-search")?.value || "").trim().toLowerCase();
    const statusFilter = $("fee-record-status")?.value || "all";

    const visible = fees.filter((fee) => {
      const text = [
        fee.studentName, fee.feeType, fee.description, fee.status
      ].join(" ").toLowerCase();

      return text.includes(term) &&
        (statusFilter === "all" || fee.status === statusFilter);
    });

    if (!visible.length) {
      feeBody.innerHTML = `<tr><td colspan="7">No matching fee records.</td></tr>`;
      return;
    }

    visible.sort((a, b) =>
      String(a.studentName || "").localeCompare(String(b.studentName || ""))
    );

    visible.forEach((fee) => {
      const tr = document.createElement("tr");
      const balance = Math.max(0, Number(fee.amount || 0) - Number(fee.amountPaid || 0));

      [
        fee.studentName || "—",
        fee.feeType || "General",
        money(fee.amount),
        money(fee.amountPaid),
        money(balance),
        fee.dueDate || "—",
        fee.status || "pending"
      ].forEach((value) => {
        const td = document.createElement("td");
        td.textContent = String(value);
        tr.appendChild(td);
      });

      feeBody.appendChild(tr);
    });
  }

  function renderPayments() {
    if (!paymentBody) return;
    paymentBody.replaceChildren();

    const term = ($("payment-search")?.value || "").trim().toLowerCase();
    const status = $("payment-status-filter")?.value || "all";

    const visible = payments.filter((payment) => {
      const text = [
        payment.studentName, payment.transactionReference,
        payment.feeType, payment.status
      ].join(" ").toLowerCase();

      return text.includes(term) &&
        (status === "all" || payment.status === status);
    });

    if (!visible.length) {
      paymentBody.innerHTML = `<tr><td colspan="7">No matching payment submissions.</td></tr>`;
      return;
    }

    visible.forEach((payment) => {
      const tr = document.createElement("tr");
      const submitted = payment.createdAt?.toDate
        ? payment.createdAt.toDate().toLocaleString("en-IN")
        : "—";

      [
        payment.studentName || "—",
        payment.feeType || "—",
        money(payment.amount),
        payment.transactionReference || "—",
        submitted,
        payment.status || "pending"
      ].forEach((value) => {
        const td = document.createElement("td");
        td.textContent = String(value);
        tr.appendChild(td);
      });

      const actionCell = document.createElement("td");

      if (payment.status === "pending") {
        ["approved", "rejected"].forEach((nextStatus) => {
          const button = document.createElement("button");
          button.type = "button";
          button.className = "btn btn-secondary";
          button.textContent = nextStatus === "approved" ? "Approve" : "Reject";
          button.dataset.feesAction = "review-payment";
          button.dataset.paymentId = payment.id;
          button.dataset.nextStatus = nextStatus;
          actionCell.appendChild(button);
        });
      } else {
        actionCell.textContent = "Reviewed";
      }

      tr.appendChild(actionCell);
      paymentBody.appendChild(tr);
    });
  }

  function buildFeePayload(student, amount, feeType, description, dueDate) {
    return {
      academyId,
      studentId: student.id,
      studentName: studentName(student),
      feeType,
      description,
      amount,
      amountPaid: 0,
      dueDate,
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
      showMessage("Enter a fee type and due date.", "error");
      return;
    }

    let assignments = [];

    if (mode === "individual") {
      const student = students.find((item) => item.id === studentSelect.value);
      const amount = Number($("fee-individual-amount").value);

      if (!student || !Number.isFinite(amount) || amount <= 0) {
        showMessage("Choose a student and enter an amount greater than zero.", "error");
        return;
      }

      assignments = [{ student, amount }];
    } else {
      const selectedIds = Array.from(groupSelect.selectedOptions)
        .map((option) => option.value)
        .filter(Boolean);

      const amountInputs = Array.from(
        groupAmounts.querySelectorAll("[data-student-amount]")
      );

      if (!selectedIds.length) {
        showMessage("Select at least one student.", "error");
        return;
      }

      assignments = selectedIds.map((id) => {
        const student = students.find((item) => item.id === id);
        const input = amountInputs.find((item) => item.dataset.studentAmount === id);
        return { student, amount: Number(input?.value) };
      });

      if (assignments.some((item) =>
        !item.student || !Number.isFinite(item.amount) || item.amount <= 0
      )) {
        showMessage("Enter a valid positive amount for every selected student.", "error");
        return;
      }
    }

    setBusy(true);

    try {
      const batch = writeBatch(db);

      assignments.forEach(({ student, amount }) => {
        const feeRef = doc(collection(db, "fees"));
        batch.set(feeRef, buildFeePayload(
          student, amount, feeType, description, dueDate
        ));
      });

      await batch.commit();
      assignmentForm.reset();
      updateModeVisibility();
      renderGroupAmounts();
      await loadFees();

      showMessage(
        `${assignments.length} individual fee record(s) created successfully.`,
        "success"
      );
    } catch (error) {
      console.error("Fee assignment failed:", error);
      showMessage(
        error.code === "permission-denied"
          ? "Permission denied. Add the fees collection rules before assigning fees."
          : "Could not assign fees. Check the browser console and try again.",
        "error"
      );
    } finally {
      setBusy(false);
    }
  }

  async function reviewPayment(paymentId, nextStatus) {
    if (busy || !["approved", "rejected"].includes(nextStatus)) return;

    const payment = payments.find((item) => item.id === paymentId);
    if (!payment || payment.status !== "pending") return;

    if (nextStatus === "approved" &&
        !confirm("Confirm you verified this payment in your bank/UPI account?")) {
      return;
    }

    setBusy(true);

    try {
      const fee = fees.find((item) => item.id === payment.feeId);
      if (!fee) throw new Error("The fee record linked to this payment was not found.");

      if (nextStatus === "approved") {
        const amount = Number(payment.amount);
        const currentPaid = Number(fee.amountPaid) || 0;
        const total = Number(fee.amount) || 0;

        if (!Number.isFinite(amount) || amount <= 0 || currentPaid + amount > total) {
          throw new Error("This payment would exceed the fee balance.");
        }

        const newPaid = currentPaid + amount;
        const newFeeStatus = newPaid >= total ? "paid" : "partial";

        const batch = writeBatch(db);

        batch.update(doc(db, "paymentSubmissions", paymentId), {
          status: "approved",
          reviewedBy: adminUid,
          reviewedAt: serverTimestamp()
        });

        batch.update(doc(db, "fees", fee.id), {
          amountPaid: newPaid,
          status: newFeeStatus,
          updatedAt: serverTimestamp()
        });

        await batch.commit();
      } else {
        await updateDoc(doc(db, "paymentSubmissions", paymentId), {
          status: "rejected",
          reviewedBy: adminUid,
          reviewedAt: serverTimestamp()
        });
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

  async function saveUpiSettings(event) {
    event.preventDefault();

    const form = $("upi-settings-form");
    const upiId = $("upi-id").value.trim();
    const payeeName = $("upi-payee-name").value.trim();

    if (!upiId || !/^[\w.-]+@[\w.-]+$/.test(upiId)) {
      showMessage("Enter a valid UPI ID, for example yourname@bank.", "error");
      return;
    }

    if (!payeeName) {
      showMessage("Enter the payee name.", "error");
      return;
    }

    setBusy(true);

    try {
      const academyRef = doc(db, "academies", academyId);
      const academySnapshot = await getDoc(academyRef);
      if (!academySnapshot.exists()) throw new Error("Academy record not found.");

      const oldSettings = academySnapshot.data().settings || {};

      await updateDoc(academyRef, {
        settings: {
          ...oldSettings,
          payment: { upiId, payeeName }
        },
        updatedAt: serverTimestamp()
      });

      showMessage("UPI payment settings saved.", "success");
    } catch (error) {
      console.error("UPI settings save failed:", error);
      showMessage(
        error.code === "permission-denied"
          ? "Permission denied. Check the academy update rules."
          : "Could not save UPI settings.",
        "error"
      );
    } finally {
      setBusy(false);
    }
  }

  async function loadUpiSettings() {
    const snapshot = await getDoc(doc(db, "academies", academyId));
    if (!snapshot.exists()) return;

    const payment = snapshot.data().settings?.payment || {};
    $("upi-id").value = payment.upiId || "";
    $("upi-payee-name").value = payment.payeeName || "";
  }

  document.addEventListener("click", (event) => {
    const button = event.target.closest('[data-fees-action="review-payment"]');
    if (!button) return;
    reviewPayment(button.dataset.paymentId, button.dataset.nextStatus);
  });

  assignmentForm?.addEventListener("submit", assignFees);
  assignmentMode?.addEventListener("change", updateModeVisibility);
  groupSelect?.addEventListener("change", renderGroupAmounts);
  $("fee-common-amount")?.addEventListener("input", renderGroupAmounts);
  $("fee-record-search")?.addEventListener("input", renderFees);
  $("fee-record-status")?.addEventListener("change", renderFees);
  $("payment-search")?.addEventListener("input", renderPayments);
  $("payment-status-filter")?.addEventListener("change", renderPayments);
  $("upi-settings-form")?.addEventListener("submit", saveUpiSettings);

  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      showMessage("Sign in as an active academy administrator.", "error");
      return;
    }

    try {
      const profileSnapshot = await getDoc(doc(db, "users", user.uid));
      if (!profileSnapshot.exists()) throw new Error("User profile not found.");

      const profile = profileSnapshot.data();
      if (profile.role !== "admin" || profile.isActive !== true || !profile.academyId) {
        throw new Error("An active academy administrator account is required.");
      }

      adminUid = user.uid;
      academyId = profile.academyId;

      await Promise.all([loadStudents(), loadFees(), loadPayments(), loadUpiSettings()]);
      updateModeVisibility();
      renderGroupAmounts();
      showMessage("Fee records loaded from Firebase.", "info");
    } catch (error) {
      console.error("Fees page initialization failed:", error);
      showMessage(
        error.code === "permission-denied"
          ? "Firestore denied access. Check the users, fees, paymentSubmissions and academy rules."
          : error.message || "Could not load the Fees page.",
        "error"
      );
    }
  });
})();
