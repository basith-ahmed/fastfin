import { Router } from "express";

import {
  getFactById,
  getFacts,
  getIssueById,
  getIssues,
  getRelationshipById,
  getRelationships,
  getSummary,
} from "../controllers/knowledge";

export const factsRouter = Router();
factsRouter.get("/", getFacts);
factsRouter.get("/:id", getFactById);

export const relationshipsRouter = Router();
relationshipsRouter.get("/", getRelationships);
relationshipsRouter.get("/:id", getRelationshipById);

export const issuesRouter = Router();
issuesRouter.get("/", getIssues);
issuesRouter.get("/:id", getIssueById);

export const knowledgeRouter = Router();
knowledgeRouter.get("/summary", getSummary);
