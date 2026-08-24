const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

let services;
async function getServices() {
  if (services) return services;
  const v = '12.11.0';
  const [{ initializeApp }, authApi, firestoreApi, storageApi] = await Promise.all([
    import(/* @vite-ignore */ `https://www.gstatic.com/firebasejs/${v}/firebase-app.js`),
    import(/* @vite-ignore */ `https://www.gstatic.com/firebasejs/${v}/firebase-auth.js`),
    import(/* @vite-ignore */ `https://www.gstatic.com/firebasejs/${v}/firebase-firestore.js`),
    import(/* @vite-ignore */ `https://www.gstatic.com/firebasejs/${v}/firebase-storage.js`),
  ]);
  const app = initializeApp(config);
  const auth = authApi.getAuth(app);
  await authApi.setPersistence(auth, authApi.browserLocalPersistence);
  services = { authApi, firestoreApi, storageApi, auth, db: firestoreApi.getFirestore(app), storage: storageApi.getStorage(app) };
  return services;
}

export async function signUp(username, email, password) {
  const s = await getServices();
  const result = await s.authApi.createUserWithEmailAndPassword(s.auth, email, password);
  const profile={ username, course:'', yearLevel:'', bio:'', photoURL:'', deactivated:false };
  await s.firestoreApi.setDoc(s.firestoreApi.doc(s.db, 'users', result.user.uid), { ...profile, email, createdAt: s.firestoreApi.serverTimestamp(), updatedAt: s.firestoreApi.serverTimestamp() });
  await s.firestoreApi.setDoc(s.firestoreApi.doc(s.db, 'publicProfiles', result.user.uid), { username, course:'', yearLevel:'', bio:'', photoURL:'', updatedAt: s.firestoreApi.serverTimestamp() });
  return result.user;
}
export async function signIn(email, password) { const s = await getServices(); return (await s.authApi.signInWithEmailAndPassword(s.auth, String(email||'').trim().toLowerCase(), password)).user; }
export async function signOutUser() { const s = await getServices(); return s.authApi.signOut(s.auth); }
export async function sendPasswordReset(email) { const s = await getServices(); return s.authApi.sendPasswordResetEmail(s.auth, email); }
export async function deactivateUser(uid) { const s = await getServices(); return s.firestoreApi.setDoc(s.firestoreApi.doc(s.db, 'users', uid), { deactivated: true, updatedAt: s.firestoreApi.serverTimestamp() }, { merge: true }); }
export async function getUserProfile(uid) { const s = await getServices(); const snapshot = await s.firestoreApi.getDoc(s.firestoreApi.doc(s.db, 'users', uid)); return snapshot.exists() ? snapshot.data() : null; }
export async function updateUserProfile(uid, profile) { const s = await getServices(); const publicProfile={ username:profile.username, course:profile.course, yearLevel:profile.yearLevel, bio:profile.bio, photoURL:profile.photoURL }; await s.firestoreApi.setDoc(s.firestoreApi.doc(s.db, 'users', uid), { ...publicProfile, updatedAt: s.firestoreApi.serverTimestamp() }, { merge: true }); return s.firestoreApi.setDoc(s.firestoreApi.doc(s.db, 'publicProfiles', uid), { ...publicProfile, updatedAt: s.firestoreApi.serverTimestamp() }, { merge: true }); }
export async function observeAuth(callback) { const s = await getServices(); return s.authApi.onAuthStateChanged(s.auth, callback); }
export async function observePosts(onChange, onError) { const s = await getServices(); const query = s.firestoreApi.query(s.firestoreApi.collection(s.db, 'posts'), s.firestoreApi.orderBy('createdAt', 'desc')); return s.firestoreApi.onSnapshot(query, snapshot => onChange(snapshot.docs.map(doc => ({ id:doc.id, ...doc.data() }))), onError); }
export async function observeChannels(onChange, onError) { const s = await getServices(); return s.firestoreApi.onSnapshot(s.firestoreApi.collection(s.db, 'channels'), snapshot => onChange(snapshot.docs.map(doc => ({ id:doc.id, ...doc.data() }))), onError); }
export async function createCloudChannel(channel) { const s = await getServices(); const ref = await s.firestoreApi.addDoc(s.firestoreApi.collection(s.db, 'channels'), { ...channel, createdAt:s.firestoreApi.serverTimestamp() }); return ref.id; }
export async function observeUsers(onChange, onError) { const s = await getServices(); return s.firestoreApi.onSnapshot(s.firestoreApi.collection(s.db, 'publicProfiles'), snapshot => onChange(snapshot.docs.map(doc => ({ id:doc.id, ...doc.data() }))), onError); }
export async function observeMemberships(uid, onChange, onError) { const s = await getServices(); const query=s.firestoreApi.query(s.firestoreApi.collection(s.db, 'memberships'), s.firestoreApi.where('uid','==',uid)); return s.firestoreApi.onSnapshot(query, snapshot => onChange(snapshot.docs.map(doc => doc.data().channelId)), onError); }
export async function setMembership(uid, channelId, joined) { const s = await getServices(); const ref=s.firestoreApi.doc(s.db, 'memberships', `${uid}_${channelId}`); return joined ? s.firestoreApi.setDoc(ref,{uid,channelId,joinedAt:s.firestoreApi.serverTimestamp()}) : s.firestoreApi.deleteDoc(ref); }
export async function observeSaved(uid, onChange, onError) { const s = await getServices(); return s.firestoreApi.onSnapshot(s.firestoreApi.collection(s.db, 'users', uid, 'saved'), snapshot => onChange(snapshot.docs.map(doc => doc.id)), onError); }
export async function setSavedPost(uid, postId, saved) { const s = await getServices(); const ref=s.firestoreApi.doc(s.db, 'users', uid, 'saved', String(postId)); return saved ? s.firestoreApi.setDoc(ref,{postId:String(postId),savedAt:s.firestoreApi.serverTimestamp()}) : s.firestoreApi.deleteDoc(ref); }
export async function saveCloudMessage(message) { const s = await getServices(); return s.firestoreApi.addDoc(s.firestoreApi.collection(s.db, 'messages'), { ...message, createdAt:s.firestoreApi.serverTimestamp() }); }
export async function deleteCloudMessage(messageId) { const s = await getServices(); return s.firestoreApi.deleteDoc(s.firestoreApi.doc(s.db, 'messages', String(messageId))); }
export async function observeMessages(conversationId, onChange, onError) { const s = await getServices(); const query=s.firestoreApi.query(s.firestoreApi.collection(s.db, 'messages'), s.firestoreApi.where('conversationId','==',conversationId)); return s.firestoreApi.onSnapshot(query, snapshot => onChange(snapshot.docs.map(doc=>({id:doc.id,...doc.data()})).sort((a,b)=>(a.createdAt?.seconds||0)-(b.createdAt?.seconds||0))), onError); }
export async function report(type, targetId, reason, userId) { const s = await getServices(); return s.firestoreApi.addDoc(s.firestoreApi.collection(s.db, 'reports'), { type, targetId, reason, userId, createdAt: s.firestoreApi.serverTimestamp() }); }
export async function saveCloudPost(post, userId) { const s = await getServices(); const clean = Object.fromEntries(Object.entries({ ...post }).filter(([, value]) => value !== undefined)); return s.firestoreApi.setDoc(s.firestoreApi.doc(s.db, 'posts', String(post.id)), { ...clean, createdAt: s.firestoreApi.serverTimestamp() }); }
export async function deleteCloudPost(id) { const s = await getServices(); return s.firestoreApi.deleteDoc(s.firestoreApi.doc(s.db, 'posts', String(id))); }
export async function uploadAsset(file, path) { const s = await getServices(); const ref=s.storageApi.ref(s.storage,path); await s.storageApi.uploadBytes(ref,file,{contentType:file.type}); return s.storageApi.getDownloadURL(ref); }
