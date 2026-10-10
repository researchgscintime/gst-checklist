const params = new URLSearchParams(window.location.search);
const reviewId = params.get("id");

if (!reviewId) {
  document.body.innerHTML = "<main><p>No checklist specified. <a href='/index.html'>Go back</a>.</p></main>";
  throw new Error("Missing review id");
}

const areasContainer = document.getElementById("areasContainer");
const titleInput = document.getElementById("titleInput");
const globalSaveIndicator = document.getElementById("globalSaveIndicator");
const saveBtn = document.getElementById("saveBtn");
const overallBar = document.getElementById("overallBar");
const overallLabel = document.getElementById("overallLabel");
const filterBox = document.getElementById("filterBox");

const FIELD_LABELS = { reviewer: "Reviewer/Preparer's Comments", director: "Director's Comment", client: "Client's Feedback" };
const FIELDS = ["reviewer", "director", "client"];

let template = null;
let review = null;
let areas = []; // areas applicable to this review's month (or all, for legacy reviews)
let totalFields = 0;

function setIndicator(el, state, text) {
  el.className = `save-indicator ${state}`;
  el.textContent = text;
}

async function load() {
  [template, review] = await Promise.all([api.getChecklistTemplate(), api.getReview(reviewId)]);
  document.getElementById("entityName").textContent = review.entity ? review.entity.name : "Checklist";
  document.getElementById("backLink").href = review.entity ? `/entity.html?id=${review.entity.id}` : "/index.html";
  document.title = `${review.title} — GST Review Checklist`;
  document.getElementById("exportLink").href = `/api/reviews/${reviewId}/export`;
  titleInput.value = review.title;

  const periodBadge = document.getElementById("periodBadge");
  if (review.month && review.financialYear) {
    periodBadge.textContent = `${review.month} · FY ${review.financialYear}`;
    periodBadge.classList.remove("hidden");
  }

  // Areas tagged "Every Month" always apply; month-specific areas only show
  // up when this checklist's period matches (an area's month can be a
  // "/"-separated list, e.g. "March / September"). The month's own areas
  // are listed first, with the "Every Month" ones below. Legacy checklists
  // created before period selection existed (no month set) show everything.
  if (review.month) {
    const monthAreas = template.areas.filter(
      (a) => a.month !== "Every Month" && a.month.split("/").map((m) => m.trim()).includes(review.month)
    );
    const everyMonthAreas = template.areas.filter((a) => a.month === "Every Month");
    areas = [...monthAreas, ...everyMonthAreas];
  } else {
    areas = template.areas;
  }

  totalFields = areas.reduce((sum, a) => sum + a.items.length, 0) * FIELDS.length;

  renderAreas();
  updateOverallProgress();
}

function areaCompletion(area) {
  let filled = 0;
  for (const item of area.items) {
    const answer = (review.answers && review.answers[item.itemId]) || {};
    for (const f of FIELDS) if ((answer[f] || "").trim()) filled += 1;
  }
  return { filled, total: area.items.length * FIELDS.length };
}

function renderAreas() {
  areasContainer.innerHTML = "";
  if (areas.length === 0) {
    areasContainer.innerHTML = `<div class="empty-state">No checklist areas apply to this period.</div>`;
    return;
  }
  areas.forEach((area, idx) => {
    const { filled, total } = areaCompletion(area);
    const block = document.createElement("div");
    block.className = "area-block card";
    block.dataset.areaId = area.areaId;
    if (idx === 0) block.classList.add("open");

    const header = document.createElement("div");
    header.className = "area-header";
    header.innerHTML = `
      <span class="chevron">&#9656;</span>
      <h3>${escapeHtml(area.name)}</h3>
      ${area.month ? `<span class="badge">${escapeHtml(area.month)}</span>` : ""}
      <span class="count">${filled}/${total}</span>
    `;
    header.addEventListener("click", () => block.classList.toggle("open"));
    block.appendChild(header);

    const itemsWrap = document.createElement("div");
    itemsWrap.className = "area-items";

    for (const item of area.items) {
      const answer = (review.answers && review.answers[item.itemId]) || {};
      const itemRow = document.createElement("div");
      itemRow.className = "item-row";
      itemRow.dataset.itemId = item.itemId;
      itemRow.dataset.searchText = (area.name + " " + item.question).toLowerCase();

      const questionHtml = `${item.sn != null ? `<span class="item-sn">${escapeHtml(item.sn)}.</span>` : ""}${escapeHtml(item.question)}`;
      itemRow.innerHTML = `
        <div class="item-question">${questionHtml}</div>
        <div class="answer-grid">
          ${FIELDS.map((f) => `
            <div class="answer-cell ${f}">
              <label>${FIELD_LABELS[f]}</label>
              <textarea data-item-id="${item.itemId}" data-field="${f}">${escapeHtml(answer[f] || "")}</textarea>
              <div class="attachment-row" data-item-id="${item.itemId}" data-field="${f}">${attachmentRowHtml(item.itemId, f)}</div>
            </div>
          `).join("")}
        </div>
      `;
      itemsWrap.appendChild(itemRow);
    }

    block.appendChild(itemsWrap);
    areasContainer.appendChild(block);
  });

  areasContainer.querySelectorAll("textarea").forEach((ta) => {
    ta.addEventListener("input", () => scheduleSave(ta));
  });
  areasContainer.querySelectorAll(".attachment-row").forEach(wireAttachmentRow);
}

