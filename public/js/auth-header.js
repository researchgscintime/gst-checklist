(async function initAuthHeader() {
  let user;
  try {
    user = await api.auth.me();
  } catch {
    return; // apiRequest already redirects to /login.html on 401
  }

  const topbar = document.querySelector("header.topbar");
  if (!topbar) return;

  const session = document.createElement("div");
  session.className = "session";
  session.innerHTML = `
    ${user.role === "admin" ? `<a href="/users.html">Manage users</a>` : ""}
    <span class="session-user">${escapeHtml(user.name)} <span class="role-badge">${user.role}</span></span>
    <button type="button" class="ghost" id="logoutBtn">Log out</button>
  `;
  topbar.appendChild(session);

  document.getElementById("logoutBtn").addEventListener("click", async () => {
    try { await api.auth.logout(); } catch { /* ignore */ }
    window.location.href = "/login.html";
  });
})();
