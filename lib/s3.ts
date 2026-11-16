import crypto from 'node:crypto';
import fs from 'node:fs/promises';

export interface S3Config {
  endpoint: string;
  bucket: string;
  region: string;
  accessKey: string;
  secretKey: string;
}

function hmacSha256(key: Buffer | string, data: string): Buffer {
  return crypto.createHmac('sha256', key).update(data, 'utf8').digest();
}

function sha256Hex(data: Buffer | string): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function getSignatureKey(
  secretKey: string,
  dateStamp: string,
  regionName: string,
  serviceName: string
): Buffer {
  const kDate = hmacSha256(`AWS4${secretKey}`, dateStamp);
  const kRegion = hmacSha256(kDate, regionName);
  const kService = hmacSha256(kRegion, serviceName);
  return hmacSha256(kService, 'aws4_request');
}

/**
 * Unggah berkas backup ke objek S3-compatible menggunakan AWS Signature V4 murni (tanpa SDK berat).
 */
export async function uploadFileToS3(
  config: S3Config,
  localFilePath: string,
  objectKey: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    if (
      !config.endpoint ||
      !config.bucket ||
      !config.accessKey ||
      !config.secretKey
    ) {
      return { ok: false, error: 'Konfigurasi S3 belum lengkap di Settings.' };
    }

    const body = await fs.readFile(localFilePath);
    const baseEndpoint = config.endpoint.replace(/\/+$/, '');
    const cleanKey = objectKey.replace(/^\/+/, '');
    const targetUrl = new URL(`${baseEndpoint}/${config.bucket}/${cleanKey}`);

    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
    const dateStamp = amzDate.slice(0, 8);
    const payloadHash = sha256Hex(body);
    const region = config.region || 'us-east-1';

    const canonicalHeaders =
      `host:${targetUrl.host}\n` +
      `x-amz-content-sha256:${payloadHash}\n` +
      `x-amz-date:${amzDate}\n`;
    const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';

    const canonicalRequest = [
      'PUT',
      targetUrl.pathname,
      '',
      canonicalHeaders,
      signedHeaders,
      payloadHash,
    ].join('\n');

    const credentialScope = `${dateStamp}/${region}/s3/aws4_request`;
    const stringToSign = [
      'AWS4-HMAC-SHA256',
      amzDate,
      credentialScope,
      sha256Hex(canonicalRequest),
    ].join('\n');

    const signingKey = getSignatureKey(config.secretKey, dateStamp, region, 's3');
    const signature = crypto
      .createHmac('sha256', signingKey)
      .update(stringToSign, 'utf8')
      .digest('hex');

    const authorization =
      `AWS4-HMAC-SHA256 Credential=${config.accessKey}/${credentialScope}, ` +
      `SignedHeaders=${signedHeaders}, Signature=${signature}`;

    const res = await fetch(targetUrl.toString(), {
      method: 'PUT',
      headers: {
        Host: targetUrl.host,
        'x-amz-date': amzDate,
        'x-amz-content-sha256': payloadHash,
        Authorization: authorization,
        'Content-Type': 'application/octet-stream',
        'Content-Length': String(body.length),
      },
      body,
    });

    if (!res.ok) {
      const errText = await res.text();
      return {
        ok: false,
        error: `S3 HTTP ${res.status}: ${errText.slice(0, 200)}`,
      };
    }

    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Gagal upload ke S3',
    };
  }
}
