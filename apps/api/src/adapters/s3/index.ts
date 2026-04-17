import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type {
  ObjectStore,
  PresignGetArgs,
  PresignPutArgs,
  PresignedPut,
} from '../../ports/objectStore.ts';
import type { Config } from '../../config.ts';

const DEFAULT_PUT_TTL = 10 * 60; // 10 min
const DEFAULT_GET_TTL = 60 * 60; // 1 hour
const LIST_PAGE_SIZE = 1000;

export function createS3ObjectStore(config: Config): ObjectStore {
  const client = new S3Client({
    region: config.S3_REGION,
    endpoint: config.S3_ENDPOINT,
    forcePathStyle: config.S3_FORCE_PATH_STYLE,
    credentials: {
      accessKeyId: config.S3_ACCESS_KEY_ID,
      secretAccessKey: config.S3_SECRET_ACCESS_KEY,
    },
  });
  const bucket = config.S3_BUCKET;

  return {
    async presignPut(args: PresignPutArgs): Promise<PresignedPut> {
      const expiresIn = args.expiresInSeconds ?? DEFAULT_PUT_TTL;
      const cmd = new PutObjectCommand({
        Bucket: bucket,
        Key: args.key,
        ContentType: args.contentType,
        ContentLength: args.contentLength,
        ...(args.checksumSha256
          ? { ChecksumSHA256: args.checksumSha256 }
          : {}),
      });
      const url = await getSignedUrl(client, cmd, { expiresIn });
      const headers: Record<string, string> = {
        'Content-Type': args.contentType,
      };
      if (args.checksumSha256) {
        headers['x-amz-checksum-sha256'] = args.checksumSha256;
      }
      return {
        url,
        headers,
        expiresAt: new Date(Date.now() + expiresIn * 1000),
      };
    },

    async presignGet(args: PresignGetArgs): Promise<string> {
      const expiresIn = args.expiresInSeconds ?? DEFAULT_GET_TTL;
      const cmd = new GetObjectCommand({
        Bucket: bucket,
        Key: args.key,
        ...(args.downloadAs
          ? {
              ResponseContentDisposition: `attachment; filename="${encodeFilename(args.downloadAs)}"`,
            }
          : {}),
      });
      return getSignedUrl(client, cmd, { expiresIn });
    },

    async delete(key: string): Promise<void> {
      await client
        .send(new DeleteObjectCommand({ Bucket: bucket, Key: key }))
        .catch(() => undefined);
    },

    async deletePrefix(prefix: string): Promise<number> {
      let continuationToken: string | undefined;
      let total = 0;
      do {
        const listRes = await client.send(
          new ListObjectsV2Command({
            Bucket: bucket,
            Prefix: prefix,
            MaxKeys: LIST_PAGE_SIZE,
            ContinuationToken: continuationToken,
          }),
        );
        const keys = (listRes.Contents ?? [])
          .map((o) => o.Key)
          .filter((k): k is string => typeof k === 'string');
        if (keys.length > 0) {
          await client.send(
            new DeleteObjectsCommand({
              Bucket: bucket,
              Delete: {
                Objects: keys.map((Key) => ({ Key })),
                Quiet: true,
              },
            }),
          );
          total += keys.length;
        }
        continuationToken = listRes.IsTruncated
          ? listRes.NextContinuationToken
          : undefined;
      } while (continuationToken);
      return total;
    },
  };
}

function encodeFilename(name: string): string {
  return name.replace(/[\\"]/g, '_');
}
