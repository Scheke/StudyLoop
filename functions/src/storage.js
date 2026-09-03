const { onObjectFinalized } = require('firebase-functions/v2/storage');
const { db, storage, FieldValue } = require('./core');
const { kindForType, MAX_FILE_BYTES } = require('./attachments');

const STORAGE_REGION = 'us-east1';
const STORAGE_BUCKET = 'studyloop-01.firebasestorage.app';

async function firstBytes(bucket, path, length = 32) {
  const [buffer] = await bucket.file(path).download({ start: 0, end: length - 1 });
  return buffer;
}

function validSignature(type, buffer) {
  const mime = String(type || '').toLowerCase();
  const hex = buffer.toString('hex');
  const ascii = buffer.toString('ascii');
  if (mime === 'application/pdf') return ascii.startsWith('%PDF-');
  if (mime.includes('openxmlformats')) return hex.startsWith('504b0304');
  if (['application/msword', 'application/vnd.ms-powerpoint', 'application/vnd.ms-excel'].includes(mime)) return hex.startsWith('d0cf11e0a1b11ae1');
  if (mime === 'text/plain') return !buffer.includes(0);
  if (mime === 'image/jpeg') return hex.startsWith('ffd8ff');
  if (mime === 'image/png') return hex.startsWith('89504e470d0a1a0a');
  if (mime === 'image/webp') return ascii.startsWith('RIFF') && ascii.slice(8, 12) === 'WEBP';
  if (mime === 'audio/ogg') return ascii.startsWith('OggS');
  if (mime === 'audio/wav') return ascii.startsWith('RIFF') && ascii.slice(8, 12) === 'WAVE';
  if (mime === 'audio/webm') return hex.startsWith('1a45dfa3');
  if (mime === 'audio/mpeg') return ascii.startsWith('ID3') || buffer[0] === 0xff;
  if (mime === 'audio/mp4') return ascii.slice(4, 8) === 'ftyp';
  return false;
}

const validateUploadV2 = onObjectFinalized({ region: STORAGE_REGION, bucket: STORAGE_BUCKET, timeoutSeconds: 120 }, async event => {
  const object = event.data;
  const uploadSessionId = String(object.metadata?.uploadSessionId || '');
  const attachmentId = String(object.metadata?.attachmentId || '');
  const ownerId = String(object.metadata?.ownerUid || '');
  const path = String(object.name || '');
  if (!uploadSessionId || !attachmentId || !ownerId || !path) return;

  const bucket = storage.bucket(object.bucket);
  const sessionRef = db.doc(`uploadSessions/${uploadSessionId}`);
  const session = await sessionRef.get();
  const declaration = session.data()?.attachments?.find(item => item.attachmentId === attachmentId);
  const actualSize = Math.max(0, Number(object.size || 0));
  const actualType = String(object.contentType || '').toLowerCase();
  const metadataMatches = session.exists
    && session.data().ownerId === ownerId
    && session.data().status === 'created'
    && declaration?.storagePath === path
    && declaration?.mimeType === actualType
    && declaration?.status === 'created'
    && actualSize > 0
    && actualSize <= declaration.declaredSize
    && actualSize <= MAX_FILE_BYTES
    && kindForType(actualType) === declaration.kind;
  const signatureMatches = metadataMatches
    ? await firstBytes(bucket, path).then(buffer => validSignature(actualType, buffer)).catch(() => false)
    : false;
  const accepted = metadataMatches && signatureMatches;

  await db.runTransaction(async transaction => {
    const fresh = await transaction.get(sessionRef);
    if (!fresh.exists) return;
    const data = fresh.data();
    const current = data.attachments.find(item => item.attachmentId === attachmentId);
    if (!current || current.status !== 'created') return;
    const usageRef = db.doc(`users/${ownerId}/usage/storage`);
    const usage = await transaction.get(usageRef);
    const attachments = data.attachments.map(item => item.attachmentId === attachmentId
      ? { ...item, status: accepted ? 'ready' : 'rejected', actualSize: accepted ? actualSize : 0, validatedAt: new Date() }
      : item);
    const allReady = attachments.every(item => item.status === 'ready');
    const anyRejected = attachments.some(item => item.status === 'rejected');
    transaction.update(sessionRef, { attachments, status: anyRejected ? 'failed' : allReady ? 'uploaded' : 'created', updatedAt: FieldValue.serverTimestamp() });
    transaction.set(usageRef, {
      storageBytes: Math.max(0, Number(usage.data()?.storageBytes || 0) + (accepted ? actualSize : 0)),
      reservedBytes: Math.max(0, Number(usage.data()?.reservedBytes || 0) - Number(current.declaredSize || 0)),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  });

  if (!accepted) await bucket.file(path).delete({ ignoreNotFound: true });
});

module.exports = { validateUploadV2 };

