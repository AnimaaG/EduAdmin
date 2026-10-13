import { db } from "./firebase-config.js";

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  serverTimestamp,
  updateDoc
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

// Only these application collections are supported.
const ALLOWED_COLLECTIONS = new Set([
  "users",
  "students",
  "teachers",
  "classes",
  "attendance",
  "materials",
  "schedules",
  "fees",
  "payments",
  "notifications",
  "settings"
]);

function validateCollection(collectionName) {
  if (!ALLOWED_COLLECTIONS.has(collectionName)) {
    throw new Error("Unsupported Firestore collection.");
  }
}

function getSafeErrorMessage(error) {
  if (error?.code === "permission-denied") {
    return "Access denied. Check your Firebase Authentication and Firestore security rules.";
  }

  if (error?.code === "unavailable") {
    return "Firebase is temporarily unavailable. Please try again.";
  }

  return "The database operation failed. Please try again.";
}

export async function createRecord(collectionName, data) {
  validateCollection(collectionName);

  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("A valid record is required.");
  }

  try {
    const record = {
      ...data,
      createdAt: serverTimestamp()
    };

    const result = await addDoc(
      collection(db, collectionName),
      record
    );

    return { id: result.id };
  } catch (error) {
    console.error("Firestore create failed:", error);
    throw new Error(getSafeErrorMessage(error));
  }
}

export async function getRecords(collectionName) {
  validateCollection(collectionName);

  try {
    const snapshot = await getDocs(
      collection(db, collectionName)
    );

    return snapshot.docs.map((item) => ({
      id: item.id,
      ...item.data()
    }));
  } catch (error) {
    console.error("Firestore read failed:", error);
    throw new Error(getSafeErrorMessage(error));
  }
}

export async function updateRecord(collectionName, recordId, changes) {
  validateCollection(collectionName);

  if (!recordId || !changes || typeof changes !== "object" ||
      Array.isArray(changes)) {
    throw new Error("A valid record ID and update are required.");
  }

  // Do not allow ordinary page forms to change protected fields.
  const protectedFields = [
    "role",
    "userId",
    "createdAt",
    "reviewedBy",
    "reviewedAt"
  ];

  if (protectedFields.some((field) =>
    Object.prototype.hasOwnProperty.call(changes, field)
  )) {
    throw new Error("This update contains a protected field.");
  }

  try {
    await updateDoc(
      doc(db, collectionName, recordId),
      changes
    );

    return true;
  } catch (error) {
    console.error("Firestore update failed:", error);
    throw new Error(getSafeErrorMessage(error));
  }
}

export async function deleteRecord(collectionName, recordId) {
  validateCollection(collectionName);

  if (!recordId) {
    throw new Error("A valid record ID is required.");
  }

  try {
    await deleteDoc(
      doc(db, collectionName, recordId)
    );

    return true;
  } catch (error) {
    console.error("Firestore delete failed:", error);
    throw new Error(getSafeErrorMessage(error));
  }
}
