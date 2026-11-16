export enum AttachmentTargetType {
  USER = 'User',
  ARTICLE = 'Article',
}

export const ALLOWED_AVATAR_MIME_TYPES: readonly string[] = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
];

export const MAX_AVATAR_FILE_SIZE_BYTES = 5 * 1024 * 1024;

export const PUBLIC_AVATARS_SUBDIR = 'public/uploads/avatars';
export const PUBLIC_AVATARS_URL_PREFIX = '/public/uploads/avatars';

export const TARGET_TYPE_MAX_LENGTH = 50;
export const ATTACHMENT_URL_MAX_LENGTH = 500;
export const FILE_NAME_MAX_LENGTH = 255;
export const FILE_TYPE_MAX_LENGTH = 100;

