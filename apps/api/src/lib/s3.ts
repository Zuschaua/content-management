import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const MINIO_ENDPOINT = process.env.MINIO_ENDPOINT ?? "localhost";
const MINIO_PORT = process.env.MINIO_PORT ?? "9000";
const MINIO_BUCKET = process.env.MINIO_BUCKET ?? "content-factory-uploads";
const MINIO_USE_SSL = process.env.MINIO_USE_SSL === "true";

// D5 fix: fail fast if credentials are not configured — never fall back to defaults
const MINIO_ACCESS_KEY = process.env.MINIO_ACCESS_KEY;
const MINIO_SECRET_KEY = process.env.MINIO_SECRET_KEY;
if (!MINIO_ACCESS_KEY || !MINIO_SECRET_KEY) {
  throw new Error(
    "MINIO_ACCESS_KEY and MINIO_SECRET_KEY environment variables are required"
  );
}

const protocol = MINIO_USE_SSL ? "https" : "http";

export const s3Client = new S3Client({
  endpoint: `${protocol}://${MINIO_ENDPOINT}:${MINIO_PORT}`,
  region: "us-east-1",
  credentials: {
    accessKeyId: MINIO_ACCESS_KEY,
    secretAccessKey: MINIO_SECRET_KEY,
  },
  forcePathStyle: true,
});

export const BUCKET = MINIO_BUCKET;

export async function putObject(
  key: string,
  body: Buffer,
  contentType: string
): Promise<void> {
  await s3Client.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  );
}

export async function deleteObject(key: string): Promise<void> {
  await s3Client.send(
    new DeleteObjectCommand({
      Bucket: BUCKET,
      Key: key,
    })
  );
}

export async function getPresignedUrl(
  key: string,
  expiresInSeconds = 3600
): Promise<string> {
  return getSignedUrl(
    s3Client,
    new GetObjectCommand({
      Bucket: BUCKET,
      Key: key,
    }),
    { expiresIn: expiresInSeconds }
  );
}
