import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { eq, and, desc } from "drizzle-orm";
import { db } from "../db/index.js";
import { uploads, clients } from "../db/schema.js";
import { requireAuth, requireRole } from "../plugins/authenticate.js";
import { requireClientScope } from "../plugins/client-scope.js";
import { putObject, deleteObject, getPresignedUrl } from "../lib/s3.js";
import {
  allowedUploadMimeTypes,
  UPLOAD_MAX_SIZE_BYTES,
} from "@content-factory/shared";
import path from "node:path";

const ALLOWED_EXTENSIONS = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".svg",
  ".gif",
]);

export async function uploadRoutes(app: FastifyInstance) {
  // POST /:clientId/uploads — multipart file upload
  app.post(
    "/:clientId/uploads",
    { preHandler: [requireAuth, requireClientScope, requireRole("admin", "editor")] },
    async (request, reply) => {
      const { clientId } = request.params as { clientId: string };

      // D4 fix: verify URL param matches the validated X-Client-Id header
      if (request.clientId !== clientId) {
        return reply.status(403).send({ error: "Client scope mismatch" });
      }

      const [client] = await db
        .select({ id: clients.id })
        .from(clients)
        .where(eq(clients.id, clientId))
        .limit(1);

      if (!client) return reply.status(404).send({ error: "Client not found" });

      const file = await request.file();
      if (!file) {
        return reply.status(400).send({ error: "No file provided" });
      }

      // Validate MIME type
      const mimeType = file.mimetype;
      if (
        !(allowedUploadMimeTypes as readonly string[]).includes(mimeType)
      ) {
        return reply.status(400).send({
          error: `Invalid file type: ${mimeType}. Allowed: ${allowedUploadMimeTypes.join(", ")}`,
        });
      }

      // Validate extension
      const ext = path.extname(file.filename).toLowerCase();
      if (!ALLOWED_EXTENSIONS.has(ext)) {
        return reply.status(400).send({
          error: `Invalid file extension: ${ext}`,
        });
      }

      // Read file into buffer
      const buffer = await file.toBuffer();

      if (buffer.length > UPLOAD_MAX_SIZE_BYTES) {
        return reply.status(400).send({
          error: `File too large. Maximum size: ${UPLOAD_MAX_SIZE_BYTES / (1024 * 1024)}MB`,
        });
      }

      if (buffer.length === 0) {
        return reply.status(400).send({ error: "Empty file" });
      }

      const fileId = randomUUID();
      const s3Key = `${clientId}/${fileId}${ext}`;

      await putObject(s3Key, buffer, mimeType);

      const [upload] = await db
        .insert(uploads)
        .values({
          clientId,
          userId: request.user!.userId,
          filename: file.filename,
          mimeType,
          size: buffer.length,
          s3Key,
        })
        .returning();

      return reply.status(201).send({ upload });
    }
  );

  // GET /:clientId/uploads — list uploads for a client
  app.get(
    "/:clientId/uploads",
    { preHandler: [requireAuth, requireClientScope] },
    async (request, reply) => {
      const { clientId } = request.params as { clientId: string };

      if (request.clientId !== clientId) {
        return reply.status(403).send({ error: "Client scope mismatch" });
      }

      const [client] = await db
        .select({ id: clients.id })
        .from(clients)
        .where(eq(clients.id, clientId))
        .limit(1);

      if (!client) return reply.status(404).send({ error: "Client not found" });

      const rows = await db
        .select()
        .from(uploads)
        .where(eq(uploads.clientId, clientId))
        .orderBy(desc(uploads.createdAt));

      return reply.send({ uploads: rows });
    }
  );

  // GET /:clientId/uploads/:uploadId/url — generate presigned download URL
  app.get(
    "/:clientId/uploads/:uploadId/url",
    { preHandler: [requireAuth, requireClientScope] },
    async (request, reply) => {
      const { clientId, uploadId } = request.params as {
        clientId: string;
        uploadId: string;
      };

      if (request.clientId !== clientId) {
        return reply.status(403).send({ error: "Client scope mismatch" });
      }

      const [upload] = await db
        .select()
        .from(uploads)
        .where(and(eq(uploads.id, uploadId), eq(uploads.clientId, clientId)))
        .limit(1);

      if (!upload) return reply.status(404).send({ error: "Upload not found" });

      const url = await getPresignedUrl(upload.s3Key);
      return reply.send({ url, expiresIn: 3600 });
    }
  );

  // DELETE /:clientId/uploads/:uploadId — remove from S3 + DB
  app.delete(
    "/:clientId/uploads/:uploadId",
    { preHandler: [requireAuth, requireClientScope, requireRole("admin", "editor")] },
    async (request, reply) => {
      const { clientId, uploadId } = request.params as {
        clientId: string;
        uploadId: string;
      };

      if (request.clientId !== clientId) {
        return reply.status(403).send({ error: "Client scope mismatch" });
      }

      const [upload] = await db
        .select()
        .from(uploads)
        .where(and(eq(uploads.id, uploadId), eq(uploads.clientId, clientId)))
        .limit(1);

      if (!upload) return reply.status(404).send({ error: "Upload not found" });

      // Delete from S3 first, then DB. If S3 delete fails, the DB record
      // remains and can be retried. If DB delete fails after S3 delete,
      // we have an orphaned DB row but the file is already gone — safer
      // than the reverse (orphaned S3 object with no DB reference).
      await deleteObject(upload.s3Key);

      await db
        .delete(uploads)
        .where(and(eq(uploads.id, uploadId), eq(uploads.clientId, clientId)));

      return reply.status(204).send();
    }
  );
}
