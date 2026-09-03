const crypto = require('crypto');
const { HttpsError } = require('./core');

const MAX_FILE_BYTES = 200 * 1024 * 1024;
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const AUDIO_TYPES = new Set(['audio/mpeg', 'audio/mp4', 'audio/ogg', 'audio/wav', 'audio/webm']);
const DOCUMENT_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
]);

function cleanName(value) {
  const result = String(value || 'attachment').replace(/[\\/\0-\x1f<>:"|?*]/g, '_').trim().slice(0, 160);
  return result || 'attachment';
}

function kindForType(mimeType) {
  if (IMAGE_TYPES.has(mimeType)) return 'image';
  if (AUDIO_TYPES.has(mimeType)) return 'voice';
  if (DOCUMENT_TYPES.has(mimeType)) return 'document';
  return null;
}

function normalizeDeclarations(input, { allowVoice, maxDocuments = 10 } = {}) {
  const values = Array.isArray(input) ? input : [];
  if (values.length > 21) throw new HttpsError('invalid-argument', 'Too many attachments.');
  const result = values.map(value => {
    const mimeType = String(value?.mimeType || '').toLowerCase();
    const kind = kindForType(mimeType);
    const size = Math.floor(Number(value?.size || 0));
    if (!kind || size < 1 || size > MAX_FILE_BYTES) throw new HttpsError('invalid-argument', 'An attachment has an unsupported type or size.');
    if (kind === 'voice' && !allowVoice) throw new HttpsError('invalid-argument', 'Voice attachments are not allowed here.');
    return { attachmentId: crypto.randomUUID(), fileName: cleanName(value?.fileName), mimeType, kind, declaredSize: size, status: 'created' };
  });
  if (result.filter(value => value.kind === 'image').length > 10) throw new HttpsError('invalid-argument', 'A post can contain up to 10 images.');
  if (result.filter(value => value.kind === 'document').length > maxDocuments) throw new HttpsError('invalid-argument', `A post can contain up to ${maxDocuments} documents.`);
  if (result.filter(value => value.kind === 'voice').length > 1) throw new HttpsError('invalid-argument', 'Only one voice note is allowed.');
  return result;
}

function withPaths(attachments, prefix) {
  return attachments.map(item => ({ ...item, storagePath: `${prefix}/${item.attachmentId}` }));
}

module.exports = { MAX_FILE_BYTES, IMAGE_TYPES, AUDIO_TYPES, DOCUMENT_TYPES, kindForType, normalizeDeclarations, withPaths };

