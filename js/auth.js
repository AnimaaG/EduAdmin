
import { auth, db } from "./firebase-config.js";
import { evaluateProvisionalAdmin } from "./admin-activity.js";

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";

import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  writeBatch,
  serverTimestamp,
  Timestamp,
  updateDoc,
  increment
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

const HOUR = 60 * 60 * 1000;
const PROVISIONAL_LIMIT = 48 * HOUR;

function showMessage(id, message, type = "info") {
  const element = document.getElementById(id);
  if (!element) return;

  element.textContent = message;
  element.className = `message ${type}`;
  element.hidden = false;
}

function friendlyError(error) {
  console.error(error);

  if (error.code === "auth/email-already-in-use") {
    return "This email is already registered.";
  }
  if (error.code === "auth/invalid-email") {
    return "Enter a valid email address.";
  }
  if (error.code === "auth/weak-password") {
    return "Use a password with at least 8 characters.";
  }
  if (error.code === "auth/invalid-credential") {
    return "Email or password is incorrect.";
  }
  if (error.code === "permission-denied") {
    return "Firestore denied this action. Check your security rules.";
  }
  return error.message || "Something went wrong. Please try again.";
}

async function loadAcademyOptions() {
  const select = document.getElementById("register-academy-code");
  if (!select || select.tagName !== "SELECT") return;

  try {
    const result = await getDocs(
      query(collection(db, "academies"), where("status", "==", "active"))
    );

    select.innerHTML = '<option value="">Choose an academy</option>';

    result.forEach((academyDoc) => {
      const academy = academyDoc.data();
      const option = document.createElement("option");
      option.value = academyDoc.id;
      option.textContent = `${academy.name || "Academy"} — ${academy.code || academyDoc.id}`;
      select.appendChild(option);
    });

    if (result.empty) {
      select.innerHTML = '<option value="">No active academies available</option>';
    }
  
  } catch (error) {
    console.error("Academy list failed:", error);
    select.innerHTML = '<option value="">Could not load academies</option>';

    showMessage(
      "register-message",
      `Academy loading failed: ${error.code || ""} ${error.message || error}`,
      "error"
    );
  }

}

async function handleLogin(event) {
  event.preventDefault();

  const button = document.getElementById("login-submit");
  const email = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-password").value;
  const selectedRole = document.getElementById("login-role").value;

  if (!email || !password || !selectedRole) {
    showMessage("login-message", "Complete all required fields.", "error");
    return;
  }

  if (button) button.disabled = true;

    try {
      const credential = await signInWithEmailAndPassword(auth, email, password);
      const userRef = doc(db, "users", credential.user.uid);
      let profileSnapshot;

  try {
    profileSnapshot = await getDoc(userRef);
  } catch (error) {
    console.error("LOGIN STEP 1 FAILED: reading users profile", {
      code: error.code,
      message: error.message,
      uid: credential.user.uid
    });
    throw error;
  }

    if (!profileSnapshot.exists()) {
      await signOut(auth);
      showMessage("login-message", "Your account profile is missing.", "error");
      return;
    }

    const profile = profileSnapshot.data();

    if (profile.role !== selectedRole || profile.isActive !== true) {
      await signOut(auth);
      showMessage(
        "login-message",
        "Your account is inactive or the selected account type is incorrect.",
        "error"
      );
      return;
    }

if (profile.provisionalAdmin === true) {
  let evaluation;

  try {
    evaluation = await evaluateProvisionalAdmin(credential.user.uid);
  } catch (error) {
    console.error("LOGIN STEP 2 FAILED: provisional admin evaluation", {
      code: error.code,
      message: error.message,
      uid: credential.user.uid
    });
    throw error;
  }

  if (!evaluation.allowed) {
    await signOut(auth);

    showMessage(
      "login-message",
      evaluation.reason || "Your provisional admin access has been restricted.",
      "error"
    );

    return;
  }
}

    const destinations = {
      admin: "admin/dashboard.html",
      teacher: "teacher/dashboard.html",
      student: "student/dashboard.html"
    };

    const destination = destinations[profile.role];

    if (!destination) {
      await signOut(auth);
      showMessage("login-message", "Unsupported account type.", "error");
      return;
    }

    window.location.href = destination;
  } catch (error) {
    showMessage("login-message", friendlyError(error), "error");
  } finally {
    if (button) button.disabled = false;
  }
}

