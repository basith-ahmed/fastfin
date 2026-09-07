import type { ErrorRequestHandler } from "express";
import multer from "multer";
import { ZodError } from "zod";

import { logger } from "../utils/logger";

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const errorHandler: ErrorRequestHandler = (error: unknown, req, res, next) => {
  if (res.headersSent) {
    next(error);
    return;
  }

  if (error instanceof AppError) {
    res.status(error.statusCode).json({
      error: {
        code: error.code,
        message: error.message,
      },
    });
    return;
  }

  if (error instanceof multer.MulterError) {
    const fileTooLarge = error.code === "LIMIT_FILE_SIZE";
    res.status(fileTooLarge ? 413 : 400).json({
      error: {
        code: fileTooLarge ? "PDF_TOO_LARGE" : "INVALID_UPLOAD",
        message: fileTooLarge
          ? "The uploaded PDF exceeds the configured size limit."
          : "The upload request is invalid.",
      },
    });
    return;
  }

  if (error instanceof ZodError) {
    res.status(400).json({
      error: {
        code: "INVALID_REQUEST",
        message: "The request parameters are invalid.",
      },
    });
    return;
  }

  logger.error(
    {
      err: error,
      method: req.method,
      path: req.path,
    },
    "Unhandled request error",
  );

  res.status(500).json({
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message: "An unexpected error occurred.",
    },
  });
};
