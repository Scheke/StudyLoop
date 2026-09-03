const { onCall } = require('firebase-functions/v2/https');
const {
  db,
  FieldValue,
  CALL_OPTIONS,
  HttpsError,
  requiredString,
  optionalString,
  requireAccount,
  requireChannelMember,
  consumeRate,
} = require('./core');

const VISIBILITIES = new Set(['public', 'private']);

const createChannelV2 = onCall(CALL_OPTIONS, async request => {
  const { uid } = await requireAccount(request);
  const name = requiredString(request.data?.name, 'Channel name', 100);
  const description = optionalString(request.data?.description, 'Description', 1000);
  const course = optionalString(request.data?.course, 'Course', 100);
  const moduleName = optionalString(request.data?.module, 'Module', 100);
  const visibility = String(request.data?.visibility || 'public').toLowerCase();
  if (!VISIBILITIES.has(visibility)) throw new HttpsError('invalid-argument', 'Channel visibility is invalid.');

  const channelRef = db.collection('channels').doc();
  const memberRef = channelRef.collection('members').doc(uid);
  await db.runTransaction(async transaction => {
    await consumeRate(transaction, uid, 'create_channel', 5, 60 * 60_000);
    transaction.create(channelRef, {
      name,
      description,
      course,
      module: moduleName,
      imagePath: null,
      ownerId: uid,
      visibility,
      memberCount: 1,
      status: 'active',
      schemaVersion: 2,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    transaction.create(memberRef, {
      uid,
      role: 'owner',
      muted: false,
      joinedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
  return { channelId: channelRef.id };
});

const updateChannelV2 = onCall(CALL_OPTIONS, async request => {
  const { uid } = await requireAccount(request);
  const channelId = requiredString(request.data?.channelId, 'Channel', 160);
  const member = await requireChannelMember(channelId, uid);
  if (member.role !== 'owner') throw new HttpsError('permission-denied', 'Only the channel owner can edit it.');
  const changes = {};
  if ('name' in (request.data || {})) changes.name = requiredString(request.data.name, 'Channel name', 100);
  if ('description' in (request.data || {})) changes.description = optionalString(request.data.description, 'Description', 1000);
  if ('course' in (request.data || {})) changes.course = optionalString(request.data.course, 'Course', 100);
  if ('module' in (request.data || {})) changes.module = optionalString(request.data.module, 'Module', 100);
  if ('imagePath' in (request.data || {})) changes.imagePath = request.data.imagePath ? requiredString(request.data.imagePath, 'Channel image', 500) : null;
  if ('visibility' in (request.data || {})) {
    const visibility = String(request.data.visibility).toLowerCase();
    if (!VISIBILITIES.has(visibility)) throw new HttpsError('invalid-argument', 'Channel visibility is invalid.');
    changes.visibility = visibility;
  }
  if (!Object.keys(changes).length) throw new HttpsError('invalid-argument', 'No channel changes were provided.');
  changes.updatedAt = FieldValue.serverTimestamp();
  await db.doc(`channels/${channelId}`).update(changes);
  return { updated: true };
});

const joinChannelV2 = onCall(CALL_OPTIONS, async request => {
  const { uid } = await requireAccount(request);
  const channelId = requiredString(request.data?.channelId, 'Channel', 160);
  const channelRef = db.doc(`channels/${channelId}`);
  const memberRef = channelRef.collection('members').doc(uid);
  await db.runTransaction(async transaction => {
    const [channel, member] = await Promise.all([transaction.get(channelRef), transaction.get(memberRef)]);
    if (!channel.exists || channel.data().status !== 'active') throw new HttpsError('not-found', 'Channel not found.');
    if (channel.data().visibility === 'private' && request.data?.inviteApproved !== true) throw new HttpsError('permission-denied', 'An invitation is required to join this channel.');
    if (member.exists) return;
    await consumeRate(transaction, uid, 'join_channel', 20, 60 * 60_000);
    transaction.create(memberRef, { uid, role: channel.data().ownerId === uid ? 'owner' : 'member', muted: false, joinedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    transaction.update(channelRef, { memberCount: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() });
  });
  return { joined: true };
});

const leaveChannelV2 = onCall(CALL_OPTIONS, async request => {
  const { uid } = await requireAccount(request);
  const channelId = requiredString(request.data?.channelId, 'Channel', 160);
  const channelRef = db.doc(`channels/${channelId}`);
  const memberRef = channelRef.collection('members').doc(uid);
  await db.runTransaction(async transaction => {
    const [channel, member] = await Promise.all([transaction.get(channelRef), transaction.get(memberRef)]);
    if (!channel.exists || !member.exists) return;
    transaction.delete(memberRef);
    transaction.update(channelRef, { memberCount: Math.max(0, Number(channel.data().memberCount || 1) - 1), updatedAt: FieldValue.serverTimestamp() });
  });
  return { left: true };
});

const setChannelMutedV2 = onCall(CALL_OPTIONS, async request => {
  const { uid } = await requireAccount(request);
  const channelId = requiredString(request.data?.channelId, 'Channel', 160);
  await requireChannelMember(channelId, uid);
  await db.doc(`channels/${channelId}/members/${uid}`).update({ muted: request.data?.muted === true, updatedAt: FieldValue.serverTimestamp() });
  return { muted: request.data?.muted === true };
});

const deleteChannelV2 = onCall({ ...CALL_OPTIONS, timeoutSeconds: 300 }, async request => {
  const { uid, token } = await requireAccount(request);
  const channelId = requiredString(request.data?.channelId, 'Channel', 160);
  const channelRef = db.doc(`channels/${channelId}`);
  const [channel, members] = await Promise.all([channelRef.get(), channelRef.collection('members').limit(2).get()]);
  if (!channel.exists) return { deleted: true };
  if (channel.data().ownerId !== uid && token.admin !== true) throw new HttpsError('permission-denied', 'Only the channel owner can delete it.');
  if (members.docs.some(document => document.id !== uid)) throw new HttpsError('failed-precondition', 'Remove all other members before deleting this channel.');
  await db.recursiveDelete(channelRef);
  await require('./core').storage.bucket().deleteFiles({ prefix: `channels/${channelId}/` }).catch(() => {});
  return { deleted: true };
});

module.exports = { createChannelV2, updateChannelV2, joinChannelV2, leaveChannelV2, setChannelMutedV2, deleteChannelV2 };

