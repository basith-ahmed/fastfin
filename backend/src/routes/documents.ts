import { Router } from "express";

import {
  createDocument,
  getDocumentById,
  getDocuments,
  getDocumentPagesById,
  getDocumentStatusById,
  removeDocument,
  reprocessDocumentById,
  streamDocumentFile,
} from "../controllers/documents";
import {
  getDocumentFacts,
  getDocumentIssues,
  getDocumentRelationships,
} from "../controllers/knowledge";
import { uploadPdf } from "../middleware/upload";

export const documentsRouter = Router();

documentsRouter.post("/", uploadPdf, createDocument);
documentsRouter.post("/upload", uploadPdf, createDocument);
documentsRouter.get("/", getDocuments);
documentsRouter.get("/:id/status", getDocumentStatusById);
documentsRouter.get("/:id/file", streamDocumentFile);
documentsRouter.get("/:id/pdf", streamDocumentFile);
documentsRouter.get("/:id/pages", getDocumentPagesById);
documentsRouter.get("/:id/facts", getDocumentFacts);
documentsRouter.get("/:id/relationships", getDocumentRelationships);
documentsRouter.get("/:id/issues", getDocumentIssues);
documentsRouter.post("/:id/reprocess", reprocessDocumentById);
documentsRouter.delete("/:id", removeDocument);
documentsRouter.get("/:id", getDocumentById);