function attachmentsFor(itemId, field) {
  return (review.attachments || []).filter((a) => a.itemId === itemId && a.field === field);
}

function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / 1024 / 1024).toFixed(1) + " MB";
}

function attachmentRowHtml(itemId, field) {
  const chips = attachmentsFor(itemId, field).map((a) => {
    const url = `/api/reviews/${reviewId}/attachments/${a.id}`;
    return `
      <span class="attachment-chip" data-attachment-id="${a.id}">
        <a href="${url}" target="_blank" rel="noopener" title="${escapeHtml(a.originalName)} (${formatFileSize(a.size)})">${escapeHtml(a.originalName)}</a>
        <button type="button" data-action="remove-attachment" title="Remove attachment">&times;</button>
      </span>
    `;
  }).join("");
  return `${chips}<label class="attach-btn"><span class="attach-label-text">\u{1F4CE} Attach</span><input type="file" data-item-id="${itemId}" data-field="${field}" /></label>`;
}

function wireAttachmentRow(rowEl) {
  const input = rowEl.querySelector('input[type="file"]');
  if (input) input.addEventListener("change", () => handleAttachmentUpload(input));
  rowEl.querySelectorAll('[data-action="remove-attachment"]').forEach((btn) => {
    btn.addEventListener("click", () => handleAttachmentDelete(btn));
  });
}

function refreshAttachmentRow(itemId, field) {
  const rowEl = areasContainer.querySelector(
    `.attachment-row[data-item-id="${itemId}"][data-field="${field}"]`
  );
  if (!rowEl) return;
  rowEl.innerHTML = attachmentRowHtml(itemId, field);
  wireAttachmentRow(rowEl);
}

async function handleAttachmentUpload(input) {
  const file = input.files[0];
  if (!file) return;
  const itemId = input.dataset.itemId;
  const field = input.dataset.field;
  const labelText = input.closest(".attach-btn").querySelector(".attach-label-text");
  const originalText = labelText.textContent;
  labelText.textContent = "Uploading…";
  input.disabled = true;
  try {
    const attachment = await api.uploadAttachment(reviewId, itemId, field, file);
    if (!review.attachments) review.attachments = [];
    review.attachments.push(attachment);
    refreshAttachmentRow(itemId, field);
  } catch (err) {
    alert("Could not attach file: " + err.message);
    labelText.textContent = originalText;
    input.disabled = false;
    input.value = "";
  }
}

async function handleAttachmentDelete(btn) {
  const chip = btn.closest(".attachment-chip");
  const row = btn.closest(".attachment-row");
  const attachmentId = chip.dataset.attachmentId;
  const itemId = row.dataset.itemId;
  const field = row.dataset.field;
  if (!confirm("Remove this attachment? This cannot be undone.")) return;
  try {
    await api.deleteAttachment(reviewId, attachmentId);
    review.attachments = (review.attachments || []).filter((a) => a.id !== attachmentId);
    refreshAttachmentRow(itemId, field);
  } catch (err) {
    alert(err.message);
  }
}

function updateOverallProgress() {
  let filled = 0;
  for (const area of areas) {
    filled += areaCompletion(area).filled;
  }
  const percent = totalFields ? Math.round((filled / totalFields) * 100) : 0;
  overallBar.style.width = percent + "%";
  overallLabel.textContent = `${percent}% complete (${filled}/${totalFields})`;
}

function updateAreaCount(areaId) {
  const area = areas.find((a) => a.areaId === areaId);
  const { filled, total } = areaCompletion(area);
  const block = areasContainer.querySelector(`.area-block[data-area-id="${areaId}"] .count`);
  if (block) block.textContent = `${filled}/${total}`;
}

// Fields still autosave shortly after you stop typing, but every pending
// save is also tracked here so the Save button can flush it immediately
// on demand instead of waiting out the debounce.
const pendingFieldTimers = new Map(); // key -> timeoutId
const pendingFieldEntries = new Map(); // key -> {itemId, field, value, ta}
let pendingTitleTimer = null;
let pendingTitleValue = null;

