/* =========================================================
   EduAdmin — Live Admin Notifications
   File: js/admin-notifications.js
   ========================================================= */

(() => {
  "use strict";

  const firebaseConfigUrl = new URL("./firebase-config.js", document.currentScript.src);

  const $ = (id) => document.getElementById(id);

  const searchInput = $("notification-search");
  const typeFilter = $("notification-type-filter");
  const statusFilter = $("notification-status-filter");
  const tableBody = $("notifications-table-body");
  const deliveryForm = $("notification-delivery-form");
  const messageBox = $("notifications-message");
  const markAllReadButton = $("mark-all-read-button");

  const unreadCount = $("unread-notifications-count");
  const paymentCount = $("pending-payment-alerts-count");
  const systemCount = $("system-alerts-count");

  if (!tableBody) {
    console.error("EduAdmin: Notifications table was not found.");
    return;
  }

  let db;
  let notifications = [];
  let stopNotifications = null;
  let busy = false;

  function showMessage(text, type = "info") {
    if (!messageBox) return;

    messageBox.textContent = text;
    messageBox.hidden = false;
    messageBox.className = `form-message ${type}`;
    messageBox.setAttribute(
      "role",
      type === "error" ? "alert" : "status"
    );
  }

  function setText(element, value) {
    if (element) element.textContent = String(value);
  }

  function normaliseType(type) {
    const value = String(type || "system").toLowerCase();

    if (["payment", "material", "system"].includes(value)) {
      return value;
    }

    return "system";
  }

  function notificationDate(item) {
    const value = item.createdAt;

    if (value && typeof value.toDate === "function") {
      return value.toDate();
    }

    if (value instanceof Date) return value;

    if (typeof value === "string" || typeof value === "number") {
      const parsed = new Date(value);
      if (!Number.isNaN(parsed.getTime())) return parsed;
    }

    return null;
  }

  function formatDate(item) {
    const date = notificationDate(item);

    if (!date) return "Just now";

    return new Intl.DateTimeFormat("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    }).format(date);
  }

  function isUnread(item) {
    return item.read !== true && item.isRead !== true;
  }

  function notificationTitle(item) {
    return item.title || item.heading || "Notification";
  }

  function notificationBody(item) {
    return item.message || item.description || item.body || "";
  }

  function makeElement(tag, className, text) {
    const element = document.createElement(tag);

    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;

    return element;
  }

  function renderEmptyState(text) {
    tableBody.replaceChildren();

    const row = document.createElement("tr");
    const cell = makeElement("td", "empty-state");
    const heading = makeElement("strong", "", text);
    const description = makeElement(
      "p",
      "",
      "New notifications will appear here automatically."
    );

    cell.colSpan = 5;
    cell.append(heading, description);
    row.appendChild(cell);
    tableBody.appendChild(row);
  }

  function updateOverview() {
    const unread = notifications.filter(isUnread);

    setText(unreadCount, unread.length);

    setText(
      paymentCount,
      unread.filter((item) =>
        normaliseType(item.type) === "payment" &&
        item.status !== "resolved"
      ).length
    );

    setText(
      systemCount,
      unread.filter((item) =>
        normaliseType(item.type) === "system"
      ).length
    );

    if (markAllReadButton) {
      markAllReadButton.disabled = busy || unread.length === 0;
    }

    document.dispatchEvent(
      new CustomEvent("eduadmin:notifications-updated", {
        detail: {
          total: notifications.length,
          unread: unread.length
        }
      })
    );
  }

  function getFilteredNotifications() {
    const search = (searchInput?.value || "").trim().toLowerCase();
    const type = typeFilter?.value || "all";
    const status = statusFilter?.value || "all";

    return notifications.filter((item) => {
      const searchable = [
        notificationTitle(item),
        notificationBody(item),
        item.type,
        item.link
      ].join(" ").toLowerCase();

      if (search && !searchable.includes(search)) return false;

      if (type !== "all" && normaliseType(item.type) !== type) {
        return false;
      }

      if (status === "unread" && !isUnread(item)) return false;
      if (status === "read" && isUnread(item)) return false;

      return true;
    });
  }

  async function markRead(id) {
    if (!db || busy) return;

    const { doc, updateDoc, serverTimestamp } =
      await import("https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js");

    try {
      await updateDoc(doc(db, "notifications", id), {
        read: true,
        isRead: true,
        readAt: serverTimestamp()
      });
    } catch (error) {
      console.error("EduAdmin: Could not mark notification as read.", error);
      showMessage(
        "Could not mark this notification as read. Check Firestore permissions.",
        "error"
      );
    }
  }

  function safeInternalLink(path) {
    if (typeof path !== "string" || !path.trim()) return null;

    const cleaned = path.trim();

    // Only allow local admin-page links, not arbitrary external URLs.
    if (
      cleaned.startsWith("https:") ||
      cleaned.startsWith("http:") ||
      cleaned.startsWith("//") ||
      cleaned.startsWith("javascript:")
    ) {
      return null;
    }

    return cleaned;
  }

  function renderNotifications() {
    const items = getFilteredNotifications();

    tableBody.replaceChildren();

    if (!items.length) {
      renderEmptyState(
        notifications.length
          ? "No notifications match these filters"
          : "No notifications yet"
      );
      return;
    }

    items.forEach((item) => {
      const row = document.createElement("tr");

      if (isUnread(item)) row.classList.add("notification-unread-row");

      const titleCell = document.createElement("td");
      const title = makeElement("strong", "", notificationTitle(item));
      const body = makeElement("p", "", notificationBody(item));
      body.style.margin = "5px 0 0";
      titleCell.append(title, body);

      const typeCell = document.createElement("td");
      const type = normaliseType(item.type);
      const typeBadge = makeElement(
        "span",
        "ui-tag",
        type.charAt(0).toUpperCase() + type.slice(1)
      );
      typeCell.appendChild(typeBadge);

      const dateCell = makeElement("td", "", formatDate(item));

      const statusCell = document.createElement("td");
      const statusBadge = makeElement(
        "span",
        "ui-tag",
        isUnread(item) ? "Unread" : "Read"
      );
      statusCell.appendChild(statusBadge);

      const actionCell = document.createElement("td");
      const actionWrap = document.createElement("div");
      actionWrap.style.display = "flex";
      actionWrap.style.flexWrap = "wrap";
      actionWrap.style.gap = "8px";

      if (isUnread(item)) {
        const readButton = makeElement(
          "button",
          "btn btn-secondary",
          "Mark read"
        );

        readButton.type = "button";
        readButton.addEventListener("click", () => markRead(item.id));
        actionWrap.appendChild(readButton);
      }

      const link = safeInternalLink(item.link || item.actionUrl);

      if (link) {
        const openLink = makeElement("a", "btn btn-secondary", "Open");
        openLink.href = link;
        actionWrap.appendChild(openLink);
      }

      if (!actionWrap.children.length) {
        actionWrap.appendChild(makeElement("span", "", "—"));
      }

      actionCell.appendChild(actionWrap);
      row.append(titleCell, typeCell, dateCell, statusCell, actionCell);
      tableBody.appendChild(row);
    });
  }

  function refreshUI() {
    updateOverview();
    renderNotifications();
  }

 async function startLiveNotifications() {
  try {
    const config = await import(firebaseConfigUrl.href);

    if (!config.db || !config.auth) {
      throw new Error(
        "firebase-config.js must export db and auth."
      );
    }

    db = config.db;

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

    // Wait for Firebase authentication to resolve.
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
      throw new Error("You must sign in to view notifications.");
    }

    // Load the signed-in user's profile.
    const profileSnapshot = await getDoc(
      doc(db, "users", user.uid)
    );

    if (!profileSnapshot.exists()) {
      throw new Error("The user profile does not exist.");
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

    // Only subscribe to notifications for this academy.
    const notificationQuery = query(
      collection(db, "notifications"),
      where("academyId", "==", profile.academyId),
      where("recipientRole", "==", "admin")
    );

    stopNotifications = onSnapshot(
      notificationQuery,
      (snapshot) => {
        notifications = snapshot.docs.map((document) => ({
          id: document.id,
          ...document.data()
        }));

        notifications.sort((a, b) => {
          const dateA =
            notificationDate(a)?.getTime() || 0;

          const dateB =
            notificationDate(b)?.getTime() || 0;

          return dateB - dateA;
        });

        refreshUI();
      },
      (error) => {
        console.error(
          "EduAdmin: Live notification listener failed.",
          error
        );

        showMessage(
          "Could not load notifications. Check Firestore rules and notification data.",
          "error"
        );

        renderEmptyState("Could not load notifications");
      }
    );
  } catch (error) {
    console.error(
      "EduAdmin: Notification setup failed.",
      error
    );

    showMessage(
      error.message ||
        "Could not connect to the notification service.",
      "error"
    );

    renderEmptyState(
      "Notifications could not be connected"
    );
  }
}

  async function markAllRead() {
    if (!db || busy) return;

    const unread = notifications.filter(isUnread);
    if (!unread.length) return;

    busy = true;
    updateOverview();

    try {
      const {
        doc,
        writeBatch,
        serverTimestamp
      } = await import(
        "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js"
      );

      // Firestore batches are limited to 500 write operations.
      for (let start = 0; start < unread.length; start += 450) {
        const batch = writeBatch(db);
        const chunk = unread.slice(start, start + 450);

        chunk.forEach((item) => {
          batch.update(doc(db, "notifications", item.id), {
            read: true,
            isRead: true,
            readAt: serverTimestamp()
          });
        });

        await batch.commit();
      }

      showMessage("All notifications marked as read.", "success");
    } catch (error) {
      console.error("EduAdmin: Mark-all-read failed.", error);
      showMessage(
        "Could not mark all notifications as read. Check Firestore permissions.",
        "error"
      );
    } finally {
      busy = false;
      updateOverview();
    }
  }

  searchInput?.addEventListener("input", renderNotifications);
  typeFilter?.addEventListener("change", renderNotifications);
  statusFilter?.addEventListener("change", renderNotifications);

  markAllReadButton?.addEventListener("click", markAllRead);

  // Keep the existing delivery form, but do not falsely claim it sends alerts.
  if (deliveryForm) {
    deliveryForm.addEventListener("submit", (event) => {
      event.preventDefault();

      if (!deliveryForm.reportValidity()) return;

      const inApp = $("delivery-in-app")?.checked;
      const browserPush = $("delivery-browser-push")?.checked;
      const email = $("delivery-email")?.checked;

      if (!inApp && !browserPush && !email) {
        showMessage(
          "Select at least one notification delivery channel.",
          "error"
        );
        return;
      }

      showMessage(
        "Delivery preferences are not saved. Browser push and email require separate delivery-service configuration.",
        "info"
      );
    });
  }

  window.addEventListener("beforeunload", () => {
    if (typeof stopNotifications === "function") {
      stopNotifications();
    }
  });

  renderEmptyState("Connecting to live notifications…");
  startLiveNotifications();
})();