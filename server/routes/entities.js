const express = require("express");
const multer = require("multer");
const crypto = require("crypto");
const path = require("path");
const ExcelJS = require("exceljs");
const { withStore, readStore } = require("../db");
const { deleteAttachmentsForReview } = require("../attachments");
const { completionStats, currentPeriod } = require("../completion");
const { canAccessEntity } = require("../auth");
const { normalizeGst, validateEntityInput } = require("../entityValidation");

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// Resolves the ownerId a new/imported entity should get, from the
// requesting user's role and an optional target manager id in the body.
function resolveOwnerId(user, requestedOwnerId, store) {
  if (user.role !== "admin") return user.id;
  const cleaned = String(requestedOwnerId || "").trim();
  if (!cleaned) return null;
  const manager = store.users.find((u) => u.id === cleaned && u.role === "manager");
  if (!manager) {
    const err = new Error("Selected manager not found.");
    err.status = 400;
    throw err;
  }
  return manager.id;
}

// GET /api/entities - list entities visible to the current user, with review counts
router.get("/", async (req, res) => {
  const store = await readStore();
  const { month: currentMonth, financialYear: currentFY } = currentPeriod();
  const managerNames = new Map(store.users.filter((u) => u.role === "manager").map((u) => [u.id, u.name]));
  const visible = req.user.role === "admin"
    ? store.entities
    : store.entities.filter((e) => e.ownerId === req.user.id);

  const entities = visible.map((e) => {
    const reviews = store.reviews.filter((r) => r.entityId === e.id);
    const lastReview = reviews.slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
    const currentMonthReview = reviews.find(
      (r) => r.month === currentMonth && r.financialYear === currentFY
    );
    return {
      ...e,
      reviewCount: reviews.length,
      lastReviewAt: lastReview ? lastReview.updatedAt : null,
      currentMonthLabel: currentMonth,
      currentMonthPercent: currentMonthReview ? completionStats(currentMonthReview).percent : 0,
      hasCurrentMonthReview: Boolean(currentMonthReview),
      ownerName: e.ownerId ? (managerNames.get(e.ownerId) || null) : null,
    };
  });
  entities.sort((a, b) => a.name.localeCompare(b.name));
  res.json(entities);
});

// POST /api/entities - create one entity
router.post("/", express.json(), async (req, res) => {
  const { name, gstNumber, ownerId } = req.body || {};
  const result = validateEntityInput(name, gstNumber);
  if (result.error) return res.status(400).json({ error: result.error });

  try {
    const entity = await withStore((store) => {
      if (store.entities.some((e) => e.gstNumber === result.cleanGst)) {
        const err = new Error(`An entity with GST number ${result.cleanGst} already exists.`);
        err.status = 409;
        throw err;
      }
      const now = new Date().toISOString();
      const entity = {
        id: crypto.randomUUID(),
        name: result.cleanName,
        gstNumber: result.cleanGst,
        ownerId: resolveOwnerId(req.user, ownerId, store),
        createdAt: now,
        updatedAt: now,
      };
      store.entities.push(entity);
      return entity;
    });
    res.status(201).json(entity);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// PUT /api/entities/:id - update name/gst (and, for admins, reassign owner)
router.put("/:id", express.json(), async (req, res) => {
  const { name, gstNumber, ownerId } = req.body || {};
  const result = validateEntityInput(name, gstNumber);
  if (result.error) return res.status(400).json({ error: result.error });

  try {
    const entity = await withStore((store) => {
      const existing = store.entities.find((e) => e.id === req.params.id);
      if (!existing) {
        const err = new Error("Entity not found.");
        err.status = 404;
        throw err;
      }
      if (!canAccessEntity(req.user, existing)) {
        const err = new Error("You don't have access to this entity.");
        err.status = 403;
        throw err;
      }
      const dup = store.entities.find(
        (e) => e.gstNumber === result.cleanGst && e.id !== req.params.id
      );
      if (dup) {
        const err = new Error(`Another entity already uses GST number ${result.cleanGst}.`);
        err.status = 409;
        throw err;
      }
      existing.name = result.cleanName;
      existing.gstNumber = result.cleanGst;
      if (req.user.role === "admin" && ownerId !== undefined) {
        existing.ownerId = resolveOwnerId(req.user, ownerId, store);
      }
      existing.updatedAt = new Date().toISOString();
      return existing;
    });
    res.json(entity);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// DELETE /api/entities/:id - delete entity and its reviews
router.delete("/:id", async (req, res) => {
  try {
    const removedReviews = await withStore((store) => {
      const idx = store.entities.findIndex((e) => e.id === req.params.id);
      if (idx === -1) {
        const err = new Error("Entity not found.");
        err.status = 404;
        throw err;
      }
      if (!canAccessEntity(req.user, store.entities[idx])) {
        const err = new Error("You don't have access to this entity.");
        err.status = 403;
        throw err;
      }
      store.entities.splice(idx, 1);
      const removed = store.reviews.filter((r) => r.entityId === req.params.id);
      store.reviews = store.reviews.filter((r) => r.entityId !== req.params.id);
      return removed;
    });
    removedReviews.forEach(deleteAttachmentsForReview);
    res.status(204).end();
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// GET /api/entities/import/template - download the bulk import template
router.get("/import/template", (req, res) => {
  const filePath = path.join(__dirname, "..", "..", "public", "templates", "entity_import_template.xlsx");
  res.download(filePath, "entity_import_template.xlsx");
});

// POST /api/entities/import - bulk import entities from an uploaded xlsx file
router.post("/import", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded." });

  let workbook;
  try {
    workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(req.file.buffer);
  } catch (err) {
    return res.status(400).json({ error: "Could not read the uploaded file. Please upload a valid .xlsx file." });
  }

  const sheet = workbook.getWorksheet("Entities") || workbook.worksheets[0];
  if (!sheet) {
    return res.status(400).json({ error: "The uploaded file has no sheets." });
  }

  const rowsToImport = [];
  const skipped = [];

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // header row
    const nameCell = row.getCell(1).value;
    const gstCell = row.getCell(2).value;
    const name = nameCell ? String(nameCell).trim() : "";
    const gstNumber = normalizeGst(gstCell);
    if (!name && !gstNumber) return; // fully blank row, ignore silently

    const result = validateEntityInput(name, gstNumber);
    if (result.error) {
      skipped.push({ row: rowNumber, reason: result.error });
      return;
    }
    rowsToImport.push({ row: rowNumber, name: result.cleanName, gstNumber: result.cleanGst });
  });

  try {
    const outcome = await withStore((store) => {
      const ownerId = resolveOwnerId(req.user, req.body && req.body.ownerId, store);
      const created = [];
      const existingGst = new Set(store.entities.map((e) => e.gstNumber));
      const seenInFile = new Set();
      for (const r of rowsToImport) {
        if (existingGst.has(r.gstNumber)) {
          skipped.push({ row: r.row, reason: `GST number ${r.gstNumber} already exists in the system.` });
          continue;
        }
        if (seenInFile.has(r.gstNumber)) {
          skipped.push({ row: r.row, reason: `Duplicate GST number ${r.gstNumber} within the file.` });
          continue;
        }
        seenInFile.add(r.gstNumber);
        const now = new Date().toISOString();
        const entity = {
          id: crypto.randomUUID(),
          name: r.name,
          gstNumber: r.gstNumber,
          ownerId,
          createdAt: now,
          updatedAt: now,
        };
        store.entities.push(entity);
        created.push(entity);
      }
      return created;
    });
    res.json({ created: outcome.length, entities: outcome, skipped });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

module.exports = router;
