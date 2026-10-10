let allEntities = [];
let editingEntityId = null;
let currentUser = null;
let managers = [];

const entityGrid = document.getElementById("entityGrid");
const emptyState = document.getElementById("emptyState");
const searchBox = document.getElementById("searchBox");
const ownerFilter = document.getElementById("ownerFilter");
const entityDialog = document.getElementById("entityDialog");
  const entityForm = document.getElementById("entityForm");
const entityFormError = document.getElementById("entityFormError");
const entityOwnerField = document.getElementById("entityOwnerField");
const entityOwnerSelect = document.getElementById("entityOwner");
const importOwnerSelect = document.getElementById("importOwnerSelect");
const importSummary = document.getElementById("importSummary");

function managerOptionsHtml(includeUnassignedLabel) {
  return `<option value="">${includeUnassignedLabel}</option>` +
    managers.map((m) => `<option value="${m.id}">${escapeHtml(m.name)}</option>`).join("");
}

async function setupAdminControls() {
  managers = await api.users.list();

  ownerFilter.innerHTML = `<option value="">All entities</option><option value="unassigned">Unassigned</option>` +
    managers.map((m) => `<option value="${m.id}">${escapeHtml(m.name)}</option>`).join("");
  ownerFilter.classList.remove("hidden");
  ownerFilter.addEventListener("change", renderEntities);

  importOwnerSelect.innerHTML = managerOptionsHtml("Assign to: Unassigned");
  importOwnerSelect.classList.remove("hidden");

  entityOwnerSelect.innerHTML = managerOptionsHtml("Unassigned");
  entityOwnerField.classList.remove("hidden");
}

async function loadEntities() {
  allEntities = await api.getEntities();
  renderEntities();
}

function renderEntities() {
  const query = searchBox.value.trim().toLowerCase();
  const ownerValue = currentUser.role === "admin" ? ownerFilter.value : "";
  const filtered = allEntities.filter((e) => {
    if (query && !e.name.toLowerCase().includes(query) && !e.gstNumber.toLowerCase().includes(query)) return false;
    if (ownerValue === "unassigned") return !e.ownerId;
    if (ownerValue) return e.ownerId === ownerValue;
    return true;
  });

  entityGrid.innerHTML = "";
  emptyState.classList.toggle("hidden", allEntities.length > 0);

  if (allEntities.length > 0 && filtered.length === 0) {
    entityGrid.innerHTML = `<div class="empty-state" style="grid-column:1/-1">No entities match your search/filter.</div>`;
    return;
  }

  for (const entity of filtered) {
    const card = document.createElement("div");
    card.className = "card entity-card";
    card.innerHTML = `
      <h3>${escapeHtml(entity.name)}</h3>
      <div class="gst">${escapeHtml(entity.gstNumber)}</div>
      ${currentUser.role === "admin" ? `<div class="owner-badge">${entity.ownerName ? escapeHtml(entity.ownerName) : "Unassigned"}</div>` : ""}
      <div class="meta">${entity.reviewCount} checklist${entity.reviewCount === 1 ? "" : "s"}${entity.lastReviewAt ? " · last updated " + formatDate(entity.lastReviewAt) : ""}</div>
      <div class="progress-wrap">
        <div class="progress-bar"><div style="width:${entity.currentMonthPercent}%"></div></div>
        <div class="progress-label">${escapeHtml(entity.currentMonthLabel)}: ${entity.currentMonthPercent}% complete${entity.hasCurrentMonthReview ? "" : " (not started)"}</div>
      </div>
      <div class="actions">
        <button class="ghost" data-action="edit" title="Edit entity">Edit</button>
        <button class="ghost" data-action="delete" title="Delete entity">Delete</button>
      </div>
    `;
    card.addEventListener("click", (e) => {
      if (e.target.closest("[data-action]")) return;
      window.location.href = `/entity.html?id=${entity.id}`;
    });
    card.querySelector('[data-action="edit"]').addEventListener("click", (e) => {
      e.stopPropagation();
      openEntityDialog(entity);
    });
    card.querySelector('[data-action="delete"]').addEventListener("click", (e) => {
      e.stopPropagation();
      deleteEntity(entity);
    });
    entityGrid.appendChild(card);
  }
}

