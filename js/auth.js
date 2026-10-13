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
  setDoc,
  serverTimestamp
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
    "auth/too-many-requests": "Too many attempts. Please try again later.",
    "permission-denied": "Firestore denied access. Security rules must be configured."
  };

  return errors[error.code] ||
    "The operation failed. Check your connection and Firebase configuration.";
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

      const { getDoc } = await import(
        "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js"
      );

      const profile = await getDoc(doc(db, "users", result.user.uid));

      if (!profile.exists()) {
        await signOut(auth);
        showMessage(
          "login-message",
          "Your account profile is not ready. Contact the administrator.",
          "error"
        );
        return;
      }

      const userData = profile.data();

      if (userData.isActive !== true || userData.role !== selectedRole) {
        await signOut(auth);
        showMessage(
          "login-message",
          "Your account is inactive or the selected account type is incorrect.",
          "error"
        );
        return;
      }

      const destinations = {
        admin: "../pages/admin/dashboard.html",
        teacher: "../pages/teacher/dashboard.html",
        student: "../pages/student/dashboard.html"
      };

      window.location.href = destinations[userData.role];
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
        showMessage(
          "login-message",
          "Enter your email address first.",
          "error"
        );
        return;
      }

      try {
        await sendPasswordResetEmail(auth, email);
        showMessage(
          "login-message",
          "If password recovery is available for this account, a reset email will be sent.",
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

    if (password.length < 8 || password !== confirmation) {
      showMessage(
        "register-message",
        password !== confirmation
          ? "Passwords do not match."
          : "Your password must contain at least 8 characters.",
        "error"
      );
      return;
    }

    // Public registration must not assign privileged roles.
    // Admin and teacher accounts require a trusted provisioning workflow.
    if (role !== "student") {
      showMessage(
        "register-message",
        "Public registration is currently available for students only. Admin and teacher accounts must be provisioned securely.",
        "error"
      );
      return;
    }

    if (registrationType !== "existing") {
      showMessage(
        "register-message",
        "Student registration requires an existing academy and a valid academy code.",
        "error"
      );
      return;
    }

    const academyCode = document.getElementById(
      "register-academy-code"
    ).value.trim();

    if (!academyCode) {
      showMessage(
        "register-message",
        "Enter the academy code provided by your administrator.",
        "error"
      );
      return;
    }

    button.disabled = true;

    let credential = null;

    try {
      credential = await createUserWithEmailAndPassword(
        auth,
        email,
        password
      );

      // This is a profile write, not academy-code verification.
      // Firestore rules must enforce the allowed fields and role.
      await setDoc(doc(db, "users", credential.user.uid), {
        fullName: name,
        email,
        phone,
        role: "student",
        isActive: false,
        academyCode,
        createdAt: serverTimestamp()
      });

      showMessage(
        "register-message",
        "Account created. Access remains inactive until academy membership is verified.",
        "info"
      );

      form.reset();
    } catch (error) {
      console.error("Registration failed:", error);

      // Avoid leaving an Auth account behind if profile creation fails.
      if (credential?.user) {
        try {
          await deleteUser(credential.user);
        } catch (cleanupError) {
          console.error("Account cleanup failed:", cleanupError);
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
