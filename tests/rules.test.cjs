const fs = require('node:fs');
const { before, after, beforeEach, test } = require('node:test');
const assert = require('node:assert/strict');
const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const { doc, getDoc, setDoc } = require('firebase/firestore');
const { ref, uploadBytes } = require('firebase/storage');

let environment;
const projectId = 'demo-studyloop-v2';

before(async () => {
  environment = await initializeTestEnvironment({
    projectId,
    firestore: { rules: fs.readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
    storage: { rules: fs.readFileSync('storage.rules', 'utf8'), host: '127.0.0.1', port: 9199 },
  });
});

after(async () => environment?.cleanup());
beforeEach(async () => environment.clearFirestore());

async function seed() {
  await environment.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await setDoc(doc(db, 'users/alice'), { deactivated: false });
    await setDoc(doc(db, 'users/bob'), { deactivated: false });
    await setDoc(doc(db, 'users/mallory'), { deactivated: false });
    await setDoc(doc(db, 'channels/channelA'), { ownerId: 'alice', status: 'active', schemaVersion: 2 });
    await setDoc(doc(db, 'channels/channelA/members/alice'), { uid: 'alice', role: 'owner' });
    await setDoc(doc(db, 'channels/channelA/members/bob'), { uid: 'bob', role: 'member' });
    await setDoc(doc(db, 'channels/channelA/posts/postA'), { authorId: 'alice', status: 'ready', schemaVersion: 2 });
    await setDoc(doc(db, 'conversations/dm_alice_bob'), { type: 'direct', participants: ['alice', 'bob'] });
    await setDoc(doc(db, 'conversations/dm_alice_bob/members/alice'), { uid: 'alice', unreadCount: 0 });
    await setDoc(doc(db, 'conversations/dm_alice_bob/members/bob'), { uid: 'bob', unreadCount: 0 });
    await setDoc(doc(db, 'conversations/dm_alice_bob/messages/messageA'), { senderId: 'alice', text: 'Hello' });
    await setDoc(doc(db, 'users/alice/usage/storage'), { storageBytes: 0, reservedBytes: 1024 });
    await setDoc(doc(db, 'uploadSessions/sessionA'), {
      ownerId: 'alice', status: 'created', attachmentIds: ['fileA'],
      allowedPaths: ['channels/channelA/posts/postA/fileA'],
      expiresAt: new Date(Date.now() + 60_000),
    });
  });
}

const verified = uid => environment.authenticatedContext(uid, { email_verified: true });

test('channel members can read ready posts, outsiders cannot', async () => {
  await seed();
  await assertSucceeds(getDoc(doc(verified('bob').firestore(), 'channels/channelA/posts/postA')));
  await assertFails(getDoc(doc(verified('mallory').firestore(), 'channels/channelA/posts/postA')));
});

test('unverified members cannot read v2 channel content', async () => {
  await seed();
  const db = environment.authenticatedContext('bob', { email_verified: false }).firestore();
  await assertFails(getDoc(doc(db, 'channels/channelA/posts/postA')));
});

test('clients cannot create or edit canonical posts', async () => {
  await seed();
  const db = verified('alice').firestore();
  await assertFails(setDoc(doc(db, 'channels/channelA/posts/clientPost'), { authorId: 'alice', status: 'ready' }));
  await assertFails(setDoc(doc(db, 'channels/channelA/posts/postA'), { authorId: 'alice', status: 'ready', text: 'changed' }));
});

test('conversation members can read messages, outsiders cannot', async () => {
  await seed();
  await assertSucceeds(getDoc(doc(verified('bob').firestore(), 'conversations/dm_alice_bob/messages/messageA')));
  await assertFails(getDoc(doc(verified('mallory').firestore(), 'conversations/dm_alice_bob/messages/messageA')));
});

test('users can read only their own trusted usage', async () => {
  await seed();
  await assertSucceeds(getDoc(doc(verified('alice').firestore(), 'users/alice/usage/storage')));
  await assertFails(getDoc(doc(verified('bob').firestore(), 'users/alice/usage/storage')));
});

test('server-issued upload path accepts a declared member image only', async () => {
  await seed();
  const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xdb]);
  const metadata = { contentType: 'image/jpeg', customMetadata: { ownerUid: 'alice', uploadSessionId: 'sessionA', attachmentId: 'fileA' } };
  await assertSucceeds(uploadBytes(ref(verified('alice').storage(), 'channels/channelA/posts/postA/fileA'), bytes, metadata));
  await assertFails(uploadBytes(ref(verified('bob').storage(), 'channels/channelA/posts/postA/fileA'), bytes, { ...metadata, customMetadata: { ...metadata.customMetadata, ownerUid: 'bob' } }));
});

test('video uploads and undeclared paths are denied', async () => {
  await seed();
  const storage = verified('alice').storage();
  const common = { customMetadata: { ownerUid: 'alice', uploadSessionId: 'sessionA', attachmentId: 'fileA' } };
  await assertFails(uploadBytes(ref(storage, 'channels/channelA/posts/postA/fileA'), new Uint8Array([0, 0, 0, 0]), { ...common, contentType: 'video/mp4' }));
  await assertFails(uploadBytes(ref(storage, 'channels/channelA/posts/postA/other'), new Uint8Array([0xff, 0xd8, 0xff]), { contentType: 'image/jpeg', customMetadata: { ...common.customMetadata, attachmentId: 'other' } }));
});

test('test harness executed assertions', () => assert.ok(environment));

