
import { db } from "./firebase-config.js";

import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  updateDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

const HOUR = 60 * 60 * 1000;
const STUDENT_LIMIT = 2;
const TEACHER_LIMIT = 1;


export async function evaluateProvisionalAdmin(adminUid) {
  const profileRef = doc(db, "users", adminUid);
  let profileSnapshot;

  try {
    profileSnapshot = await getDoc(profileRef);
  } catch (error) {
    console.error("PROVISIONAL CHECK FAILED: read admin profile", error);
    throw error;
  }

  if (!profileSnapshot.exists()) {
    throw new Error("Admin profile not found.");
  }

  const profile = profileSnapshot.data();

  if (
    profile.role !== "admin" ||
    profile.isActive !== true ||
    !profile.academyId
  ) {
    return {
      allowed: false,
      reason: "Admin account is inactive or has no academy assigned."
    };
  }

  if (profile.provisionalAdmin !== true) {
    return { allowed: true, reason: "Not a provisional admin." };
  }

  const startTime =
    profile.provisionalStartedAt?.toMillis?.() ??
    profile.createdAt?.toMillis?.();

  if (!startTime) {
    throw new Error(
      "The provisional admin profile has no valid start timestamp."
    );
  }

  const now = Date.now();
  const studentDeadline = startTime + 48 * HOUR;
  const teacherDeadline = startTime + 72 * HOUR;

  const studentsQuery = query(
    collection(db, "users"),
    where("academyId", "==", profile.academyId),
    where("role", "==", "student"),
    where("isActive", "==", true)
  );

  const teachersQuery = query(
    collection(db, "users"),
    where("academyId", "==", profile.academyId),
    where("role", "==", "teacher"),
    where("isActive", "==", true)
  );

  let studentsSnapshot;
  let teachersSnapshot;

  try {
    studentsSnapshot = await getDocs(studentsQuery);
  } catch (error) {
    console.error("PROVISIONAL CHECK FAILED: query active students", error);
    throw error;
  }

  try {
    teachersSnapshot = await getDocs(teachersQuery);
  } catch (error) {
    console.error("PROVISIONAL CHECK FAILED: query active teachers", error);
    throw error;
  }

  const studentCount = studentsSnapshot.size;
  const teacherCount = teachersSnapshot.size;

  const studentRequirementMet = studentCount >= STUDENT_LIMIT;
  const teacherRequirementMet = teacherCount >= TEACHER_LIMIT;

  if (now >= studentDeadline && !studentRequirementMet) {
    try {
      await updateDoc(profileRef, {
        isActive: false,
        registrationStatus: "expired",
        restrictionReason: "student_requirement_not_met",
        restrictedAt: serverTimestamp()
      });
    } catch (error) {
      console.error("PROVISIONAL CHECK FAILED: restrict admin profile", error);
      throw error;
    }

    return {
      allowed: false,
      reason: "At least 2 approved students were required within 48 hours.",
      studentCount,
      teacherCount
    };
  }

  if (now >= teacherDeadline && !teacherRequirementMet) {
    try {
      await updateDoc(profileRef, {
        isActive: false,
        registrationStatus: "expired",
        restrictionReason: "teacher_requirement_not_met",
        restrictedAt: serverTimestamp()
      });
    } catch (error) {
      console.error("PROVISIONAL CHECK FAILED: restrict admin profile", error);
      throw error;
    }

    return {
      allowed: false,
      reason: "At least 1 approved teacher was required within 72 hours.",
      studentCount,
      teacherCount
    };
  }

  if (studentRequirementMet && teacherRequirementMet) {
    try {
      await updateDoc(profileRef, {
        provisionalAdmin: false,
        activityCompleted: true,
        onboardingCompletedAt: serverTimestamp(),
        studentCountAtCompletion: studentCount,
        teacherCountAtCompletion: teacherCount
      });
    } catch (error) {
      console.error("PROVISIONAL CHECK FAILED: complete admin onboarding", error);
      throw error;
    }

    return {
      allowed: true,
      reason: "Both onboarding requirements are satisfied.",
      studentCount,
      teacherCount,
      completed: true
    };
  }

  return {
    allowed: true,
    reason: "Onboarding requirements are still within their deadlines.",
    studentCount,
    teacherCount,
    studentRequirementMet,
    teacherRequirementMet,
    studentDeadline,
    teacherDeadline
  };
}

