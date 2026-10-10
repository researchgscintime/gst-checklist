async function apiRequest(url, options = {}) {
  const res = await fetch(url, options);
  if (res.status === 204) return null;
  let body = null;
  const text = await res.text();
  if (text) {
    try { body = JSON.parse(text); } catch { body = text; }
  }
  // Any logged-out API call (except the login attempt itself) bounces to
  // the login page - this is the single auth guard for every page.
  if (res.status === 401 && url !== "/api/auth/login" && !window.location.pathname.endsWith("/login.html")) {
    window.location.href = "/login.html";
    return new Promise(() => {}); // page is navigating away; never resolve
  }
  if (!res.ok) {
    const message = (body && body.error) || `Request failed (${res.status})`;
    throw new Error(message);
  }
  return body;
}

const api = {
  auth: {
    login: (username, password) =>
      apiRequest("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      }),
    logout: () => apiRequest("/api/auth/logout", { method: "POST" }),
    me: () => apiRequest("/api/auth/me"),
  },

  users: {
    list: () => apiRequest("/api/users"),
    create: (username, name, password) =>
      apiRequest("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, name, password }),
      }),
    update: (id, username, name, password) =>
      apiRequest(`/api/users/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, name, password }),
      }),
    remove: (id) => apiRequest(`/api/users/${id}`, { method: "DELETE" }),
  },

  getEntities: () => apiRequest("/api/entities"),
  createEntity: (name, gstNumber, ownerId) =>
    apiRequest("/api/entities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, gstNumber, ownerId }),
    }),
  updateEntity: (id, name, gstNumber, ownerId) =>
    apiRequest(`/api/entities/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, gstNumber, ownerId }),
    }),
  deleteEntity: (id) => apiRequest(`/api/entities/${id}`, { method: "DELETE" }),
  importEntities: (file, ownerId) => {
    const formData = new FormData();
    formData.append("file", file);
    if (ownerId) formData.append("ownerId", ownerId);
    return apiRequest("/api/entities/import", { method: "POST", body: formData });
  },

  getChecklistTemplate: () => apiRequest("/api/checklist-template"),

  getReviews: (entityId) => apiRequest(`/api/entities/${entityId}/reviews`),
  openReviewPeriod: (entityId, month, financialYear) =>
    apiRequest(`/api/entities/${entityId}/reviews/period`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ month, financialYear }),
    }),
  getReview: (id) => apiRequest(`/api/reviews/${id}`),
  renameReview: (id, title) =>
    apiRequest(`/api/reviews/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    }),
  deleteReview: (id) => apiRequest(`/api/reviews/${id}`, { method: "DELETE" }),
  saveAnswer: (id, itemId, field, value) =>
    apiRequest(`/api/reviews/${id}/answer`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId, field, value }),
    }),

  uploadAttachment: (reviewId, itemId, field, file) => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("itemId", itemId);
    formData.append("field", field);
    return apiRequest(`/api/reviews/${reviewId}/attachments`, { method: "POST", body: formData });
  },
  deleteAttachment: (reviewId, attachmentId) =>
    apiRequest(`/api/reviews/${reviewId}/attachments/${attachmentId}`, { method: "DELETE" }),
};

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function formatDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) +
    " " + d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}