function openEntityDialog(entity) {
  editingEntityId = entity ? entity.id : null;
  document.getElementById("entityDialogTitle").textContent = entity ? "Edit entity" : "Add entity";
  document.getElementById("entityName").value = entity ? entity.name : "";
  document.getElementById("entityGst").value = entity ? entity.gstNumber : "";
  if (currentUser.role === "admin") {
    entityOwnerSelect.value = entity && entity.ownerId ? entity.ownerId : "";
  }
  entityFormError.classList.add("hidden");
  entityDialog.showModal();
  document.getElementById("entityName").focus();
}

document.getElementById("addEntityBtn").addEventListener("click", () => openEntityDialog(null));
document.getElementById("entityCancelBtn").addEventListener("click", () => entityDialog.close());

async function deleteEntity(entity) {
  const reviewWarning = entity.reviewCount > 0
    ? `\n\nThis will also permanently delete ${entity.reviewCount} saved checklist${entity.reviewCount === 1 ? "" : "s"} for this entity.`
    : "";
  if (!confirm(`Delete "${entity.name}" (${entity.gstNumber})?${reviewWarning}`)) return;
  try {
    await api.deleteEntity(entity.id);
    await loadEntities();
  } catch (err) {
    alert(err.message);
  }
}

entityForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = document.getElementById("entityName").value.trim();
  const gstNumber = document.getElementById("entityGst").value.trim().toUpperCase();
  const ownerId = currentUser.role === "admin" ? (entityOwnerSelect.value || null) : undefined;
  entityFormError.classList.add("hidden");
  try {
    if (editingEntityId) {
      await api.updateEntity(editingEntityId, name, gstNumber, ownerId);
    } else {
      await api.createEntity(name, gstNumber, ownerId);
    }
    entityDialog.close();
    await loadEntities();
  } catch (err) {
    entityFormError.textContent = err.message;
    entityFormError.classList.remove("hidden");
  }
});

searchBox.addEventListener("input", renderEntities);

const importBtn = document.getElementById("importBtn");
const importFile = document.getElementById("importFile");
importBtn.addEventListener("click", () => importFile.click());
importFile.addEventListener("change", async () => {
  const file = importFile.files[0];
  if (!file) return;
  const ownerId = currentUser.role === "admin" ? importOwnerSelect.value : undefined;
  importBtn.disabled = true;
  importSummary.innerHTML = `<div class="card" style="padding:14px 18px;margin-bottom:16px;">Importing entities...</div>`;
  try {
    const result = await api.importEntities(file, ownerId);
    const skippedHtml = result.skipped.length
      ? `<ul style="margin:8px 0 0 18px;padding:0;">${result.skipped
          .map((s) => `<li>Row ${s.row}: ${escapeHtml(s.reason)}</li>`)
          .join("")}</ul>`
      : "";
    importSummary.innerHTML = `<div class="card" style="padding:14px 18px;margin-bottom:16px;">
      <strong>${result.created}</strong> entit${result.created === 1 ? "y" : "ies"} imported.
      ${result.skipped.length ? `<br/><span style="color:var(--danger)">${result.skipped.length} row(s) skipped:</span>${skippedHtml}` : ""}
    </div>`;
    await loadEntities();
  } catch (err) {
    importSummary.innerHTML = `<div class="card" style="padding:14px 18px;margin-bottom:16px;color:var(--danger)">Import failed: ${escapeHtml(err.message)}</div>`;
  } finally {
    importBtn.disabled = false;
    importFile.value = "";
  }
});

async function init() {
  currentUser = await api.auth.me();
  if (currentUser.role === "admin") {
    await setupAdminControls();
  }
  await loadEntities();
}

init().catch((err) => {
  entityGrid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;color:var(--danger)">Failed to load entities: ${escapeHtml(err.message)}</div>`;
});
