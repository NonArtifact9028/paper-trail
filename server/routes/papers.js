import express from "express";
import {
  searchPapers,
  findPaperById,
  insertPaper,
  updatePaper,
  deletePaper,
  listFields,
  countPapers,
} from "../db/papers.js";
import { validatePaper, boundedInt, ValidationError } from "../validate.js";

const router = express.Router();

router.get("/", async (req, res) => {
  const limit = boundedInt(req.query.limit, 24, 100);
  const page = boundedInt(req.query.page, 1, 500);

  const { items, total } = await searchPapers({
    query: typeof req.query.q === "string" ? req.query.q.trim().slice(0, 120) : "",
    field: typeof req.query.field === "string" ? req.query.field.slice(0, 80) : "",
    yearFrom: Number(req.query.yearFrom) || undefined,
    yearTo: Number(req.query.yearTo) || undefined,
    sort: typeof req.query.sort === "string"
      ? req.query.sort
      : "citations",
    limit,
    skip: (page - 1) * limit,
  });

  res.json({ items, total, page, limit });
});

router.get("/meta/fields", async (req, res) => {
  const [fields, total] = await Promise.all([listFields(), countPapers()]);
  res.json({ fields, total });
});

router.get("/:id", async (req, res) => {
  const paper = await findPaperById(req.params.id);

  if (!paper) {
    res.status(404).json({ error: "Paper not found" });
    return;
  }

  res.json(paper);
});

router.post("/", async (req, res) => {
  const paper = validatePaper(req.body);
  const created = await insertPaper(paper);
  res.status(201).json(created);
});

router.put("/:id", async (req, res) => {
  const patch = validatePaper(req.body, { partial: true });
  const updated = await updatePaper(req.params.id, patch);

  if (!updated) {
    res.status(404).json({ error: "Paper not found" });
    return;
  }

  res.json(updated);
});

router.delete("/:id", async (req, res) => {
  const removed = await deletePaper(req.params.id);

  if (removed === 0) {
    res.status(404).json({ error: "Paper not found" });
    return;
  }

  res.status(204).end();
});

router.use((error, req, res, next) => {
  if (error instanceof ValidationError) {
    res.status(400).json({ error: error.message });
    return;
  }

  next(error);
});

export default router;
