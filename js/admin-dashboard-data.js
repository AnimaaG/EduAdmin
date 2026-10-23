import { auth, db } from "./firebase-config.js";

import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

import { onAuthStateChanged } from
  "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";

document.addEventListener("DOMContentLoaded", () => {
  const $ = (id) => document.getElementById(id);

  const studentCount = $("total-students");
  const teacherCount = $("total-teachers");
  const classCount = $("total-classes");
  const outstandingFees = $("outstanding-fees");

  const studentStatus = $("students-status");
  const teacherStatus = $("teachers-status");
  const classStatus = $("classes-status");
  const feeStatus = $("fees-status");
  const activityContainer = document.querySelector(".activity-card");

  const currency = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2
  });

  function setText(id, value) {
    const element = $(id);
    if (element) element.textContent = value;
  }

  function setActivityMessage(message) {
    if (!activityContainer) return;

    const empty = document.createElement("div");
    empty.className = "empty-state";

    const paragraph = document.createElement("p");
    paragraph.textContent = message;

    empty.appendChild(paragraph);
    activityContainer.replaceChildren(empty);
  }

  function safeDate(value) {
    if (!value) return null;

    if (typeof value.toDate === "function") {
      return value.toDate();
    }

    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function renderActivity(items) {
    if (!activityContainer) return;

    activityContainer.replaceChildren();

    if (!items.length) {
      setActivityMessage("No recent activity is available.");
      return;
    }

    const list = document.createElement("div");
    list.className = "activity-list";

    items.forEach((item) => {
      const row = document.createElement("div");
      row.className = "activity-item";

      const title = document.createElement("strong");
      title.textContent =
        item.title ||
        item.action ||
        item.message ||
        item.description ||
        "Academy activity";

      const detail = document.createElement("p");
      detail.textContent =
        item.message ||
        item.description ||
        item.details ||
        item.action ||
        "";

      const date = document.createElement("small");
      const timestamp = safeDate(
        item.createdAt || item.timestamp || item.date
      );

      date.textContent = timestamp
        ? timestamp.toLocaleString("en-IN")
        : "";

      row.append(title, detail, date);
      list.appendChild(row);
    });

    activityContainer.appendChild(list);
  }

  async function getCollectionData(name, academyId) {
    const q = query(
      collection(db, name),
      where("academyId", "==", academyId)
    );

    const snapshot = await getDocs(q);

    return snapshot.docs.map((item) => ({
      id: item.id,
      ...item.data()
    }));
  }

  async function loadDashboard(user) {
    setText("total-students", "—");
    setText("total-teachers", "—");
    setText("total-classes", "—");
    setText("outstanding-fees", "—");

    if (studentStatus) studentStatus.textContent = "Loading...";
    if (teacherStatus) teacherStatus.textContent = "Loading...";
    if (classStatus) classStatus.textContent = "Loading...";
    if (feeStatus) feeStatus.textContent = "Loading...";

    setActivityMessage("Loading recent activity...");

    const profileSnapshot = await getDoc(
      doc(db, "users", user.uid)
    );

    if (!profileSnapshot.exists()) {
      throw new Error("Admin profile not found.");
    }

    const profile = profileSnapshot.data();

    if (
      profile.role !== "admin" ||
      profile.isActive !== true ||
      !profile.academyId
    ) {
      throw new Error("An active academy admin account is required.");
    }

    const academyId = profile.academyId;

    // Load each collection independently so one failure does not
    // prevent the other dashboard cards from being displayed.
    const tasks = [
      {
        name: "students",
        run: () => getCollectionData("users", academyId)
      },
      {
        name: "classes",
        run: () => getCollectionData("classes", academyId)
      },
      {
        name: "fees",
        run: () => getCollectionData("fees", academyId)
      },
      {
        name: "activity",
        run: () => getCollectionData("activityLogs", academyId)
      }
    ];

    const results = await Promise.allSettled(
      tasks.map((task) => task.run())
    );

    const data = {};

    results.forEach((result, index) => {
      const name = tasks[index].name;

      if (result.status === "fulfilled") {
        data[name] = result.value;
      } else {
        data[name] = null;
        console.error(
          `Dashboard ${name} data failed:`,
          result.reason
        );
      }
    });

    // Student and teacher counts.
    if (data.students) {
      const activeStudents = data.students.filter(
        (item) =>
          item.role === "student" &&
          item.isActive === true
      ).length;

      const activeTeachers = data.students.filter(
        (item) =>
          item.role === "teacher" &&
          item.isActive === true
      ).length;

      setText("total-students", String(activeStudents));
      setText("students-status", "Active students");

      setText("total-teachers", String(activeTeachers));
      setText("teachers-status", "Active teachers");
    } else {
      setText("students-status", "Unable to load student data");
      setText("teachers-status", "Unable to load teacher data");
    }

    // Total classes in this academy.
    if (data.classes) {
      setText("total-classes", String(data.classes.length));
      setText("classes-status", "Academy class records");
    } else {
      setText("classes-status", "Unable to load class data");
    }

    // Outstanding balance = assigned amount minus paid amount.
    if (data.fees) {
      const outstanding = data.fees.reduce((total, fee) => {
        const assigned = Number(fee.amount) || 0;
        const paid = Number(fee.amountPaid) || 0;

        return total + Math.max(0, assigned - paid);
      }, 0);

      setText("outstanding-fees", currency.format(outstanding));
      setText("fees-status", "Remaining fee balance");
    } else {
      setText("fees-status", "Unable to load fee data");
    }

    // Recent activity, newest first.
    if (data.activity) {
      const recent = data.activity
        .sort((a, b) => {
          const dateA = safeDate(
            a.createdAt || a.timestamp || a.date
          );
          const dateB = safeDate(
            b.createdAt || b.timestamp || b.date
          );

          return (dateB?.getTime() || 0) -
            (dateA?.getTime() || 0);
        })
        .slice(0, 5);

      renderActivity(recent);
    } else {
      setActivityMessage(
        "Recent activity is currently unavailable."
      );
    }
  }

  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      window.location.href = "../login.html";
      return;
    }

    try {
      await loadDashboard(user);
    } catch (error) {
      console.error("Dashboard loading failed:", error);

      setText("total-students", "—");
      setText("total-teachers", "—");
      setText("total-classes", "—");
      setText("outstanding-fees", "—");

      setText("students-status", "Unable to load data");
      setText("teachers-status", "Unable to load data");
      setText("classes-status", "Unable to load data");
      setText("fees-status", "Unable to load data");

      setActivityMessage(
        "Dashboard data could not be loaded. Please try again."
      );
    }
  });
});
