import { auth, db } from "./firebase-config.js";

import {
  collection,
  doc,
  getDocs,
  query,
  where,
  writeBatch,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

import { onAuthStateChanged, signOut } from
  "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";

const styles = `
  #registration-requests {
    margin: 24px 0;
    padding: 20px;
    border: 1px solid #e2e8f0;
    border-radius: 12px;
    background: #fff;
  }

  #registration-requests h2 {
    margin: 0 0 8px;
  }

  .registration-request {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 16px;
    padding: 16px 0;
    border-bottom: 1px solid #e2e8f0;
  }

  .registration-request:last-child {
    border-bottom: 0;
  }

  .registration-request p {
    margin: 5px 0;
    overflow-wrap: anywhere;
  }

  .registration-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .registration-actions button {
    padding: 9px 13px;
    border: 0;
    border-radius: 6px;
    cursor: pointer;
  }

  .registration-approve {
    background: #166534;
    color: #fff;
  }

  .registration-reject {
    background: #b91c1c;
    color: #fff;
  }

  .registration-actions button:disabled {
    opacity: 0.6;
    cursor: wait;
  }

  @media (max-width: 650px) {
    .registration-request {
      align-items: flex-start;
      flex-direction: column;
    }
  }
`;

function addStyles() {
  if (document.getElementById("registration-request-styles")) return;

  const style = document.createElement("style");
  style.id = "registration-request-styles";
  style.textContent = styles;
  document.head.appendChild(style);
}

function escapeHTML(value = "") {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

function showStatus(container, message, isError = false) {
  const status = container.querySelector("#registration-request-status");
  status.textContent = message;
  status.style.color = isError ? "#b91c1c" : "#166534";
}

function createSection() {
  let section = document.getElementById("registration-requests");

  if (section) return section;

  section = document.createElement("section");
  section.id = "registration-requests";
  section.innerHTML = `
    <h2>Registration Requests</h2>
    <p>Review requests for Student, Teacher, and Admin access.</p>
    <p id="registration-request-status" role="status" aria-live="polite">
      Loading requests...
    </p>
    <div id="registration-request-list"></div>
  `;

  const main = document.querySelector("main") ||
    document.querySelector(".dashboard-main") ||
    document.querySelector(".main-content") ||
    document.body;

  main.prepend(section);
  return section;
}

async function loadRequests(section) {
  const list = section.querySelector("#registration-request-list");

  try {
    const requestsQuery = query(
      collection(db, "registrationRequests"),
      where("status", "==", "pending")
    );

    const snapshot = await getDocs(requestsQuery);

    if (snapshot.empty) {
      list.replaceChildren();
      showStatus(section, "There are no pending registration requests.");
      return;
    }

    list.innerHTML = snapshot.docs.map((requestDoc) => {
      const request = requestDoc.data();

      return `
        <article class="registration-request"
          data-request-uid="${escapeHTML(requestDoc.id)}">
          <div>
            <strong>${escapeHTML(request.fullName || "Unnamed applicant")}</strong>
            <p>Email: ${escapeHTML(request.email || "Not provided")}</p>
            <p>Phone: ${escapeHTML(request.phone || "Not provided")}</p>
            <p>Requested role: ${escapeHTML(request.requestedRole || "Unknown")}</p>
            <p>Academy code: ${escapeHTML(request.academyCode || "Not provided")}</p>
          </div>
          <div class="registration-actions">
            <button type="button"
              class="registration-approve"
              data-action="approve">
              Approve
            </button>
            <button type="button"
              class="registration-reject"
              data-action="reject">
              Reject
            </button>
          </div>
        </article>
      `;
    }).join("");

    showStatus(section, `${snapshot.size} pending request(s).`);
  } catch (error) {
    console.error("Could not load registration requests:", error);
    showStatus(
      section,
      "Could not load requests. Check your Firestore rules and admin access.",
      true
    );
  }
}

async function reviewRequest(section, requestUid, decision, article) {
  const buttons = article.querySelectorAll("button");
  buttons.forEach((button) => {
    button.disabled = true;
  });

  try {
    const reviewer = auth.currentUser;

    if (!reviewer) {
      throw new Error("Your admin session has expired. Sign in again.");
    }

    const requestRef = doc(db, "registrationRequests", requestUid);
    const userRef = doc(db, "users", requestUid);

    // Re-read the request before acting so a stale screen cannot
    // silently approve or reject an already-reviewed request.
    const { getDoc } = await import(
      "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js"
    );

    const requestSnapshot = await getDoc(requestRef);

    if (!requestSnapshot.exists()) {
      throw new Error("This request no longer exists.");
    }

    const request = requestSnapshot.data();

    if (request.status !== "pending") {
      throw new Error("This request has already been reviewed.");
    }

    const allowedRoles = ["student", "teacher", "admin"];

    if (!allowedRoles.includes(request.requestedRole)) {
      throw new Error("The requested role is invalid.");
    }

    const batch = writeBatch(db);
    const reviewedAt = serverTimestamp();

    if (decision === "approve") {
      batch.update(userRef, {
        role: request.requestedRole,
        isActive: true,
        registrationStatus: "approved",
        reviewedBy: reviewer.uid,
        reviewedAt
      });

      batch.update(requestRef, {
        status: "approved",
        reviewedBy: reviewer.uid,
        reviewedAt
      });
    } else {
      batch.update(userRef, {
        registrationStatus: "rejected",
        reviewedBy: reviewer.uid,
        reviewedAt
      });

      batch.update(requestRef, {
        status: "rejected",
        reviewedBy: reviewer.uid,
        reviewedAt
      });
    }

    await batch.commit();

    showStatus(
      section,
      decision === "approve"
        ? "Request approved. The account is now active."
        : "Request rejected. The account remains inactive."
    );

    await loadRequests(section);
  } catch (error) {
    console.error("Could not review request:", error);
    showStatus(section, error.message || "Could not review this request.", true);

    buttons.forEach((button) => {
      button.disabled = false;
    });
  }
}

function initApprovalQueue() {
  addStyles();

  const section = createSection();
  const list = section.querySelector("#registration-request-list");

  list.addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;

    const article = button.closest("[data-request-uid]");
    if (!article) return;

    const decision = button.dataset.action;
    const uid = article.dataset.requestUid;

    if (decision === "reject" &&
        !window.confirm("Reject this registration request?")) {
      return;
    }

    await reviewRequest(section, uid, decision, article);
  });

  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      window.location.href = "../login.html";
      return;
    }

    try {
      const { getDoc } = await import(
        "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js"
      );

      const profile = await getDoc(doc(db, "users", user.uid));

      if (!profile.exists() ||
          profile.data().role !== "admin" ||
          profile.data().isActive !== true) {
        await signOut(auth);
        window.location.href = "../login.html";
        return;
      }

      await loadRequests(section);
    } catch (error) {
      console.error("Admin verification failed:", error);
      showStatus(
        section,
        "Could not verify administrator access. Check Firestore rules.",
        true
      );
    }
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initApprovalQueue, {
    once: true
  });
} else {
  initApprovalQueue();
}