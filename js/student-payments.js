document.addEventListener("DOMContentLoaded", () => {
  const searchInput = document.getElementById("student-payment-search");
  const statusFilter = document.getElementById("student-payment-status-filter");
  const tableBody = document.getElementById("student-payments-table-body");
  const paymentForm = document.getElementById("student-payment-form");
  const message = document.getElementById("student-payment-message");

  if (!searchInput || !statusFilter || !tableBody) {
    return;
  }

  // No payment records are loaded until a backend is connected.
  const paymentRecords = [];

  function showMessage(text, type = "info") {
    if (!message) return;

    message.textContent = text;
    message.dataset.type = type;
  }

  function renderPayments() {
    const searchTerm = searchInput.value.trim().toLowerCase();
    const selectedStatus = statusFilter.value.toLowerCase();

    const filteredPayments = paymentRecords.filter((payment) => {
      const searchableText = [
        payment.date,
        payment.description,
        payment.reference,
        payment.status
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      const matchesSearch = searchableText.includes(searchTerm);
      const matchesStatus =
        !selectedStatus ||
        String(payment.status).toLowerCase() === selectedStatus;

      return matchesSearch && matchesStatus;
    });

    tableBody.replaceChildren();

    if (filteredPayments.length === 0) {
      const row = document.createElement("tr");
      const cell = document.createElement("td");
      const emptyState = document.createElement("div");
      const heading = document.createElement("h3");
      const description = document.createElement("p");

      cell.colSpan = 5;
      emptyState.className = "empty-state";

      heading.textContent = "No payment records available";
      description.textContent =
        paymentRecords.length === 0
          ? "Payment history will appear here when records are connected."
          : "No payments match the selected search or status filter.";

      emptyState.append(heading, description);
      cell.appendChild(emptyState);
      row.appendChild(cell);
      tableBody.appendChild(row);
      return;
    }

    filteredPayments.forEach((payment) => {
      const row = document.createElement("tr");

      const values = [
        payment.date || "—",
        payment.description || "—",
        formatAmount(payment.amount),
        payment.reference || "—",
        formatStatus(payment.status)
      ];

      values.forEach((value) => {
        const cell = document.createElement("td");
        cell.textContent = value;
        row.appendChild(cell);
      });

      tableBody.appendChild(row);
    });
  }

  function formatAmount(amount) {
    const numericAmount = Number(amount);

    if (amount === undefined || amount === null || amount === "") {
      return "—";
    }

    if (!Number.isFinite(numericAmount)) {
      return "—";
    }

    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 2
    }).format(numericAmount);
  }

  function formatStatus(status) {
    const labels = {
      pending: "Pending review",
      approved: "Approved",
      rejected: "Rejected"
    };

    return labels[String(status || "").toLowerCase()] || "Unknown";
  }

  searchInput.addEventListener("input", renderPayments);
  statusFilter.addEventListener("change", renderPayments);

  if (paymentForm) {
    paymentForm.addEventListener("submit", (event) => {
      event.preventDefault();

      showMessage(
        "Payment submission is unavailable until the payment backend is connected.",
        "info"
      );
    });
  }

  renderPayments();
});
