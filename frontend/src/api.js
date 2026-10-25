const BASE = import.meta.env.VITE_API_URL || "[localhost](http://localhost:5000/api)";

// Session storage avoids persistent tokens after the browser session closes.
// For production, an HttpOnly-cookie session is a further hardening option.
export const getToken = () => sessionStorage.getItem("hcm_token");
export const saveToken = token => sessionStorage.setItem("hcm_token", token);
export const clearToken = () => sessionStorage.removeItem("hcm_token");

export async function api(path, { method = "GET", body } = {}) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {})
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {})
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.message || "Request failed.");
    error.status = response.status;
    error.details = data.details;
    error.data = data;
    throw error;
  }
  return data;
}

export async function download(path, filename) {
  const response = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${getToken()}` }
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || "Download failed.");
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function qs(values) {
  const query = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => {
    if (value !== "" && value !== undefined && value !== null) {
      query.set(key, value);
    }
  });
  const text = query.toString();
  return text ? `?${text}` : "";
}
