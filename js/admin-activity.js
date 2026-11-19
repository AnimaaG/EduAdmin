import { auth, db } from "./firebase-config.js";

import {
  doc,
  getDoc,
  getDocs,
  updateDoc,
  collection,
  query,
  where,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

const HOUR = 60 * 60 * 1000;
const STUDENT_DEADLINE_HOURS = 48;
const TEACHER_DEADLINE_HOURS = 72;
const REQUIRED_STUDENTS = 2;
const REQUIRED_TEACHERS = 1;

/**
 * Stubbed out to prevent writing to activityLogs and saving Firebase storage.
 * Preserved so imports across other modules continue to work without errors.
 */
export async function recordAcademyAdminActivity() {
  // No-op: Activity logs are disabled.
  return Promise.resolve();
}

/**
 * Evaluate the provisional academy admin's onboarding requirements.
 *
 * Requirements:
 * - At least 2 active students within 48 hours.
 * - At least 1 active teacher within 72 hours.
 */
export async function evaluateProvisionalAdmin(uid) {
  if (!auth.currentUser || auth.currentUser.uid !== uid) {
    return {
      allowed: false,
      reason: "Your session could not be verified. Please sign in again."
    };
  }

  const userRef = doc(db, "users", uid);
  const profileSnapshot = await getDoc(userRef);

  if (!profileSnapshot.exists()) {
    return {
      allowed: false,
      reason: "Admin profile not found."
    };
  }

  const profile = profileSnapshot.data();

  if (
    profile.role !== "admin" ||
    profile.isActive !== true ||
    !profile.academyId
  ) {
    return {
      allowed: false,
      reason: "Active academy admin access is required."
    };
  }

  // Non-provisional admins do not need provisional onboarding checks.
  if (profile.provisionalAdmin !== true) {
    return { allowed: true, reason: "" };
  }

  if (profile.activityCompleted === true) {
    return { allowed: true, reason: "" };
  }

  const startTimestamp = profile.provisionalStartedAt;

  if (!startTimestamp || typeof startTimestamp.toMillis !== "function") {
    return {
      allowed: false,
      reason:
        "The provisional admin start time is missing. Please contact support."
    };
  }

  const startedAt = startTimestamp.toMillis();
  const now = Date.now();

  const studentDeadline =
    startedAt + STUDENT_DEADLINE_HOURS * HOUR;

  const teacherDeadline =
    startedAt + TEACHER_DEADLINE_HOURS * HOUR;

  // Count active students and teachers in this academy.
  const [studentsSnapshot, teachersSnapshot] = await Promise.all([
    getDocs(
      query(
        collection(db, "users"),
        where("academyId", "==", profile.academyId),
        where("role", "==", "student"),
        where("isActive", "==", true)
      )
    ),
    getDocs(
      query(
        collection(db, "users"),
        where("academyId", "==", profile.academyId),
        where("role", "==", "teacher"),
        where("isActive", "==", true)
      )
    )
  ]);

  const studentCount = studentsSnapshot.size;
  const teacherCount = teachersSnapshot.size;

  const hasEnoughStudents = studentCount >= REQUIRED_STUDENTS;
  const hasEnoughTeachers = teacherCount >= REQUIRED_TEACHERS;

  // Complete onboarding once both requirements are satisfied.
  if (hasEnoughStudents && hasEnoughTeachers) {
    await updateDoc(userRef, {
      provisionalAdmin: false,
      activityCompleted: true,
      onboardingCompletedAt: serverTimestamp(),
      studentCountAtCompletion: studentCount,
      teacherCountAtCompletion: teacherCount
    });

    return {
      allowed: true,
      reason: ""
    };
  }

  // Expire access if the 48-hour student deadline was missed.
  if (!hasEnoughStudents && now >= studentDeadline) {
    await updateDoc(userRef, {
      isActive: false,
      registrationStatus: "expired",
      restrictionReason:
        "The requirement of at least 2 active students was not met within 48 hours.",
      restrictedAt: serverTimestamp()
    });

    return {
      allowed: false,
      reason:
        "Admin access has expired because at least 2 active students were not added within 48 hours."
    };
  }

  // Expire access if the 72-hour teacher deadline was missed.
  if (!hasEnoughTeachers && now >= teacherDeadline) {
    await updateDoc(userRef, {
      isActive: false,
      registrationStatus: "expired",
      restrictionReason:
        "The requirement of at least 1 active teacher was not met within 72 hours.",
      restrictedAt: serverTimestamp()
    });

    return {
      allowed: false,
      reason:
        "Admin access has expired because at least 1 active teacher was not added within 72 hours."
    };
  }

  // Requirements are not complete, but their deadlines have not expired.
  const remaining = [];

  if (!hasEnoughStudents) {
    remaining.push(
      `at least ${REQUIRED_STUDENTS} active students within 48 hours`
    );
  }

  if (!hasEnoughTeachers) {
    remaining.push(
      `at least ${REQUIRED_TEACHERS} active teacher within 72 hours`
    );
  }

  return {
    allowed: true,
    reason: `Still required: ${remaining.join(" and ")}.`
  };
}