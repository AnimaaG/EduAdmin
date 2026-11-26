const GOOGLE_CLIENT_ID = "122093844253-0rjpa4dn89n5tt4rucm9q1sortgttcle.apps.googleusercontent.com";
const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";

let tokenClient = null;
let driveAccessToken = null;
let connectedAccountEmail = null;

function loadGisScript() {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(
      'script[src="https://accounts.google.com/gsi/client"]'
    );
    if (existing) {
      existing.addEventListener("load", resolve, { once: true });
      existing.addEventListener("error", () => reject(new Error("Failed to load Google sign-in.")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = resolve;
    script.onerror = () => reject(new Error("Failed to load Google sign-in script."));
    document.head.appendChild(script);
  });
}

export async function connectGoogleDrive({ switchAccount = false } = {}) {
  await loadGisScript();

  return new Promise((resolve, reject) => {
    tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: DRIVE_SCOPE,
      callback: async response => {
        if (response.error) {
          reject(new Error(response.error_description || response.error));
          return;
        }
        driveAccessToken = response.access_token;
        try {
          const info = await getDriveQuotaInfo();
          connectedAccountEmail = info.emailAddress;
          resolve(info);
        } catch (err) {
          reject(err);
        }
      }
    });

    tokenClient.requestAccessToken({
      prompt: switchAccount ? "select_account consent" : "consent"
    });
  });
}

export function isDriveConnected() {
  return Boolean(driveAccessToken);
}

export function getConnectedDriveEmail() {
  return connectedAccountEmail || "";
}

async function driveRequest(url, options = {}) {
  if (!driveAccessToken) {
    throw new Error("Google Drive is not connected. Click Connect Drive first.");
  }

  const headers = new Headers(options.headers || {});
  headers.set("Authorization", `Bearer ${driveAccessToken}`);

  const response = await fetch(url, { ...options, headers });
  if (response.status === 204) return null;

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error?.message || `Google Drive request failed (${response.status})`);
  }
  return data;
}

export async function getDriveQuotaInfo() {
  const data = await driveRequest(
    "https://www.googleapis.com/drive/v3/about?fields=user(emailAddress,displayName),storageQuota(limit,usage,usageInDrive)"
  );

  const limitBytes = Number(data?.storageQuota?.limit || 0);
  const usedBytes = Number(data?.storageQuota?.usage || 0);
  const remainingBytes = Math.max(0, limitBytes - usedBytes);
  const percentUsed = limitBytes > 0
    ? Math.min(100, Math.round((usedBytes / limitBytes) * 100))
    : 0;

  return {
    emailAddress: data?.user?.emailAddress || "Connected Account",
    displayName: data?.user?.displayName || "",
    limitBytes,
    usedBytes,
    remainingBytes,
    percentUsed
  };
}

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 MB";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let idx = 0;
  let value = bytes;
  while (value >= 1024 && idx < units.length - 1) {
    value /= 1024;
    idx++;
  }
  return `${value.toFixed(idx >= 2 ? 2 : 0)} ${units[idx]}`;
}

async function ensureFolder(name, parentId = null) {
  const safeName = String(name || "General").trim().replace(/'/g, "\\'") || "General";
  const parentClause = parentId ? `'${parentId}' in parents and ` : "";
  const q = `${parentClause}name = '${safeName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;

  const existing = await driveRequest(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)`
  );

  if (Array.isArray(existing.files) && existing.files.length > 0) {
    return existing.files[0].id;
  }

  const created = await driveRequest("https://www.googleapis.com/drive/v3/files?fields=id,name", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: safeName,
      mimeType: "application/vnd.google-apps.folder",
      ...(parentId ? { parents: [parentId] } : {})
    })
  });

  return created.id;
}

export async function uploadFileToDrive({
  file,
  academyName = "Academy",
  className = "Class",
  subjectName = "General",
  onProgress = null
}) {
  if (!file) throw new Error("Please select a file.");

  const quota = await getDriveQuotaInfo();
  if (quota.limitBytes > 0 && file.size > quota.remainingBytes) {
    throw new Error(
      `Insufficient storage on ${quota.emailAddress} (${formatBytes(quota.remainingBytes)} remaining). Switch to another Google Drive account.`
    );
  }

  const rootFolderId = await ensureFolder("EduAdmin");
  const academyFolderId = await ensureFolder(academyName, rootFolderId);
  const classFolderId = await ensureFolder(className, academyFolderId);
  const subjectFolderId = await ensureFolder(subjectName, classFolderId);

  const metadata = {
    name: file.name,
    parents: [subjectFolderId]
  };

  const formData = new FormData();
  formData.append(
    "metadata",
    new Blob([JSON.stringify(metadata)], { type: "application/json" })
  );
  formData.append("file", file);

  const uploadedFile = await new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(
      "POST",
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,size"
    );
    xhr.setRequestHeader("Authorization", `Bearer ${driveAccessToken}`);

    xhr.upload.onprogress = event => {
      if (event.lengthComputable && typeof onProgress === "function") {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(JSON.parse(xhr.responseText));
      } else {
        reject(new Error(`Google Drive upload failed (${xhr.status})`));
      }
    };

    xhr.onerror = () => reject(new Error("Network error while uploading to Google Drive."));
    xhr.send(formData);
  });

  // Set public read permission ("anyone with the link")
  await driveRequest(
    `https://www.googleapis.com/drive/v3/files/${uploadedFile.id}/permissions`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: "reader", type: "anyone" })
    }
  );

  const updatedQuota = await getDriveQuotaInfo();

  return {
    driveFileId: uploadedFile.id,
    fileName: uploadedFile.name,
    mimeType: uploadedFile.mimeType || file.type || "application/octet-stream",
    fileSize: Number(uploadedFile.size || file.size || 0),
    previewUrl: `https://drive.google.com/file/d/${uploadedFile.id}/preview`,
    imageUrl: `https://lh3.googleusercontent.com/d/${uploadedFile.id}`,
    driveAccount: updatedQuota.emailAddress,
    quota: updatedQuota
  };
}

export async function deleteDriveFile(driveFileId) {
  if (!driveFileId) return;
  await driveRequest(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(driveFileId)}`, {
    method: "DELETE"
  });
}