async function handleRegistration(event) {
  event.preventDefault();

  const form = document.getElementById("register-form");
  const button = document.getElementById("register-submit");

  const fullName = document.getElementById("register-name").value.trim();
  const role = document.getElementById("register-role").value;
  const email = document.getElementById("register-email").value.trim();
  const phone = document.getElementById("register-phone").value.trim();
  const password = document.getElementById("register-password").value;
  const confirmPassword =
    document.getElementById("register-confirm-password").value;
  const registrationType =
    document.getElementById("academy-registration-type").value;

  if (!fullName || !role || !email || !password || !confirmPassword ||
      !registrationType) {
    showMessage("register-message", "Complete all required fields.", "error");
    return;
  }

  if (password.length < 8 || password !== confirmPassword) {
    showMessage(
      "register-message",
      password !== confirmPassword
        ? "Passwords do not match."
        : "Password must contain at least 8 characters.",
      "error"
    );
    return;
  }

  if (!["student", "teacher", "admin"].includes(role)) {
    showMessage("register-message", "Choose a valid account type.", "error");
    return;
  }

  const isNewAcademy = registrationType === "new";

  if (isNewAcademy && role !== "admin") {
    showMessage(
      "register-message",
      "Only an admin can register a new academy.",
      "error"
    );
    return;
  }

  let academyId = "";
  let academyName = "";
  let academyAddress = "";

  if (isNewAcademy) {
    academyName = document.getElementById("register-academy-name").value.trim();
    academyAddress = document.getElementById("register-academy-address").value.trim();

    if (!academyName) {
      showMessage("register-message", "Enter the academy name.", "error");
      return;
    }
  } else {
    academyId = document.getElementById("register-academy-code").value;

    if (!academyId) {
      showMessage("register-message", "Choose an existing academy.", "error");
      return;
    }
  }

  if (button) button.disabled = true;

  let credential;

  try {
    // For an existing academy, verify that the selected academy exists.
    if (!isNewAcademy) {
      const academySnapshot = await getDoc(doc(db, "academies", academyId));

      if (!academySnapshot.exists() ||
          academySnapshot.data().status !== "active") {
        throw new Error("The selected academy is unavailable.");
      }

      academyName = academySnapshot.data().name || "";
    }

    credential = await createUserWithEmailAndPassword(auth, email, password);

    const uid = credential.user.uid;
    const userRef = doc(db, "users", uid);
    const batch = writeBatch(db);

    if (isNewAcademy) {
      const now = Date.now();
      const provisionalUntil = Timestamp.fromMillis(now + PROVISIONAL_LIMIT);

      // New academy ID is the owner admin's UID.
      // Rules must allow this only as an atomic owner-created academy.
      academyId = uid;

      batch.set(doc(db, "academies", academyId), {
        name: academyName,
        address: academyAddress,
        code: academyId,
        ownerUid: uid,
        status: "active",
        createdAt: serverTimestamp()
      });

      batch.set(userRef, {
        fullName,
        email,
        phone,
        role: "admin",
        isActive: true,
        academyId,
        academyCode: academyId,
        registrationStatus: "approved",
        provisionalAdmin: true,
        provisionalStartedAt: Timestamp.fromMillis(now),
        provisionalAdminUntil: Timestamp.fromMillis(
          now + 72 * HOUR
        ),
        activityCompleted: false,
        createdAt: serverTimestamp()
      });
    } else {
      // Existing academy: create a request tied to that academy.
      batch.set(userRef, {
        fullName,
        email,
        phone,
        role: "pending",
        requestedRole: role,
        isActive: false,
        academyId,
        academyCode: academyId,
        registrationStatus: "pending",
        createdAt: serverTimestamp()
      });

      batch.set(doc(db, "registrationRequests", uid), {
        uid,
        fullName,
        email,
        phone,
        requestedRole: role,
        academyId,
        status: "pending",
        createdAt: serverTimestamp()
      });
    }

    await batch.commit();
    await signOut(auth);
    form.reset();

    showMessage(
      "register-message",
      isNewAcademy
        ? "Your academy is active. You must have at least 2 approved students within 48 hours and at least 1 approved teacher within 72 hours to retain admin access."
        : `Your ${role} request has been sent to the administrator of ${academyName || "the selected academy"}.`,
      "info"
    );
  } catch (error) {
    console.error("Registration failed:", error);

    // If Auth creation succeeded but Firestore setup failed, do not
    // silently leave the new user signed in.
    if (auth.currentUser) {
      try {
        await signOut(auth);
      } catch (signOutError) {
        console.error("Sign-out failed:", signOutError);
      }
    }

    showMessage("register-message", friendlyError(error), "error");
  } finally {
    if (button) button.disabled = false;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const loginForm = document.getElementById("login-form");
  const registerForm = document.getElementById("register-form");
  const forgotLink = document.getElementById("forgot-password-link");

  if (loginForm) loginForm.addEventListener("submit", handleLogin);
  if (registerForm) registerForm.addEventListener("submit", handleRegistration);

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
        showMessage("login-message", "If password recovery is available, a reset email will be sent.", "info");
      } catch (error) {
        showMessage("login-message", friendlyError(error), "error");
      }
    });
  }

  loadAcademyOptions();
});
