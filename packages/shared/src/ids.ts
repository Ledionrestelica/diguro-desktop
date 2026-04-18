import { z } from 'zod';

declare const brand: unique symbol;
type Brand<T, B extends string> = T & { readonly [brand]: B };

const idString = z.string().min(1).max(128);

export type OrganizationId = Brand<string, 'OrganizationId'>;
export type WorkspaceId = Brand<string, 'WorkspaceId'>;
export type UserId = Brand<string, 'UserId'>;
export type MemberId = Brand<string, 'MemberId'>;
export type ResourceId = Brand<string, 'ResourceId'>;
export type ResourceVersionId = Brand<string, 'ResourceVersionId'>;
export type ChunkId = Brand<string, 'ChunkId'>;
export type FileFolderId = Brand<string, 'FileFolderId'>;
export type ConversationId = Brand<string, 'ConversationId'>;
export type ChatFolderId = Brand<string, 'ChatFolderId'>;
export type MessageId = Brand<string, 'MessageId'>;
export type CitationId = Brand<string, 'CitationId'>;

export const OrganizationId = idString.transform((v) => v as OrganizationId);
export const WorkspaceId = idString.transform((v) => v as WorkspaceId);
export const UserId = idString.transform((v) => v as UserId);
export const MemberId = idString.transform((v) => v as MemberId);
export const ResourceId = idString.transform((v) => v as ResourceId);
export const ResourceVersionId = idString.transform((v) => v as ResourceVersionId);
export const ChunkId = idString.transform((v) => v as ChunkId);
export const FileFolderId = idString.transform((v) => v as FileFolderId);
export const ConversationId = idString.transform((v) => v as ConversationId);
export const ChatFolderId = idString.transform((v) => v as ChatFolderId);
export const MessageId = idString.transform((v) => v as MessageId);
export const CitationId = idString.transform((v) => v as CitationId);
