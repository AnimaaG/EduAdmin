
/**
 * EduAdmin - Admin Study Materials
 *
 * Frontend validation only.
 * Materials are not saved or published until backend storage is connected.
 */

(() => {
  "use strict";

  const form = document.getElementById("material-form");
  const formSection = document.getElementById("material-form-section");
  const addButton = document.getElementById("add-material-button");
  const cancelButton = document.getElementById("cancel-material-button");
  const message = document.getElementById("materials-message");

  const accessSelect = document.getElementById("material-access");
  const priceGroup = document.getElementById("material-price-group");
  const priceInput = document.getElementById("material-price");
  const searchInput = document.getElementById("material-search");
  const accessFilter = document.getElementById("material-access-filter");
  const tableBody = document.getElementById("materials-table-body");
  const saveButton = document.getElementById("save-material-button");

  if (!form || !formSection || !addButton || !cancelButton) {
    console.error("EduAdmin: Study Materials page elements were not found.");
    return;
  }

  function showMessage(text, type = "info") {
    if (!message) return;

    message.textContent = text;
    message.hidden = false;
    message.className = `form-message ${type}`;
    message.setAttribute("role", type === "error" ? "alert" : "status");
  }

  function hideMessage() {
    if (!message) return;

    message.textContent = "";
    message.hidden = true;
  }

  function updatePriceField() {
    const isPaid = accessSelect.value === "paid";

    priceGroup.hidden = !isPaid;
    priceInput.required = isPaid;

    if (!isPaid) {
      priceInput.value = "";
    }
  }

  function openForm() {
    formSection.hidden = false;
    hideMessage();

    const titleInput = document.getElementById("material-title");
    if (titleInput) titleInput.focus();

    formSection.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  }

  function closeForm() {
    form.reset();
    updatePriceField();
    hideMessage();
    formSection.hidden = true;
  }

  function renderEmptyState(text) {
    if (!tableBody) return;

    tableBody.replaceChildren();

    const row = document.createElement("tr");
    const cell = document.createElement("td");

    cell.colSpan = 6;
    cell.className = "empty-state";

    const heading = document.createElement("strong");
    heading.textContent = text;

    const description = document.createElement("p");
    description.textContent =
      "Material records will appear here after backend storage is connected.";

    cell.append(heading, description);
    row.appendChild(cell);
    tableBody.appendChild(row);
  }

  function filterMaterials() {
    // No records are fabricated or stored in this frontend-only version.
    const query = searchInput ? searchInput.value.trim() : "";
    const access = accessFilter ? accessFilter.value : "all";

    if (query || access !== "all") {
      renderEmptyState(
        "No matching material records are available"
      );
    } else {
      renderEmptyState("No material records loaded");
    }
  }

  addButton.addEventListener("click", openForm);
  cancelButton.addEventListener("click", closeForm);

  if (accessSelect) {
    accessSelect.addEventListener("change", updatePriceField);
  }

  if (searchInput) {
    searchInput.addEventListener("input", filterMaterials);
  }

  if (accessFilter) {
    accessFilter.addEventListener("change", filterMaterials);
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    hideMessage();

    if (!form.reportValidity()) {
      return;
    }

    const title = document.getElementById("material-title").value.trim();
    const subject = document.getElementById("material-subject").value.trim();
    const className = document.getElementById("material-class").value.trim();
    const type = document.getElementById("material-type").value;
    const access = accessSelect.value;
    const price = Number(priceInput.value);
    const resourceUrl = document
      .getElementById("material-resource-url")
      .value.trim();

    if (!title || !subject || !className || !type) {
      showMessage("Please complete all required fields.", "error");
      return;
    }

    if (access === "paid" && (!Number.isFinite(price) || price <= 0)) {
      showMessage("Enter a valid price for this paid material.", "error");
      priceInput.focus();
      return;
    }

    if (resourceUrl) {
      try {
        const parsedUrl = new URL(resourceUrl);

        if (!["http:", "https:"].includes(parsedUrl.protocol)) {
          throw new Error("Unsupported URL protocol");
        }
      } catch {
        showMessage("Enter a valid HTTP or HTTPS resource URL.", "error");
        document.getElementById("material-resource-url").focus();
        return;
      }
    }

    showMessage(
      "Validation complete. This material has NOT been saved or published because backend storage is not connected. Paid materials must remain locked until an admin verifies the UPI payment.",
      "info"
    );

    if (saveButton) {
      saveButton.textContent = "Validation Complete";
    }
  });

  updatePriceField();
  renderEmptyState("No material records loaded");
})();
