import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Upload } from '@aws-sdk/lib-storage';
import { Readable } from 'stream';

// S3 client configuration
const s3Config: any = {
  region: process.env.S3_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY || '',
    secretAccessKey: process.env.S3_SECRET_KEY || '',
  },
};

// Use custom endpoint for MinIO
if (process.env.S3_ENDPOINT) {
  s3Config.endpoint = process.env.S3_ENDPOINT;
  s3Config.forcePathStyle = true; // Required for MinIO
}

export const s3Client = new S3Client(s3Config);

export const RECORDINGS_BUCKET = process.env.S3_BUCKET || 'complianceai-recordings';
export const TRANSCRIPTS_BUCKET = process.env.S3_TRANSCRIPTS_BUCKET || 'complianceai-transcripts';

/**
 * Upload a file to S3/MinIO
 */
export async function uploadFile(
  key: string,
  body: Buffer | Readable | string,
  contentType: string,
  bucket: string = RECORDINGS_BUCKET
): Promise<string> {
  const upload = new Upload({
    client: s3Client,
    params: {
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    },
  });

  await upload.done();
  return key;
}

/**
 * Download a file from S3/MinIO
 */
export async function downloadFile(
  key: string,
  bucket: string = RECORDINGS_BUCKET
): Promise<Buffer> {
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
  });

  const response = await s3Client.send(command);

  if (!response.Body) {
    throw new Error('Empty response body from S3');
  }

  // Convert stream to buffer
  const chunks: Uint8Array[] = [];
  const stream = response.Body as Readable;

  return new Promise((resolve, reject) => {
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}

/**
 * Generate a presigned URL for downloading (valid for 1 hour)
 */
export async function getSignedDownloadUrl(
  key: string,
  bucket: string = RECORDINGS_BUCKET,
  expiresIn: number = 3600
): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
  });

  return getSignedUrl(s3Client, command, { expiresIn });
}

/**
 * Delete a file from S3/MinIO
 */
export async function deleteFile(
  key: string,
  bucket: string = RECORDINGS_BUCKET
): Promise<void> {
  const command = new DeleteObjectCommand({
    Bucket: bucket,
    Key: key,
  });

  await s3Client.send(command);
}

/**
 * Check if a file exists in S3/MinIO
 */
export async function fileExists(
  key: string,
  bucket: string = RECORDINGS_BUCKET
): Promise<boolean> {
  try {
    const command = new HeadObjectCommand({
      Bucket: bucket,
      Key: key,
    });
    await s3Client.send(command);
    return true;
  } catch {
    return false;
  }
}

/**
 * List files in a bucket with optional prefix
 */
export async function listFiles(
  prefix: string = '',
  bucket: string = RECORDINGS_BUCKET
): Promise<string[]> {
  const command = new ListObjectsV2Command({
    Bucket: bucket,
    Prefix: prefix,
  });

  const response = await s3Client.send(command);
  return (response.Contents || []).map((obj) => obj.Key || '').filter(Boolean);
}

/**
 * Generate S3 key for a recording
 */
export function generateRecordingKey(
  agentId: string,
  callId: string,
  date: Date = new Date()
): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `recordings/${year}/${month}/${day}/${agentId}/${callId}.wav`;
}

/**
 * Generate S3 key for a transcript
 */
export function generateTranscriptKey(callId: string): string {
  return `transcripts/${callId}.json`;
}
