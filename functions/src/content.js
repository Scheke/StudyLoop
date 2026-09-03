const { onCall } = require('firebase-functions/v2/https');
const {
  db,
  FieldValue,
  Timestamp,
  CALL_OPTIONS,
  HttpsError,
  requiredString,
  optionalString,
  requireAccount,
  currentPlan,
  requireChannelMember,
  consumeRate,
} = require('./core');
const { normalizeDeclarations, withPaths } = require('./attachments');

function uploadResponse(sessionId, attachments) {
  return {
    uploadSessionId: sessionId,
    uploads: attachments.map(({ attachmentId, storagePath, mimeType, fileName }) => ({ attachmentId, storagePath, mimeType, fileName })),
  };
}

async function reserveUpload({ uid, channelId, targetType, targetId, text, parentCommentId = null, declarations, durationMs = 0 }) {
  const attachments = withPaths(declarations, targetType === 'post'
    ? `channels/${channelId}/posts/${targetId}`
    : `channels/${channelId}/comments/${targetId}`);
  const declaredBytes = attachments.reduce((sum, item) => sum + item.declaredSize, 0);
  const sessionRef = db.collection('uploadSessions').doc();
  const targetRef = targetType === 'post'
    ? db.doc(`channels/${channelId}/posts/${targetId}`)
    : db.doc(`channels/${channelId}/posts/${parentCommentId.postId}/comments/${targetId}`);
  const memberRef = db.doc(`channels/${channelId}/members/${uid}`);
  const usageRef = db.doc(`users/${uid}/usage/storage`);

  await db.runTransaction(async transaction => {
    const [member, usage, plan] = await Promise.all([
      transaction.get(memberRef),
      transaction.get(usageRef),
      currentPlan(uid, transaction),
    ]);
    if (!member.exists) throw new HttpsError('permission-denied', 'Join this channel before posting.');
    const stored = Math.max(0, Number(usage.data()?.storageBytes || 0));
    const reserved = Math.max(0, Number(usage.data()?.reservedBytes || 0));
    if (stored + reserved + declaredBytes > plan.storageBytes) throw new HttpsError('resource-exhausted', 'Your storage allowance is full.');
    await consumeRate(transaction, uid, targetType === 'post' ? 'create_post' : 'create_comment', targetType === 'post' ? 5 : 15, 60_000);
    transaction.create(targetRef, {
      authorId: uid,
      text,
      attachments: [],
      attachmentCount: attachments.length,
      status: attachments.length ? 'uploading' : 'ready',
      schemaVersion: 2,
      ...(targetType === 'post'
        ? { channelId, commentCount: 0 }
        : { channelId, postId: parentCommentId.postId, parentCommentId: parentCommentId.value, depth: parentCommentId.value ? 1 : 0 }),
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    if (attachments.length) {
      transaction.create(sessionRef, {
        ownerId: uid,
        channelId,
        targetType,
        targetId,
        targetPath: targetRef.path,
        attachmentIds: attachments.map(item => item.attachmentId),
        allowedPaths: attachments.map(item => item.storagePath),
        attachments,
        declaredBytes,
        status: 'created',
        expiresAt: Timestamp.fromMillis(Date.now() + 60 * 60_000),
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      transaction.set(usageRef, { storageBytes: stored, reservedBytes: reserved + declaredBytes, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    }
  });
  return { targetRef, sessionRef, attachments };
}

const createPostDraftV2 = onCall(CALL_OPTIONS, async request => {
  const { uid } = await requireAccount(request);
  const channelId = requiredString(request.data?.channelId, 'Channel', 160);
  const text = optionalString(request.data?.text, 'Post', 10_000);
  const declarations = normalizeDeclarations(request.data?.attachments, { allowVoice: true, maxDocuments: 10 });
  if (!text && !declarations.length) throw new HttpsError('invalid-argument', 'Add text or an attachment.');
  await requireChannelMember(channelId, uid);
  const postId = db.collection(`channels/${channelId}/posts`).doc().id;
  const result = await reserveUpload({ uid, channelId, targetType: 'post', targetId: postId, text, declarations, durationMs: request.data?.durationMs });
  return { postId, status: declarations.length ? 'uploading' : 'ready', ...uploadResponse(result.sessionRef.id, result.attachments) };
});

const createCommentDraftV2 = onCall(CALL_OPTIONS, async request => {
  const { uid } = await requireAccount(request);
  const channelId = requiredString(request.data?.channelId, 'Channel', 160);
  const postId = requiredString(request.data?.postId, 'Post', 160);
  const text = optionalString(request.data?.text, 'Comment', 4000);
  const parentCommentId = request.data?.parentCommentId ? requiredString(request.data.parentCommentId, 'Parent comment', 160) : null;
  const declarations = normalizeDeclarations(request.data?.attachments, { allowVoice: true, maxDocuments: 0 });
  if (declarations.some(item => item.kind === 'document')) throw new HttpsError('invalid-argument', 'Comments support pictures and voice notes only.');
  if (!text && !declarations.length) throw new HttpsError('invalid-argument', 'Add a comment or attachment.');
  await requireChannelMember(channelId, uid);
  const postRef = db.doc(`channels/${channelId}/posts/${postId}`);
  const post = await postRef.get();
  if (!post.exists || post.data().status !== 'ready') throw new HttpsError('not-found', 'Post not found.');
  if (parentCommentId) {
    const parent = await postRef.collection('comments').doc(parentCommentId).get();
    if (!parent.exists || Number(parent.data().depth || 0) !== 0) throw new HttpsError('failed-precondition', 'Replies are limited to one level.');
  }
  const commentId = postRef.collection('comments').doc().id;
  const result = await reserveUpload({ uid, channelId, targetType: 'comment', targetId: commentId, text, parentCommentId: { postId, value: parentCommentId }, declarations, durationMs: request.data?.durationMs });
  if (!declarations.length) await postRef.update({ commentCount: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() });
  return { commentId, status: declarations.length ? 'uploading' : 'ready', ...uploadResponse(result.sessionRef.id, result.attachments) };
});

const finalizeUploadV2 = onCall(CALL_OPTIONS, async request => {
  const { uid } = await requireAccount(request);
  const sessionId = requiredString(request.data?.uploadSessionId, 'Upload session', 160);
  const sessionRef = db.doc(`uploadSessions/${sessionId}`);
  await db.runTransaction(async transaction => {
    const session = await transaction.get(sessionRef);
    if (!session.exists || session.data().ownerId !== uid) throw new HttpsError('not-found', 'Upload session not found.');
    const data = session.data();
    if (data.expiresAt?.toMillis?.() <= Date.now()) throw new HttpsError('deadline-exceeded', 'Upload session expired.');
    if (!data.attachments.every(item => item.status === 'ready')) throw new HttpsError('failed-precondition', 'Files are still being validated.');
    const targetRef = db.doc(data.targetPath);
    const target = await transaction.get(targetRef);
    if (!target.exists || target.data().authorId !== uid) throw new HttpsError('not-found', 'Draft not found.');
    transaction.update(targetRef, { attachments: data.attachments.map(({ attachmentId, storagePath, fileName, mimeType, kind, actualSize }) => ({ attachmentId, storagePath, fileName, mimeType, kind, size: actualSize })), status: 'ready', publishedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    transaction.update(sessionRef, { status: 'finalized', finalizedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    if (data.targetType === 'comment') transaction.update(db.doc(`channels/${data.channelId}/posts/${target.data().postId}`), { commentCount: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() });
  });
  return { finalized: true };
});

const editPostV2 = onCall(CALL_OPTIONS, async request => {
  const { uid } = await requireAccount(request);
  const channelId = requiredString(request.data?.channelId, 'Channel', 160);
  const postId = requiredString(request.data?.postId, 'Post', 160);
  const text = optionalString(request.data?.text, 'Post', 10_000);
  const ref = db.doc(`channels/${channelId}/posts/${postId}`);
  const post = await ref.get();
  if (!post.exists) throw new HttpsError('not-found', 'Post not found.');
  if (post.data().authorId !== uid) throw new HttpsError('permission-denied', 'You cannot edit this post.');
  if (Date.now() - (post.data().createdAt?.toMillis?.() || 0) > 30 * 60_000) throw new HttpsError('failed-precondition', 'Posts can be edited for 30 minutes.');
  await ref.update({ text, editedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
  return { updated: true };
});

const setSavedPostV2 = onCall(CALL_OPTIONS, async request => {
  const { uid } = await requireAccount(request);
  const channelId = requiredString(request.data?.channelId, 'Channel', 160);
  const postId = requiredString(request.data?.postId, 'Post', 160);
  const saved = request.data?.saved !== false;
  const ref = db.doc(`users/${uid}/savedPosts/${postId}`);
  if (!saved) { await ref.delete(); return { saved: false }; }
  await requireChannelMember(channelId, uid);
  await db.runTransaction(async transaction => {
    const [existing, plan, savedPosts] = await Promise.all([
      transaction.get(ref),
      currentPlan(uid, transaction),
      transaction.get(db.collection(`users/${uid}/savedPosts`).limit(8)),
    ]);
    if (existing.exists) return;
    if (Number.isFinite(plan.savedPosts) && savedPosts.size >= plan.savedPosts) throw new HttpsError('resource-exhausted', 'Your saved-post limit has been reached.');
    transaction.create(ref, { channelId, postId, createdAt: FieldValue.serverTimestamp() });
  });
  return { saved: true };
});

module.exports = { createPostDraftV2, createCommentDraftV2, finalizeUploadV2, editPostV2, setSavedPostV2 };
