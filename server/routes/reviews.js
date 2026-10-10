const express = require("express");
const crypto = require("crypto");
const ExcelJS = require("exceljs");
const { withStore, readStore } = require("../db");
const {
  template,
  isValidItemId,
  isValidMonth,
  areasForMonth,
  FY_MONTHS,
} = require("../checklistTemplate");
const { deleteAttachmentsForReview } = require("../attachments");
const { completionStats, ANSWER_FIELDS } = require("../completion");
const { canAccessEntity } = require("../auth");

// Mounted at /api/entities/:entityId/reviews
const entityReviewsRouter = express.Router({ mergeParams: true });
// Mounted at /api/reviews
const reviewsRouter = express.Router();

const FY_REGEX = /^\d{4}-\d{2}$/;

entityReviewsRouter.get("/", async (req, res) => {
  const store = await readStore();
  const entity = store.entities.find((e) => e.id === req.params.entityId);
  if (!entity) return res.status(404).json({ error: "Entity not found." });
  if (!canAccessEntity(req.user, entity)) return res.status(403).json({ error: "You don't have access to this entity." });

  const reviews = store.reviews
    .filter((r) => r.entityId === req.params.entityId)
    .map((r) => ({
      id: r.id,
      entityId: r.entityId,
      title: r.title,
      month: r.month || null,
      financialYear: r.financialYear || null,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      ...completionStats(r),
    }))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  res.json({ entity, reviews, fyMonths: FY_MONTHS });
});

