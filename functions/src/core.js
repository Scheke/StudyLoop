const { getApps, initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore, FieldValue, Timestamp } = require('firebase-admin/firestore');
const { getStorage } = require('firebase-admin/storage');
const { HttpsError } = require('firebase-functions/v2/https');

if (!getApps().length) initializeApp();

const db = getFirestore();
const auth = getAuth();
const storage = getStorage();
const REGION = 'us-central1';
const CALL_OPTIONS = { region: REGION, enforceAppCheck: false };

const PLAN = Object.freeze({
  Free: { storageBytes: 100 * 1024 * 1024, savedPosts: 7, dailyVoice: 10, dailyDownloads: 30 },
  'Student+': { storageBytes: 2 * 1024 * 1024 * 1024, monthlyDownloadBytes: 2 * 1024 * 1024 * 1024 },
  Power: { storageBytes: 4 * 1024 * 1024 * 1024, monthlyDownloadBytes: 4 * 1024 * 1024 * 1024 },
});

function requiredString(value, name, max = 160) {
  const result = String(value ?? '').trim();
  if (!result || result.length > max) throw new HttpsError('invalid-argument', `${name} is invalid.`);
  return result;
}

function optionalString(value, name, max = 2000) {
  const result = String(value ?? '').trim();
  if (result.length > max) throw new HttpsError('invalid-argument', `${name} is too long.`);
  return result;
}

function bool(value, fallback = false) {
  return typeof value === 'boolean' ? value : fallback;
}

async function requireAccount(request, { admin = false } = {}) {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in to continue.');
  if (admin && request.auth.token.admin !== true) throw new HttpsError('permission-denied', 'Administrator access is required.');
  if (!admin && request.auth.token.email_verified !== true) throw new HttpsError('failed-precondition', 'Verify your email before continuing.');
  const snapshot = await db.doc(`users/${request.auth.uid}`).get();
  if (!snapshot.exists || snapshot.data().deactivated === true) throw new HttpsError('permission-denied', 'This account is unavailable.');
  return { uid: request.auth.uid, profile: snapshot.data(), token: request.auth.token };
}

async function currentPlan(uid, transaction = null) {
  const ref = db.doc(`users/${uid}/subscription/current`);
  const snapshot = transaction ? await transaction.get(ref) : await ref.get();
  const data = snapshot.exists ? snapshot.data() : null;
  const active = data && ['Student+', 'Power'].includes(data.plan) && data.expiresAt?.toMillis?.() > Date.now();
  const name = active ? data.plan : 'Free';
  return { name, ...PLAN[name] };
}

function canonicalDmId(a, b) {
  const values = [...new Set([String(a), String(b)])].sort();
  if (values.length !== 2 || values.some(value => !value || value.length > 160)) throw new HttpsError('invalid-argument', 'Conversation participants are invalid.');
  return `dm_${values.join('_')}`;
}

async function requireChannelMember(channelId, uid, transaction = null) {
  const ref = db.doc(`channels/${channelId}/members/${uid}`);
  const snapshot = transaction ? await transaction.get(ref) : await ref.get();
  if (!snapshot.exists) throw new HttpsError('permission-denied', 'Join this channel before continuing.');
  return snapshot.data();
}

async function requireConversationMember(conversationId, uid, transaction = null) {
  const ref = db.doc(`conversations/${conversationId}/members/${uid}`);
  const snapshot = transaction ? await transaction.get(ref) : await ref.get();
  if (!snapshot.exists) throw new HttpsError('permission-denied', 'Conversation access is unavailable.');
  return snapshot.data();
}

async function isBlocked(a, b, transaction = null) {
  const refs = [db.doc(`users/${a}/blocks/${b}`), db.doc(`users/${b}/blocks/${a}`)];
  const snapshots = transaction
    ? [await transaction.get(refs[0]), await transaction.get(refs[1])]
    : await Promise.all(refs.map(ref => ref.get()));
  return snapshots.some(snapshot => snapshot.exists);
}

async function consumeRate(transaction, uid, action, limit, windowMs) {
  const ref = db.doc(`users/${uid}/usage/rate_${action}`);
  const snapshot = await transaction.get(ref);
  const now = Date.now();
  const previous = snapshot.exists ? snapshot.data() : null;
  const startedAt = previous?.windowStartedAt?.toMillis?.() || 0;
  const reset = !startedAt || now - startedAt >= windowMs;
  const count = reset ? 1 : Number(previous.count || 0) + 1;
  if (count > limit) throw new HttpsError('resource-exhausted', 'Please wait before trying again.');
  transaction.set(ref, {
    action,
    count,
    windowStartedAt: reset ? Timestamp.now() : previous.windowStartedAt,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
}

module.exports = {
  db,
  auth,
  storage,
  FieldValue,
  Timestamp,
  HttpsError,
  CALL_OPTIONS,
  PLAN,
  requiredString,
  optionalString,
  bool,
  requireAccount,
  currentPlan,
  canonicalDmId,
  requireChannelMember,
  requireConversationMember,
  isBlocked,
  consumeRate,
};

