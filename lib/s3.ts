import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

// ── Config ────────────────────────────────────────────────────────────────────

const REGION = process.env.AWS_REGION ?? ''
const ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID ?? ''
const SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY ?? ''
const BUCKET = process.env.DOCUMENTS_S3_BUCKET ?? ''

function requireEnv(name: string, value: string): string {
  if (!value) throw new Error(`Missing env var: ${name}`)
  return value
}

// Validate at module load — fail fast if misconfigured
const REGION_OK = requireEnv('AWS_REGION', REGION)
const ACCESS_KEY_OK = requireEnv('AWS_ACCESS_KEY_ID', ACCESS_KEY_ID)
const SECRET_OK = requireEnv('AWS_SECRET_ACCESS_KEY', SECRET_ACCESS_KEY)
const BUCKET_OK = requireEnv('DOCUMENTS_S3_BUCKET', BUCKET)

// ── Client ────────────────────────────────────────────────────────────────────

export const s3Client = new S3Client({
  region: REGION_OK,
  credentials: {
    accessKeyId: ACCESS_KEY_OK,
    secretAccessKey: SECRET_OK,
  },
})

// ── Helpers ───────────────────────────────────────────────────────────────────

function sanitizeKey(key: string): string {
  return key.replace(/[^a-zA-Z0-9/_-]/g, '_')
}

function buildFileKey(projectId: string, filename: string, cuid: string): string {
  const safeName = sanitizeKey(filename)
  return `projects/${projectId}/documents/${cuid}-${safeName}`
}

// ── Presigned Upload ──────────────────────────────────────────────────────────

export interface PresignedUploadResult {
  uploadUrl: string
  fileKey: string
  expiresAt: number
}

export async function getPresignedUploadUrl(
  filename: string,
  mimeType: string,
  projectId: string,
  cuid: string
): Promise<PresignedUploadResult> {
  const fileKey = buildFileKey(projectId, filename, cuid)

  const command = new PutObjectCommand({
    Bucket: BUCKET_OK,
    Key: fileKey,
    ContentType: mimeType,
  })

  const expiresAt = Date.now() + 15 * 60 * 1000 // 15 min from now (ms)

  const uploadUrl = await getSignedUrl(s3Client, command, {
    expiresIn: 15 * 60, // seconds
  })

  return { uploadUrl, fileKey, expiresAt }
}

// ── Presigned Download ────────────────────────────────────────────────────────

export interface PresignedDownloadResult {
  downloadUrl: string
  expiresAt: number
}

export async function getPresignedDownloadUrl(fileKey: string): Promise<PresignedDownloadResult> {
  const command = new GetObjectCommand({
    Bucket: BUCKET_OK,
    Key: fileKey,
  })

  const expiresAt = Date.now() + 60 * 60 * 1000 // 1 hour

  const downloadUrl = await getSignedUrl(s3Client, command, {
    expiresIn: 60 * 60, // seconds
  })

  return { downloadUrl, expiresAt }
}

// ── Delete object ─────────────────────────────────────────────────────────────

export async function deleteObject(fileKey: string): Promise<void> {
  const command = new DeleteObjectCommand({
    Bucket: BUCKET_OK,
    Key: fileKey,
  })
  await s3Client.send(command)
}