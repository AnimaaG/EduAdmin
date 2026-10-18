
import { auth, db } from "./firebase-config.js";

import {
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";

import {
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

const STYLE_ID = "eduadmin-account-menu-styles";

function addAccountMenuStyles() {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .edu-account-menu {
      position: relative;
      margin-left: auto;
      flex-shrink: 0;
      z-index: 1000;
      font-family: inherit;
    }

    .edu-account-trigger {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px 12px;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      background: #ffffff;
      color: #172033;
      cursor: pointer;
      text-align: left;
      max-width: 260px;
    }

    .edu-account-avatar {
      display: grid;
      place-items: center;
      width: 38px;
      height: 38px;
      flex-shrink: 0;
      border-radius: 50%;
      background: #e8efff;
      color: #2449a5;
      font-weight: 700;
    }

    .edu-account-summary {
      display: flex;
      flex-direction: column;
      min-width: 0;
      gap: 3px;
    }

    .edu-account-name {
      font-size: 14px;
      font-weight: 700;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .edu-account-role {
      font-size: 12px;
      color: #64748b;
      text-transform: capitalize;
    }

    .edu-account-chevron {
      margin-left: 4px;
      color: #64748b;
    }

    .edu-account-dropdown {
      position: absolute;
      top: calc(100% + 8px);
      right: 0;
      width: 260px;
      padding: 12px;
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      box-shadow: 0 12px 30px rgba(15, 23, 42, 0.14);
    }

    .edu-account-email {
      padding: 8px 8px 12px;
      border-bottom: 1px solid #e2e8f0;
      color: #64748b;
      font-size: 12px;
      overflow-wrap: anywhere;
    }

    .edu-account-signout {
      width: 100%;
      margin-top: 8px;
      padding: 10px;
      border: 0;
      border-radius: 8px;
      background: #fff1f2;
      color: #be123c;
      font: inherit;
      font-weight: 600;
      text-align: left;
      cursor: pointer;
    }

    .edu-account-signout:hover {
      background: #ffe4e6;
    }

    .edu-account-trigger:focus-visible,
    .edu-account-signout:focus-visible {
      outline: 2px solid #3156b8;
      outline-offset: 3px;
    }

    @media (max-width: 560px) {
      .edu-account-trigger {
        gap: 6px;
        padding: 6px;
        max-width: 165px;
      }

      .edu-account-avatar {
        width: 32px;
        height: 32px;
      }

      .edu-account-name {
        max-width: 95px;
        font-size: 12px;
      }

      .edu-account-role {
        font-size: 11px;
      }

      .edu-account-dropdown {
        width: min(260px, calc(100vw - 32px));
      }
    }
  `;

  document.head.appendChild(style);
}

function createAccountMenu(topbar) {
  if (topbar.querySelector(".edu-account-menu")) return null;

  // Remove the older static profile link if this page has one.
  topbar.querySelector(".topbar-profile")?.remove();

  const wrapper = document.createElement("div");
  wrapper.className = "edu-account-menu";

  wrapper.innerHTML = `
    <button
      type="button"
      class="edu-account-trigger"
      aria-expanded="false"
      aria-haspopup="true"
      aria-label="Open account menu"
    >
      <span class="edu-account-avatar" data-account-avatar>A</span>
      <span class="edu-account-summary">
        <span class="edu-account-name" data-account-name>Loading account...</span>
        <span class="edu-account-role" data-account-role>Checking account</span>
      </span>
      <span class="edu-account-chevron" aria-hidden="true">▾</span>
    </button>

    <div class="edu-account-dropdown" hidden>
      <div class="edu-account-email" data-account-email></div>
      <button type="button" class="edu-account-signout">
        Sign out
      </button>
    </div>
  `;

  topbar.appendChild(wrapper);

  const trigger = wrapper.querySelector(".edu-account-trigger");
  const dropdown = wrapper.querySelector(".edu-account-dropdown");
  const signOutButton = wrapper.querySelector(".edu-account-signout");

  trigger.addEventListener("click", () => {
    const isOpen = !dropdown.hidden;
    dropdown.hidden = isOpen;
    trigger.setAttribute("aria-expanded", String(!isOpen));
  });

  document.addEventListener("click", (event) => {
    if (!wrapper.contains(event.target)) {
      dropdown.hidden = true;
      trigger.setAttribute("aria-expanded", "false");
    }
  });

  signOutButton.addEventListener("click", async () => {
    signOutButton.disabled = true;
    signOutButton.textContent = "Signing out...";

    try {
      await signOut(auth);
      window.location.href = "../login.html";
    } catch (error) {
      console.error("EduAdmin sign-out failed:", error);
      signOutButton.disabled = false;
      signOutButton.textContent = "Sign out";
      alert("Could not sign out. Please try again.");
    }
  });

  return wrapper;
}

function displayAccount(wrapper, user, profile) {
  const name =
    profile?.fullName ||
    profile?.name ||
    profile?.displayName ||
    user.displayName ||
    user.email ||
    "Account";

  const role = profile?.role || "Account";

  wrapper.querySelector("[data-account-name]").textContent = name;
  wrapper.querySelector("[data-account-role]").textContent = role;
  wrapper.querySelector("[data-account-email]").textContent =
    user.email || "No email available";

  wrapper.querySelector("[data-account-avatar]").textContent =
    name.trim().charAt(0).toUpperCase() || "A";
}

async function loadAccountProfile(user) {
  try {
    const profileSnapshot = await getDoc(doc(db, "users", user.uid));
    return profileSnapshot.exists() ? profileSnapshot.data() : null;
  } catch (error) {
    console.error("EduAdmin account profile could not be loaded:", error);
    return null;
  }
}

function initializeAccountMenu() {
  const topbar = document.querySelector(".dashboard-topbar");

  if (!topbar) {
    console.error("EduAdmin: Dashboard topbar was not found.");
    return;
  }

  addAccountMenuStyles();

  const wrapper = createAccountMenu(topbar);
  if (!wrapper) return;

  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      window.location.href = "../login.html";
      return;
    }

    wrapper.querySelector("[data-account-name]").textContent = "Loading account...";
    wrapper.querySelector("[data-account-role]").textContent = "Loading profile";

    const profile = await loadAccountProfile(user);

    // Do not display a role from Firestore if the profile belongs to
    // a different signed-in user; the lookup above uses the Auth UID.
    displayAccount(wrapper, user, profile);
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeAccountMenu, {
    once: true
  });
} else {
  initializeAccountMenu();
}