// POST /api/entities/:entityId/reviews/period - find or create the checklist
// for a given Month + FY. Selecting the same entity/month/FY again always
// returns the same checklist (with whatever was already saved on it).
entityReviewsRouter.post("/period", express.json(), async (req, res) => {
  const month = String((req.body && req.body.month) || "").trim();
  const financialYear = String((req.body && req.body.financialYear) || "").trim();

  if (!isValidMonth(month)) {
    return res.status(400).json({ error: "Please select a valid month." });
  }
  if (!FY_REGEX.test(financialYear)) {
    return res.status(400).json({ error: "Please select a valid financial year." });
  }

  try {
    const { review, created } = await withStore((store) => {
      const entity = store.entities.find((e) => e.id === req.params.entityId);
      if (!entity) {
        const err = new Error("Entity not found.");
        err.status = 404;
        throw err;
      }
      if (!canAccessEntity(req.user, entity)) {
        const err = new Error("You don't have access to this entity.");
        err.status = 403;
        throw err;
      }
      const existing = store.reviews.find(
        (r) => r.entityId === entity.id && r.month === month && r.financialYear === financialYear
      );
      if (existing) return { review: existing, created: false };

      const now = new Date().toISOString();
      const review = {
        id: crypto.randomUUID(),
        entityId: entity.id,
        title: `${month} ${financialYear}`,
        month,
        financialYear,
        createdAt: now,
        updatedAt: now,
        answers: {},
      };
      store.reviews.push(review);
      return { review, created: true };
    });
    res.status(created ? 201 : 200).json(review);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

reviewsRouter.get("/:id", async (req, res) => {
  const store = await readStore();
  const review = store.reviews.find((r) => r.id === req.params.id);
  if (!review) return res.status(404).json({ error: "Checklist not found." });
  const entity = store.entities.find((e) => e.id === review.entityId);
  if (!canAccessEntity(req.user, entity)) return res.status(403).json({ error: "You don't have access to this entity." });
  res.json({ ...review, entity });
});

reviewsRouter.put("/:id", express.json(), async (req, res) => {
  const title = String((req.body && req.body.title) || "").trim();
  if (!title) return res.status(400).json({ error: "Checklist title is required." });
  try {
    const review = await withStore((store) => {
      const review = store.reviews.find((r) => r.id === req.params.id);
      if (!review) {
        const err = new Error("Checklist not found.");
        err.status = 404;
        throw err;
      }
      const entity = store.entities.find((e) => e.id === review.entityId);
      if (!canAccessEntity(req.user, entity)) {
        const err = new Error("You don't have access to this entity.");
        err.status = 403;
        throw err;
      }
      review.title = title;
      review.updatedAt = new Date().toISOString();
      return review;
    });
    res.json(review);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

reviewsRouter.patch("/:id/answer", express.json(), async (req, res) => {
  const { itemId, field, value } = req.body || {};
  if (!isValidItemId(itemId)) return res.status(400).json({ error: "Unknown checklist item." });
  if (!ANSWER_FIELDS.includes(field)) return res.status(400).json({ error: "Unknown answer field." });

  try {
    const result = await withStore((store) => {
      const review = store.reviews.find((r) => r.id === req.params.id);
      if (!review) {
        const err = new Error("Checklist not found.");
        err.status = 404;
        throw err;
      }
      const entity = store.entities.find((e) => e.id === review.entityId);
      if (!canAccessEntity(req.user, entity)) {
        const err = new Error("You don't have access to this entity.");
        err.status = 403;
        throw err;
      }
      if (!review.answers[itemId]) review.answers[itemId] = {};
      review.answers[itemId][field] = String(value || "");
      review.updatedAt = new Date().toISOString();
      return { updatedAt: review.updatedAt };
    });
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

reviewsRouter.delete("/:id", async (req, res) => {
  try {
    const removed = await withStore((store) => {
      const idx = store.reviews.findIndex((r) => r.id === req.params.id);
      if (idx === -1) {
        const err = new Error("Checklist not found.");
        err.status = 404;
        throw err;
      }
      const entity = store.entities.find((e) => e.id === store.reviews[idx].entityId);
      if (!canAccessEntity(req.user, entity)) {
        const err = new Error("You don't have access to this entity.");
        err.status = 403;
        throw err;
      }
      return store.reviews.splice(idx, 1)[0];
    });
    deleteAttachmentsForReview(removed);
    res.status(204).end();
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

reviewsRouter.get("/:id/export", async (req, res) => {
  const store = await readStore();
  const review = store.reviews.find((r) => r.id === req.params.id);
  if (!review) return res.status(404).json({ error: "Checklist not found." });
  const entity = store.entities.find((e) => e.id === review.entityId);
  if (!canAccessEntity(req.user, entity)) return res.status(403).json({ error: "You don't have access to this entity." });

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Checklist");

  const periodLabel = review.month && review.financialYear
    ? `${review.month} · FY ${review.financialYear}`
    : "-";
  const infoRow1 = sheet.addRow(["Entity Name:", entity ? entity.name : "-", "", "GSTIN:", entity ? entity.gstNumber : "-"]);
  const infoRow2 = sheet.addRow(["Checklist:", review.title, "", "Period:", periodLabel]);
  infoRow1.font = { bold: true };
  infoRow2.font = { bold: true };
  sheet.addRow([]); // spacer before the table

  const headerRow = sheet.addRow([
    "Areas", "Month", "SN", "Review Areas",
    "Reviewer/Preparer's Comments", "Director's comment", "Client's feedback",
  ]);
  headerRow.font = { bold: true };

  const attachmentNote = (itemId, field) => {
    const names = (review.attachments || [])
      .filter((a) => a.itemId === itemId && a.field === field)
      .map((a) => a.originalName);
    return names.length ? `\n[Attached: ${names.join(", ")}]` : "";
  };

  for (const area of areasForMonth(review.month)) {
    for (const item of area.items) {
      const answer = review.answers[item.itemId] || {};
      sheet.addRow([
        area.name,
        area.month || "",
        item.sn ?? "",
        item.question,
        (answer.reviewer || "") + attachmentNote(item.itemId, "reviewer"),
        (answer.director || "") + attachmentNote(item.itemId, "director"),
        (answer.client || "") + attachmentNote(item.itemId, "client"),
      ]);
    }
  }

  [26, 14, 8, 60, 35, 35, 35].forEach((width, i) => { sheet.getColumn(i + 1).width = width; });
  [4, 5, 6, 7].forEach((col) => { sheet.getColumn(col).alignment = { wrapText: true, vertical: "top" }; });
  sheet.views = [{ state: "frozen", ySplit: headerRow.number }];

  const safeTitle = String(review.title).replace(/[^a-z0-9\-_ ]/gi, "").trim() || "checklist";
  const safeEntity = entity ? String(entity.name).replace(/[^a-z0-9\-_ ]/gi, "").trim() : "entity";
  const filename = `${safeEntity} - ${safeTitle}.xlsx`;

  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  await workbook.xlsx.write(res);
  res.end();
});

module.exports = { entityReviewsRouter, reviewsRouter };
