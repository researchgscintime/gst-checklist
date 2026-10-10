let editingUserId = null;

const userList = document.getElementById("userList");
const emptyState = document.getElementById("emptyState");
const userDialog = document.getElementById("userDialog");
const userForm = document.getElementById("userForm");
const userFormError = document.getElementById("userFormError");
const userPasswordHint = document.getElementById("userPasswordHint");

async function loadUsers() {
  const users = await api.users.list();
  renderUsers(users);
}

function renderUsers(users) {
  userList.innerHTML = "";
  emptyState.classList.toggle("hidden", users.length > 0);

  for (const u of users) {
    const row = document.createElement("div");
    row.className = "card review-row";
    row.innerHTML = `
      <div class="title">${escapeHtml(u.name)}</div>
      <span class="period-badge">${escapeHtml(u.username)}</span>
      <div class="dates">${u.entityCount} entit${u.entityCount === 1 ? "y" : "ies"}</div>
      <div class="actions" style="display:flex;gap:4px;">
        <button class="ghost" data-action="edit" title="Edit">Edit</button>
        <button class="ghost" data-action="delete" title="Delete">Delete</button>
      </div>
    `;
    row.querySelector('[data-action="edit"]').addEventListener("click", () => openUserDialog(u));
    row.querySelector('[data-action="delete"]').addEventListener("click", () => deleteUser(u));
    userList.appendChild(row);
  }
}

function openUserDialog(user) {
  editingUserId = user ? user.id : null;
  document.getElementById("userDialogTitle").textContent = user ? "Edit manager" : "Add manager";
  document.getElementById("userUsername").value = user ? user.username : "";
  document.getElementById("userName").value = user ? user.name : "";
  document.getElementById("userPassword").value = "";
  document.getElementById("userPassword").required = !user;
  userPasswordHint.textContent = user
    ? "Leave blank to keep the current password."
    : "At least 6 characters.";
  userFormError.classList.add("hidden");
  userDialog.showModal();
  document.getElementById("userUsername").focus();
}

document.getElementById("addUserBtn").addEventListener("click", () => openUserDialog(null));
document.getElementById("userCancelBtn").addEventListener("click", () => userDialog.close());

async function deleteUser(user) {
  const warning = user.entityCount > 0
    ? `\n\nTheir ${user.entityCount} entit${user.entityCount === 1 ? "y" : "ies"} will become unassigned, not deleted.`
    : "";
  if (!confirm(`Delete manager "${user.name}" (${user.username})?${warning}`)) return;
  try {
    await api.users.remove(user.id);
    await loadUsers();
  } catch (err) {
    alert(err.message);
  }
}

userForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const username = document.getElementById("userUsername").value.trim();
  const name = document.getElementById("userName").value.trim();
  const password = document.getElementById("userPassword").value;
  userFormError.classList.add("hidden");
  try {
    if (editingUserId) {
      await api.users.update(editingUserId, username, name, password);
    } else {
      await api.users.create(username, name, password);
    }
    userDialog.close();
    await loadUsers();
  } catch (err) {
    userFormError.textContent = err.message;
    userFormError.classList.remove("hidden");
  }
});

api.auth.me().then((user) => {
  if (user.role !== "admin") {
    window.location.href = "/index.html";
    return;
  }
  loadUsers().catch((err) => {
    userList.innerHTML = `<div class="empty-state" style="color:var(--danger)">Failed to load: ${escapeHtml(err.message)}</div>`;
  });
});