async function commitField(key) {
  const entry = pendingFieldEntries.get(key);
  if (!entry) return;
  pendingFieldTimers.delete(key);
  pendingFieldEntries.delete(key);
  setIndicator(globalSaveIndicator, "saving", "Saving…");
  if (!review.answers[entry.itemId]) review.answers[entry.itemId] = {};
  review.answers[entry.itemId][entry.field] = entry.value;
  try {
    await api.saveAnswer(reviewId, entry.itemId, entry.field, entry.value);
    setIndicator(globalSaveIndicator, "saved", "All changes saved");
    const areaId = entry.ta.closest(".item-row").closest(".area-block").dataset.areaId;
    updateAreaCount(areaId);
    updateOverallProgress();
  } catch (err) {
    setIndicator(globalSaveIndicator, "error", "Save failed: " + err.message);
    pendingFieldEntries.set(key, entry); // keep it so a retry (Save button) can pick it up
    throw err;
  }
}

function scheduleSave(ta) {
  const itemId = ta.dataset.itemId;
  const field = ta.dataset.field;
  const key = `${itemId}:${field}`;
  pendingFieldEntries.set(key, { itemId, field, value: ta.value, ta });
  setIndicator(globalSaveIndicator, "saving", "Typing…");
  if (pendingFieldTimers.has(key)) clearTimeout(pendingFieldTimers.get(key));
  pendingFieldTimers.set(key, setTimeout(() => { commitField(key).catch(() => {}); }, 600));
}

async function commitTitle() {
  if (pendingTitleValue == null) return;
  const title = pendingTitleValue;
  pendingTitleTimer = null;
  pendingTitleValue = null;
  setIndicator(globalSaveIndicator, "saving", "Saving…");
  try {
    await api.renameReview(reviewId, title);
    setIndicator(globalSaveIndicator, "saved", "All changes saved");
    document.title = `${title} — GST Review Checklist`;
  } catch (err) {
    setIndicator(globalSaveIndicator, "error", "Save failed: " + err.message);
    pendingTitleValue = title;
    throw err;
  }
}

titleInput.addEventListener("input", () => {
  const title = titleInput.value.trim();
  if (!title) return;
  pendingTitleValue = title;
  setIndicator(globalSaveIndicator, "saving", "Typing…");
  if (pendingTitleTimer) clearTimeout(pendingTitleTimer);
  pendingTitleTimer = setTimeout(() => { commitTitle().catch(() => {}); }, 600);
});

saveBtn.addEventListener("click", async () => {
  saveBtn.disabled = true;
  saveBtn.textContent = "Saving…";

  for (const timer of pendingFieldTimers.values()) clearTimeout(timer);
  pendingFieldTimers.clear();
  if (pendingTitleTimer) {
    clearTimeout(pendingTitleTimer);
    pendingTitleTimer = null;
  }

  const jobs = [...pendingFieldEntries.keys()].map((key) => commitField(key));
  if (pendingTitleValue != null) jobs.push(commitTitle());

  const results = await Promise.allSettled(jobs);
  const failed = results.some((r) => r.status === "rejected");
  if (failed) {
    setIndicator(globalSaveIndicator, "error", "Some changes failed to save");
    saveBtn.textContent = "Retry save";
  } else {
    setIndicator(globalSaveIndicator, "saved", "All changes saved");
    saveBtn.textContent = "Saved ✓";
  }
  setTimeout(() => {
    saveBtn.textContent = "Save checklist";
    saveBtn.disabled = false;
  }, 1400);
});

document.getElementById("expandAllBtn").addEventListener("click", () => {
  areasContainer.querySelectorAll(".area-block").forEach((b) => b.classList.add("open"));
});
document.getElementById("collapseAllBtn").addEventListener("click", () => {
  areasContainer.querySelectorAll(".area-block").forEach((b) => b.classList.remove("open"));
});

filterBox.addEventListener("input", () => {
  const q = filterBox.value.trim().toLowerCase();
  areasContainer.querySelectorAll(".area-block").forEach((block) => {
    let anyMatch = false;
    block.querySelectorAll(".item-row").forEach((row) => {
      const match = !q || row.dataset.searchText.includes(q);
      row.classList.toggle("hidden", !match);
      if (match) anyMatch = true;
    });
    block.classList.toggle("hidden", !anyMatch);
    if (q && anyMatch) block.classList.add("open");
  });
});

document.getElementById("deleteReviewBtn").addEventListener("click", async () => {
  if (!confirm(`Delete checklist "${review.title}"? This cannot be undone.`)) return;
  try {
    await api.deleteReview(reviewId);
    window.location.href = review.entity ? `/entity.html?id=${review.entity.id}` : "/index.html";
  } catch (err) {
    alert(err.message);
  }
});

load().catch((err) => {
  areasContainer.innerHTML = `<div class="empty-state" style="color:var(--danger)">Failed to load checklist: ${escapeHtml(err.message)}</div>`;
});
