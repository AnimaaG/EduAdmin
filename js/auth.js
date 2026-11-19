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

let academyClassesCache = [];

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

async function loadClassesForAcademy(academyId) {
  const classSelect = document.getElementById("register-class-select");
  const subjectsContainer = document.getElementById("register-subjects-container");
  if (!classSelect) return;

  classSelect.innerHTML = '<option value="">Loading classes...</option>';
  if (subjectsContainer) {
    subjectsContainer.innerHTML = '<span style="color: #64748b; font-size: 13px;">Choose a class first to load available subjects.</span>';
  }

  if (!academyId) {
    classSelect.innerHTML = '<option value="">Choose an academy first...</option>';
    academyClassesCache = [];
    return;
  }

  try {
    const snapshot = await getDocs(
      query(collection(db, "classes"), where("academyId", "==", academyId), where("status", "==", "active"))
    );

    academyClassesCache = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    classSelect.innerHTML = '<option value="">Choose a class</option>';
    academyClassesCache.forEach(c => {
      const opt = document.createElement("option");
      opt.value = c.id;
      opt.textContent = c.className || "Class";
      classSelect.appendChild(opt);
    });

    if (academyClassesCache.length === 0) {
      classSelect.innerHTML = '<option value="">No active classes found for this academy</option>';
    }
  } catch (error) {
    console.error("Failed to load classes:", error);
    classSelect.innerHTML = '<option value="">Could not load classes</option>';
  }
}

function handleClassSelectionChange() {
  const classSelect = document.getElementById("register-class-select");
  const subjectsContainer = document.getElementById("register-subjects-container");
  if (!classSelect || !subjectsContainer) return;

  const classId = classSelect.value;
  if (!classId) {
    subjectsContainer.innerHTML = '<span style="color: #64748b; font-size: 13px;">Choose a class first to load available subjects.</span>';
    return;
  }

  const selectedClass = academyClassesCache.find(c => c.id === classId);
  const subjects = Array.isArray(selectedClass?.subjects) ? selectedClass.subjects : [];

  if (subjects.length === 0) {
    subjectsContainer.innerHTML = '<span style="color: #b91c1c; font-size: 13px;">No subjects configured for this class yet.</span>';
    return;
  }

  subjectsContainer.replaceChildren();
  subjects.forEach((subj, idx) => {
    const wrapper = document.createElement("label");
    wrapper.style.cssText = "display: flex; align-items: center; gap: 8px; font-size: 13px; color: #334155; cursor: pointer;";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.name = "registrationSubject";
    checkbox.value = subj.subjectName || "";

    const textSpan = document.createElement("span");
    textSpan.textContent = `${subj.subjectName} ${subj.teacherName ? `(Teacher: ${subj.teacherName})` : ""}`;

    wrapper.append(checkbox, textSpan);
    subjectsContainer.append(wrapper);
  });
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
    let profileSnapshot = await getDoc(userRef);

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
      const evaluation = await evaluateProvisionalAdmin(credential.user.uid);
      if (!evaluation.allowed) {
        await signOut(auth);
        showMessage("login-message", evaluation.reason || "Your provisional admin access has been restricted.", "error");
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
  const confirmPassword = document.getElementById("register-confirm-password").value;
  const registrationType = document.getElementById("academy-registration-type").value;

  if (!fullName || !role || !email || !password || !confirmPassword || !registrationType) {
    showMessage("register-message", "Complete all required fields.", "error");
    return;
  }

  if (password.length < 8 || password !== confirmPassword) {
    showMessage(
      "register-message",
      password !== confirmPassword ? "Passwords do not match." : "Password must contain at least 8 characters.",
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
    showMessage("register-message", "Only an admin can register a new academy.", "error");
    return;
  }

  let academyId = "";
  let academyName = "";
  let academyAddress = "";
  let classId = "";
  let className = "";
  let selectedSubjects = [];

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

    if (role === "student") {
      const classSelect = document.getElementById("register-class-select");
      classId = classSelect?.value || "";

      if (!classId) {
        showMessage("register-message", "Select a class for registration.", "error");
        return;
      }

      const foundClass = academyClassesCache.find(c => c.id === classId);
      className = foundClass?.className || "";

      const checkedBoxes = document.querySelectorAll('input[name="registrationSubject"]:checked');
      selectedSubjects = Array.from(checkedBoxes).map(cb => cb.value).filter(Boolean);

      if (selectedSubjects.length === 0) {
        showMessage("register-message", "Select at least one subject for registration.", "error");
        return;
      }
    }
  }

  if (button) button.disabled = true;

  try {
    if (!isNewAcademy) {
      const academySnapshot = await getDoc(doc(db, "academies", academyId));
      if (!academySnapshot.exists() || academySnapshot.data().status !== "active") {
        throw new Error("The selected academy is unavailable.");
      }
      academyName = academySnapshot.data().name || "";
    }

    const credential = await createUserWithEmailAndPassword(auth, email, password);
    const uid = credential.user.uid;
    const userRef = doc(db, "users", uid);
    const batch = writeBatch(db);

    if (isNewAcademy) {
      const now = Date.now();
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
        provisionalAdminUntil: Timestamp.fromMillis(now + 72 * HOUR),
        activityCompleted: false,
        createdAt: serverTimestamp()
      });
    } else {
      const userPayload = {
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
      };

      if (role === "student") {
        userPayload.classId = classId;
        userPayload.className = className;
        userPayload.subjects = selectedSubjects;
      }

      batch.set(userRef, userPayload);

      const requestPayload = {
        uid,
        fullName,
        email,
        phone,
        requestedRole: role,
        academyId,
        status: "pending",
        createdAt: serverTimestamp()
      };

      if (role === "student") {
        requestPayload.classId = classId;
        requestPayload.className = className;
        requestPayload.subjects = selectedSubjects;
      }

      batch.set(doc(db, "registrationRequests", uid), requestPayload);
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
    if (auth.currentUser) {
      try { await signOut(auth); } catch (signOutError) { console.error("Sign-out failed:", signOutError); }
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
  const academySelect = document.getElementById("register-academy-code");
  const classSelect = document.getElementById("register-class-select");

  if (loginForm) loginForm.addEventListener("submit", handleLogin);
  if (registerForm) registerForm.addEventListener("submit", handleRegistration);

  if (academySelect) {
    academySelect.addEventListener("change", (e) => {
      loadClassesForAcademy(e.target.value);
    });
  }

  if (classSelect) {
    classSelect.addEventListener("change", handleClassSelectionChange);
  }

  if (forgotLink) {
    forgotLink.addEventListener("click", async (event) => {
      event.preventDefault();
      const emailField = document.getElementById("login-email");
      const email = emailField ? emailField.value.trim() : "";

      if (!email) {
        showMessage("login-message", "Please enter your email address above before clicking 'Forgot password?'.", "error");
        if (emailField) emailField.focus();
        return;
      }

      try {
        showMessage("login-message", "Sending password reset email...", "info");
        await sendPasswordResetEmail(auth, email);
        showMessage(
          "login-message",
          "Password reset email sent! Check your inbox (and spam folder) for instructions.",
          "success"
        );
      } catch (error) {
        console.error("Password reset failed:", error);
        showMessage("login-message", friendlyError(error), "error");
      }
    });
  }

  loadAcademyOptions();
});