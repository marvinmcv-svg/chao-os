import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

// ── Config ────────────────────────────────────────────────────────────────────

function getRegion() { return process.env.AWS_REGION ?? '' }
function getAccessKeyId() { return process.env.AWS_ACCESS_KEY_ID ?? '' }
function getSecretAccessKey() { return process.env.AWS_SECRET_ACCESS_KEY ?? '' }
function getBucket() { return process.env.DOCUMENTS_S3_BUCKET ?? '' }

function requireEnv(name: string, value: string): string {
  if (!value) throw new Error(`Missing env var: ${name}`)
  return value
}

// ── Client (lazy init) ───────────────────────────────────────────────────────

let _s3Client: S3Client | null = null

function getS3Client(): S3Client {
  if (_s3Client) return _s3Client
  const region = requireEnv('AWS_REGION', getRegion())
  const accessKeyId = requireEnv('AWS_ACCESS_KEY_ID', getAccessKeyId())
  const secretAccessKey = requireEnv('AWS_SECRET_ACCESS_KEY', getSecretAccessKey())
  requireEnv('DOCUMENTS_S3_BUCKET', getBucket()) // validate bucket exists
  _s3Client = new S3Client({
    region,
    credentials: { accessKeyId, secretAccessKey },
  })
  return _s3Client
}

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
  const bucket = requireEnv('DOCUMENTS_S3_BUCKET', getBucket())
  const client = getS3Client()

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: fileKey,
    ContentType: mimeType,
  })

  const expiresAt = Date.now() + 15 * 60 * 1000 // 15 min from now (ms)

  const uploadUrl = await getSignedUrl(client, command, {
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
  const bucket = requireEnv('DOCUMENTS_S3_BUCKET', getBucket())
  const client = getS3Client()

  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: fileKey,
  })

  const expiresAt = Date.now() + 60 * 60 * 1000 // 1 hour

  const downloadUrl = await getSignedUrl(client, command, {
    expiresIn: 60 * 60, // seconds
  })

  return { downloadUrl, expiresAt }
}

// ── Delete object ─────────────────────────────────────────────────────────────

export async function deleteObject(fileKey: string): Promise<void> {
  const bucket = requireEnv('DOCUMENTS_S3_BUCKET', getBucket())
  const client = getS3Client()

  const command = new DeleteObjectCommand({
    Bucket: bucket,
    Key: fileKey,
  })
  await client.send(command)
}