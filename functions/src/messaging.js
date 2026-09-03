const { onCall } = require('firebase-functions/v2/https');
const {
  db,
  FieldValue,
  CALL_OPTIONS,
  HttpsError,
  requiredString,
  optionalString,
  requireAccount,
  canonicalDmId,
  requireConversationMember,
  isBlocked,
  consumeRate,
} = require('./core');

const openConversationV2 = onCall(CALL_OPTIONS, async request => {
  const { uid } = await requireAccount(request);
  const peerId = requiredString(request.data?.peerId, 'Recipient', 160);
  if (peerId === uid) throw new HttpsError('invalid-argument', 'Use Saved Posts for personal content.');
  const [peer, peerProfile] = await Promise.all([db.doc(`users/${peerId}`).get(), db.doc(`publicProfiles/${peerId}`).get()]);
  if (!peer.exists || peer.data().deactivated === true || !peerProfile.exists) throw new HttpsError('not-found', 'The recipient is unavailable.');
  if (await isBlocked(uid, peerId)) throw new HttpsError('permission-denied', 'Messaging is unavailable for this person.');
  const conversationId = canonicalDmId(uid, peerId);
  const conversationRef = db.doc(`conversations/${conversationId}`);
  await db.runTransaction(async transaction => {
    const conversation = await transaction.get(conversationRef);
    if (!conversation.exists) {
      transaction.create(conversationRef, { type: 'direct', participants: [uid, peerId].sort(), lastMessage: null, schemaVersion: 2, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
      for (const participant of [uid, peerId]) transaction.create(conversationRef.collection('members').doc(participant), { uid: participant, unreadCount: 0, lastReadAt: null, joinedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    }
  });
  return { conversationId };
});

const sendMessageV2 = onCall(CALL_OPTIONS, async request => {
  const { uid } = await requireAccount(request);
  const conversationId = requiredString(request.data?.conversationId, 'Conversation', 400);
  const text = optionalString(request.data?.text, 'Message', 4000);
  const attachments = Array.isArray(request.data?.attachments) ? request.data.attachments : [];
  if (!text && !attachments.length) throw new HttpsError('invalid-argument', 'Add a message or attachment.');
  if (attachments.length > 10) throw new HttpsError('invalid-argument', 'Too many attachments.');
  if (attachments.some(item => String(item?.kind || '') === 'voice' || String(item?.mimeType || '').startsWith('audio/') || String(item?.mimeType || '').startsWith('video/'))) throw new HttpsError('invalid-argument', 'Private messages support pictures and documents only.');

  const conversationRef = db.doc(`conversations/${conversationId}`);
  const messageRef = conversationRef.collection('messages').doc();
  await db.runTransaction(async transaction => {
    const conversation = await transaction.get(conversationRef);
    if (!conversation.exists || conversation.data().type !== 'direct') throw new HttpsError('not-found', 'Conversation not found.');
    const participants = conversation.data().participants || [];
    if (!participants.includes(uid) || canonicalDmId(participants[0], participants[1]) !== conversationId) throw new HttpsError('permission-denied', 'Conversation access is unavailable.');
    const peerId = participants.find(value => value !== uid);
    await requireConversationMember(conversationId, uid, transaction);
    if (await isBlocked(uid, peerId, transaction)) throw new HttpsError('permission-denied', 'Messaging is unavailable for this person.');
    await consumeRate(transaction, uid, 'send_message', 20, 60_000);
    transaction.create(messageRef, {
      senderId: uid,
      text,
      attachments,
      replyTo: request.data?.replyTo ? { messageId: requiredString(request.data.replyTo.messageId, 'Reply', 160), preview: optionalString(request.data.replyTo.preview, 'Reply preview', 300) } : null,
      status: 'sent',
      schemaVersion: 2,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    transaction.update(conversationRef, { lastMessage: { id: messageRef.id, senderId: uid, text: text.slice(0, 160), attachmentCount: attachments.length }, updatedAt: FieldValue.serverTimestamp() });
    transaction.update(conversationRef.collection('members').doc(peerId), { unreadCount: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() });
  });
  return { messageId: messageRef.id };
});

const markConversationReadV2 = onCall(CALL_OPTIONS, async request => {
  const { uid } = await requireAccount(request);
  const conversationId = requiredString(request.data?.conversationId, 'Conversation', 400);
  await requireConversationMember(conversationId, uid);
  await db.doc(`conversations/${conversationId}/members/${uid}`).update({ unreadCount: 0, lastReadAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
  return { read: true };
});

const editMessageV2 = onCall(CALL_OPTIONS, async request => {
  const { uid } = await requireAccount(request);
  const conversationId = requiredString(request.data?.conversationId, 'Conversation', 400);
  const messageId = requiredString(request.data?.messageId, 'Message', 160);
  const text = requiredString(request.data?.text, 'Message', 4000);
  await requireConversationMember(conversationId, uid);
  const ref = db.doc(`conversations/${conversationId}/messages/${messageId}`);
  const message = await ref.get();
  if (!message.exists) throw new HttpsError('not-found', 'Message not found.');
  if (message.data().senderId !== uid) throw new HttpsError('permission-denied', 'You cannot edit this message.');
  if (Date.now() - (message.data().createdAt?.toMillis?.() || 0) > 30 * 60_000) throw new HttpsError('failed-precondition', 'Messages can be edited for 30 minutes.');
  await ref.update({ text, editedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
  return { updated: true };
});

const deleteMessageV2 = onCall(CALL_OPTIONS, async request => {
  const { uid } = await requireAccount(request);
  const conversationId = requiredString(request.data?.conversationId, 'Conversation', 400);
  const messageId = requiredString(request.data?.messageId, 'Message', 160);
  await requireConversationMember(conversationId, uid);
  const ref = db.doc(`conversations/${conversationId}/messages/${messageId}`);
  const [message, conversation] = await Promise.all([ref.get(), db.doc(`conversations/${conversationId}`).get()]);
  if (!message.exists) return { deleted: true };
  if (message.data().senderId !== uid) throw new HttpsError('permission-denied', 'You cannot delete this message.');
  const peerId = (conversation.data()?.participants || []).find(value => value !== uid);
  const peerState = peerId ? await db.doc(`conversations/${conversationId}/members/${peerId}`).get() : null;
  if (peerState?.data()?.lastReadAt?.toMillis?.() >= message.data().createdAt?.toMillis?.()) throw new HttpsError('failed-precondition', 'This message has already been seen.');
  await ref.delete();
  return { deleted: true };
});

const setBlockV2 = onCall(CALL_OPTIONS, async request => {
  const { uid } = await requireAccount(request);
  const blockedUid = requiredString(request.data?.blockedUid, 'User', 160);
  if (blockedUid === uid) throw new HttpsError('invalid-argument', 'You cannot block yourself.');
  const ref = db.doc(`users/${uid}/blocks/${blockedUid}`);
  if (request.data?.blocked === false) await ref.delete();
  else await ref.set({ blockedUid, createdAt: FieldValue.serverTimestamp() });
  return { blocked: request.data?.blocked !== false };
});

module.exports = { openConversationV2, sendMessageV2, markConversationReadV2, editMessageV2, deleteMessageV2, setBlockV2 };

