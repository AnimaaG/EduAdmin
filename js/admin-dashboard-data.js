
import { auth, db } from "./firebase-config.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";

import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

document.addEventListener("DOMContentLoaded", () => {
  const studentCount = document.getElementById("total-students");
  const teacherCount = document.getElementById("total-teachers");
  const studentStatus = document.getElementById("students-status");
  const teacherStatus = document.getElementById("teachers-status");

  if (!studentCount || !teacherCount || !studentStatus || !teacherStatus) {
    console.error("Admin dashboard statistic elements were not found.");
    return;
  }

  function setStatus(element, message) {
    element.textContent = message;
  }

  async function countActiveUsers(academyId, role) {
    const usersQuery = query(
      collection(db, "users"),
      where("academyId", "==", academyId),
      where("role", "==", role),
      where("isActive", "==", true)
    );

    const snapshot = await getDocs(usersQuery);
    return snapshot.size;
  }

  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      window.location.href = "../login.html";
      return;
    }

    studentCount.textContent = "—";
    teacherCount.textContent = "—";
    setStatus(studentStatus, "Loading records...");
    setStatus(teacherStatus, "Loading records...");

    try {
      const profileSnapshot = await getDoc(
        doc(db, "users", user.uid)
      );

      if (!profileSnapshot.exists()) {
        throw new Error("Your user profile was not found.");
      }

      const profile = profileSnapshot.data();

      if (
        profile.role !== "admin" ||
        profile.isActive !== true ||
        !profile.academyId
      ) {
        throw new Error("An active academy admin profile is required.");
      }

      const [students, teachers] = await Promise.all([
        countActiveUsers(profile.academyId, "student"),
        countActiveUsers(profile.academyId, "teacher")
      ]);

      studentCount.textContent = String(students);
      teacherCount.textContent = String(teachers);

      setStatus(studentStatus, "Active students");
      setStatus(teacherStatus, "Active teachers");
    } catch (error) {
      console.error("Admin dashboard data failed:", error);

      studentCount.textContent = "—";
      teacherCount.textContent = "—";

      setStatus(studentStatus, "Could not load student records");
      setStatus(teacherStatus, "Could not load teacher records");
    }
  });
});
