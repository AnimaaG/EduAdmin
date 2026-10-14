import { auth, db } from "./firebase-config.js";

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  deleteUser,
  signOut
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";

import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
  writeBatch
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

"use strict";

function showMessage(id, text, type = "info") {
  const element = document.getElementById(id);
  if (!element) return;

  element.textContent = text;
  element.className = `message ${type}`;
  element.hidden = false;
  element.setAttribute("role", type === "error" ? "alert" : "status");
}

function friendlyError(error) {
  const errors = {
    "auth/email-already-in-use": "This email is already registered.",
    "auth/invalid-email": "Enter a valid email address.",
    "auth/weak-password": "Choose a stronger password.",
    "auth/invalid-credential": "Email or password is incorrect.",
    "auth/too-many-requests": "Too many attempts. Try again later.",
    "auth/network-request-failed": "Network error. Check your connection.",
    "permission-denied":
      "Firebase rules denied this operation. Check the users and registrationRequests rules."
  };

  return errors[error.code] ||
    error.message ||
    "The operation failed. Please try again.";
}

function initLoginForm() {
  const form = document.getElementById("login-form");
  if (!form) return;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const button = document.getElementById("login-submit");
    const email = document.getElementById("login-email").value.trim();
    const password = document.getElementById("login-password").value;
    const selectedRole = document.getElementById("login-role").value;

    if (!email || !password || !selectedRole) {
      showMessage("login-message", "Complete all required fields.", "error");
      return;
    }

    button.disabled = true;

    try {
      const result = await signInWithEmailAndPassword(auth, email, password);
      const profile = await getDoc(doc(db, "users", result.user.uid));

      if (!profile.exists()) {
        await signOut(auth);
        showMessage(
          "login-message",
          "Your account profile is missing. Contact the administrator.",
          "error"
        );
        return;
      }

      const userData = profile.data();

      if (userData.isActive !== true || userData.role !== selectedRole) {
        await signOut(auth);

        const message = userData.registrationStatus === "rejected"
          ? "Your access request was rejected. Contact the academy administrator."
          : userData.registrationStatus === "pending" ||
            userData.role === "pending"
            ? "Your registration is awaiting administrator approval."
            : "Your account is inactive or the selected account type is incorrect.";

        showMessage("login-message", message, "error");
        return;
      }

      const destinations = {
        admin: "admin/dashboard.html",
        teacher: "teacher/dashboard.html",
        student: "student/dashboard.html"
      };

      const destination = destinations[userData.role];

      if (!destination) {
        await signOut(auth);
        showMessage("login-message", "Unsupported account type.", "error");
        return;
      }

      window.location.href = destination;
    } catch (error) {
      console.error("Login failed:", error);
      showMessage("login-message", friendlyError(error), "error");
    } finally {
      button.disabled = false;
    }
  });

  const forgotLink = document.getElementById("forgot-password-link");

  if (forgotLink) {
    forgotLink.addEventListener("click", async (event) => {
      event.preventDefault();

      const email = document.getElementById("login-email").value.trim();

      if (!email) {
        showMessage("login-message", "Enter your email address first.", "error");
        return;
      }

      try {
        await sendPasswordResetEmail(auth, email);
        showMessage(
          "login-message",
          "If password recovery is available, a reset email will be sent.",
          "info"
        );
      } catch (error) {
        console.error("Password reset failed:", error);
        showMessage("login-message", friendlyError(error), "error");
      }
    });
  }
}

function initRegisterForm() {
  const form = document.getElementById("register-form");
  if (!form) return;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const button = document.getElementById("register-submit");
    const name = document.getElementById("register-name").value.trim();
    const role = document.getElementById("register-role").value;
    const email = document.getElementById("register-email").value.trim();
    const phone = document.getElementById("register-phone").value.trim();
    const password = document.getElementById("register-password").value;
    const confirmation = document.getElementById(
      "register-confirm-password"
    ).value;

    const registrationType = document.getElementById(
      "academy-registration-type"
    ).value;

    if (!name || !email || !password || !confirmation || !role ||
        !registrationType) {
      showMessage("register-message", "Complete all required fields.", "error");
      return;
    }

    if (!["admin", "teacher", "student"].includes(role)) {
      showMessage("register-message", "Select a valid account type.", "error");
      return;
    }

    if (password.length < 8 || password !== confirmation) {
      showMessage(
        "register-message",
        password !== confirmation
          ? "Passwords do not match."
          : "Password must contain at least 8 characters.",
        "error"
      );
      return;
    }

    let academyCode = "";

    if (registrationType === "existing") {
      academyCode = document.getElementById(
        "register-academy-code"
      ).value.trim();

      if (!academyCode) {
        showMessage(
          "register-message",
          "Enter the academy code provided to you.",
          "error"
        );
        return;
      }
    } else {
      showMessage(
        "register-message",
        "Choose an existing academy and enter its academy code to submit this request.",
        "error"
      );
      return;
    }

    button.disabled = true;

    let credential = null;
    let requestSubmitted = false;

    try {
      credential = await createUserWithEmailAndPassword(
        auth,
        email,
        password
      );

      const uid = credential.user.uid;
      const batch = writeBatch(db);

      batch.set(doc(db, "users", uid), {
        fullName: name,
        email,
        phone,
        role: "pending",
        requestedRole: role,
        isActive: false,
        registrationStatus: "pending",
        academyCode,
        createdAt: serverTimestamp()
      });

      batch.set(doc(db, "registrationRequests", uid), {
        uid,
        fullName: name,
        email,
        phone,
        requestedRole: role,
        academyCode,
        status: "pending",
        createdAt: serverTimestamp()
      });

      await batch.commit();
      requestSubmitted = true;

      await signOut(auth);

      form.reset();

      showMessage(
        "register-message",
        "Registration request submitted. Your account will remain inactive until an administrator reviews it.",
        "info"
      );
    } catch (error) {
      console.error("Registration failed:", error);

      if (credential?.user && !requestSubmitted) {
        try {
          await deleteUser(credential.user);
        } catch (cleanupError) {
          console.error("Account cleanup failed:", cleanupError);
          try {
            await signOut(auth);
          } catch (signOutError) {
            console.error("Sign-out failed:", signOutError);
          }
        }
      }

      showMessage("register-message", friendlyError(error), "error");
    } finally {
      button.disabled = false;
    }
  });
}

document.addEventListener("DOMContentLoaded", () => {
  initLoginForm();
  initRegisterForm();
});