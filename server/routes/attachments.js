const express = require("express");
const { withStore, readStore } = require("../db");
const { isValidItemId } = require("../checklistTemplate");
const { upload, finalizeUpload, discardUpload, deleteAttachmentFile, serveAttachment } = require("../attachments");
const { canAccessEntity } = require("../auth");

// Mounted at /api/reviews/:id/attachments
const router = express.Router({ mergeParams: true });

const ANSWER_FIELDS = ["reviewer", "director", "client"];

router.post("/", upload.single("file"), async (req, res) => {
  const { itemId, field } = req.body || {};

  if (!req.file) return res.status(400).json({ error: "No file uploaded." });
  if (!isValidItemId(itemId) || !ANSWER_FIELDS.includes(field)) {
    discardUpload(req.file);
    return res.status(400).json({ error: "Unknown checklist item or field." });
  }

  let stored;
  try {
    stored = await finalizeUpload(req.file);
  } catch (err) {
    return res.status(500).json({ error: err.message || "Could not store the uploaded file." });
  }

  try {
    const attachment = await withStore((store) => {
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
      const attachment = {
        id: stored.id,
        itemId,
        field,
        originalName: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
        uploadedAt: new Date().toISOString(),
      };
      if (!review.attachments) review.attachments = [];
      review.attachments.push(attachment);
      review.updatedAt = attachment.uploadedAt;
      return attachment;
    });
    res.status(201).json(attachment);
  } catch (err) {
    deleteAttachmentFile(stored.id);
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.get("/:attachmentId", async (req, res) => {
  const store = await readStore();
  const review = store.reviews.find((r) => r.id === req.params.id);
  if (!review) return res.status(404).json({ error: "Checklist not found." });
  const entity = store.entities.find((e) => e.id === review.entityId);
  if (!canAccessEntity(req.user, entity)) return res.status(403).json({ error: "You don't have access to this entity." });
  const attachment = (review.attachments || []).find((a) => a.id === req.params.attachmentId);
  if (!attachment) return res.status(404).json({ error: "Attachment not found." });

  await serveAttachment(req, res, attachment);
});

router.delete("/:attachmentId", async (req, res) => {
  try {
    await withStore((store) => {
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
      const idx = (review.attachments || []).findIndex((a) => a.id === req.params.attachmentId);
      if (idx === -1) {
        const err = new Error("Attachment not found.");
        err.status = 404;
        throw err;
      }
      review.attachments.splice(idx, 1);
      review.updatedAt = new Date().toISOString();
    });
    deleteAttachmentFile(req.params.attachmentId);
    res.status(204).end();
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

module.exports = router;
