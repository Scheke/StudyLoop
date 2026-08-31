import { initializeApp } from 'firebase/app';
import * as authApi from 'firebase/auth';
import * as appCheckApi from 'firebase/app-check';
import * as firestoreApi from 'firebase/firestore';
import * as storageApi from 'firebase/storage';

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
  const app = initializeApp(config);
  const appCheckSiteKey=import.meta.env.VITE_FIREBASE_APPCHECK_SITE_KEY;
  if(appCheckSiteKey)appCheckApi.initializeAppCheck(app,{provider:new appCheckApi.ReCaptchaEnterpriseProvider(appCheckSiteKey),isTokenAutoRefreshEnabled:true});
  const auth = authApi.getAuth(app);
  await authApi.setPersistence(auth, authApi.browserLocalPersistence);
  services = { authApi, appCheckApi, firestoreApi, storageApi, auth, db: firestoreApi.getFirestore(app), storage: storageApi.getStorage(app) };
  return services;
}

const RATE_POLICIES = {
  message: { limit:20, windowMs:60_000 },
  post: { limit:5, windowMs:60_000 },
  comment: { limit:15, windowMs:60_000 },
  download: { limit:30, windowMs:24*60*60_000 },
  friendRequest: { limit:10, windowMs:60*60_000 },
  report: { limit:5, windowMs:60*60_000 },
};

async function rateLimitedWrite(action, write) {
  const s=await getServices();
  const user=s.auth.currentUser;
  const policy=RATE_POLICIES[action];
  if(!user||!policy)throw Object.assign(new Error('This action is unavailable.'),{code:'app/not-authorized'});
  const rateRef=s.firestoreApi.doc(s.db,'rateLimits',`${user.uid}_${action}`);
  let result;
  await s.firestoreApi.runTransaction(s.db,async transaction=>{
    const snapshot=await transaction.get(rateRef);
    const previous=snapshot.exists()?snapshot.data():null;
    const startedAt=previous?.windowStartedAt?.toMillis?.()||0;
    const reset=!previous||Date.now()-startedAt>=policy.windowMs;
    const count=reset?1:Number(previous.count||0)+1;
    if(count>policy.limit)throw Object.assign(new Error('Please wait before trying again.'),{code:action==='download'?'app/download-limit':'app/rate-limited'});
    transaction.set(rateRef,{uid:user.uid,action,count,windowStartedAt:reset?s.firestoreApi.serverTimestamp():previous.windowStartedAt,updatedAt:s.firestoreApi.serverTimestamp()});
    result=await write(transaction,s);
  });
  return result;
}

export async function signUp(username, email, password) {
  const s = await getServices();
  const normalizedEmail=String(email||'').trim().toLowerCase();
  const cleanUsername=String(username||'').trim();
  const result = await s.authApi.createUserWithEmailAndPassword(s.auth, normalizedEmail, password);
  const profile={ username, course:'', yearLevel:'', bio:'', photoURL:'', deactivated:false, apkPromptDismissed:false };
  try {
    await s.firestoreApi.setDoc(s.firestoreApi.doc(s.db, 'users', result.user.uid), { ...profile, username:cleanUsername, email:normalizedEmail, termsVersion:'2026-08', acceptedTermsAt:s.firestoreApi.serverTimestamp(), createdAt:s.firestoreApi.serverTimestamp(), updatedAt:s.firestoreApi.serverTimestamp() });
    await s.firestoreApi.setDoc(s.firestoreApi.doc(s.db, 'publicProfiles', result.user.uid), { username:cleanUsername, course:'', yearLevel:'', bio:'', photoURL:'', updatedAt:s.firestoreApi.serverTimestamp() });
    return result.user;
  } catch (error) {
    await s.authApi.deleteUser(result.user).catch(() => {});
    throw error;
  }
}
export async function signIn(email, password) { const s = await getServices(); const user=(await s.authApi.signInWithEmailAndPassword(s.auth, String(email||'').trim().toLowerCase(), password)).user;const profile=await s.firestoreApi.getDoc(s.firestoreApi.doc(s.db,'users',user.uid));if(profile.exists()&&profile.data().deactivated===true){await s.authApi.signOut(s.auth);const error=new Error('Account deactivated');error.code='account/deactivated';throw error;}return user; }
export async function signOutUser() { const s = await getServices(); return s.authApi.signOut(s.auth); }
export async function sendPasswordReset(email) { const s = await getServices(); return s.authApi.sendPasswordResetEmail(s.auth, email); }
export async function deactivateUser(uid) { const s = await getServices(); return s.firestoreApi.setDoc(s.firestoreApi.doc(s.db, 'users', uid), { deactivated: true, updatedAt: s.firestoreApi.serverTimestamp() }, { merge: true }); }
export async function getUserProfile(uid) { const s = await getServices(); const snapshot = await s.firestoreApi.getDoc(s.firestoreApi.doc(s.db, 'users', uid)); return snapshot.exists() ? snapshot.data() : null; }
export async function setInstallPromptDismissed(uid, dismissed=true) { const s=await getServices();return s.firestoreApi.updateDoc(s.firestoreApi.doc(s.db,'users',uid),{apkPromptDismissed:Boolean(dismissed),updatedAt:s.firestoreApi.serverTimestamp()}); }
export async function getAccountEntitlement(uid) { const s=await getServices();const snapshot=await s.firestoreApi.getDoc(s.firestoreApi.doc(s.db,'entitlements',uid));if(!snapshot.exists())return 'Free';const entitlement=snapshot.data();const expiresAt=entitlement.expiresAt?.toMillis?.()||0;return ['Student+','Power'].includes(entitlement.plan)&&expiresAt>Date.now()?entitlement.plan:'Free'; }
export async function getDownloadUsage(uid,plan='Free') { const s=await getServices();const action=plan==='Free'?'download':'downloadBytes';const snapshot=await s.firestoreApi.getDoc(s.firestoreApi.doc(s.db,'rateLimits',`${uid}_${action}`));if(!snapshot.exists())return {count:0,bytes:0};const usage=snapshot.data();const windowMs=plan==='Free'?24*60*60_000:30*24*60*60_000;const startedAt=usage.windowStartedAt?.toMillis?.()||0;if(Date.now()-startedAt>=windowMs)return {count:0,bytes:0};return plan==='Free'?{count:Math.max(0,Number(usage.count)||0),bytes:0}:{count:0,bytes:Math.max(0,Number(usage.count)||0)}; }
export async function claimSuccessfulDownload(byteCount,plan='Free') { const s=await getServices();const user=s.auth.currentUser;if(!user)throw Object.assign(new Error('Sign in before downloading.'),{code:'app/not-authorized'});const bytes=Math.max(1,Math.round(Number(byteCount)||0));if(bytes>200*1024*1024)throw Object.assign(new Error('This file exceeds the download limit.'),{code:'app/download-limit'});const usageAction=plan==='Free'?'download':'downloadBytes';const usageWindow=plan==='Free'?24*60*60_000:30*24*60*60_000;const usageLimit=plan==='Free'?30:(plan==='Student+'?2:4)*1024*1024*1024;const usageIncrement=plan==='Free'?1:bytes;const usageRef=s.firestoreApi.doc(s.db,'rateLimits',`${user.uid}_${usageAction}`);const burstRef=s.firestoreApi.doc(s.db,'rateLimits',`${user.uid}_downloadBurst`);let result;await s.firestoreApi.runTransaction(s.db,async transaction=>{const [usageSnapshot,burstSnapshot]=await Promise.all([transaction.get(usageRef),transaction.get(burstRef)]);const next=(snapshot,action,increment,windowMs)=>{const previous=snapshot.exists()?snapshot.data():null;const startedAt=previous?.windowStartedAt?.toMillis?.()||0;const reset=!previous||Date.now()-startedAt>=windowMs;return {uid:user.uid,action,count:reset?increment:Number(previous.count||0)+increment,windowStartedAt:reset?s.firestoreApi.serverTimestamp():previous.windowStartedAt,updatedAt:s.firestoreApi.serverTimestamp()};};const usage=next(usageSnapshot,usageAction,usageIncrement,usageWindow);const burst=next(burstSnapshot,'downloadBurst',1,60_000);if(burst.count>8)throw Object.assign(new Error('Too many downloads at once.'),{code:'app/download-throttled'});if(usage.count>usageLimit)throw Object.assign(new Error('Download allowance reached.'),{code:'app/download-limit'});transaction.set(usageRef,usage);transaction.set(burstRef,burst);result=plan==='Free'?{count:usage.count,bytes:0}:{count:0,bytes:usage.count};});return result; }
export async function updateUserProfile(uid, profile) { const s = await getServices(); const publicProfile={ username:profile.username, course:profile.course, yearLevel:profile.yearLevel, bio:profile.bio, photoURL:profile.photoURL }; await s.firestoreApi.setDoc(s.firestoreApi.doc(s.db, 'users', uid), { ...publicProfile, updatedAt: s.firestoreApi.serverTimestamp() }, { merge: true }); return s.firestoreApi.setDoc(s.firestoreApi.doc(s.db, 'publicProfiles', uid), { ...publicProfile, updatedAt: s.firestoreApi.serverTimestamp() }, { merge: true }); }
export async function observeAuth(callback) { const s = await getServices(); return s.authApi.onAuthStateChanged(s.auth, callback); }
export async function observePosts(channelIds, onChange, onError) {
  const s=await getServices();
  const ids=[...new Set((channelIds||[]).map(String).filter(Boolean))];
  if(!ids.length){onChange([]);return ()=>{};}
  const groups=[];for(let index=0;index<ids.length;index+=30)groups.push(ids.slice(index,index+30));
  const snapshots=new Map();const initialized=new Set();
  const emit=()=>{
    if(initialized.size!==groups.length)return;
    const posts=[...snapshots.values()].flat().sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0));
    onChange(posts);
  };
  const stops=groups.map((group,index)=>{
    const query=s.firestoreApi.query(s.firestoreApi.collection(s.db,'posts'),s.firestoreApi.where('channelId','in',group));
    return s.firestoreApi.onSnapshot(query,snapshot=>{snapshots.set(index,snapshot.docs.map(doc=>({id:doc.id,...doc.data()})));initialized.add(index);emit();},onError);
  });
  return ()=>stops.forEach(stop=>stop());
}
export async function observeChannels(onChange, onError) { const s = await getServices(); return s.firestoreApi.onSnapshot(s.firestoreApi.collection(s.db, 'channels'), snapshot => onChange(snapshot.docs.map(doc => ({ id:doc.id, ...doc.data() }))), onError); }
export async function createCloudChannel(channel) { const s = await getServices();const ref=s.firestoreApi.doc(s.firestoreApi.collection(s.db,'channels'));const memberRef=s.firestoreApi.doc(s.db,'memberships',`${channel.ownerId}_${ref.id}`);const batch=s.firestoreApi.writeBatch(s.db);batch.set(ref,{...channel,createdAt:s.firestoreApi.serverTimestamp()});batch.set(memberRef,{uid:channel.ownerId,channelId:ref.id,joinedAt:s.firestoreApi.serverTimestamp()});await batch.commit();return ref.id; }
export async function updateCloudChannel(channelId, changes) { const s=await getServices(); return s.firestoreApi.updateDoc(s.firestoreApi.doc(s.db,'channels',String(channelId)),{...changes,updatedAt:s.firestoreApi.serverTimestamp()}); }
export async function observeUsers(onChange, onError) { const s = await getServices(); return s.firestoreApi.onSnapshot(s.firestoreApi.collection(s.db, 'publicProfiles'), snapshot => onChange(snapshot.docs.map(doc => ({ id:doc.id, ...doc.data() }))), onError); }
export async function observeMemberships(uid, onChange, onError) { const s = await getServices(); const query=s.firestoreApi.query(s.firestoreApi.collection(s.db, 'memberships'), s.firestoreApi.where('uid','==',uid)); return s.firestoreApi.onSnapshot(query, snapshot => onChange(snapshot.docs.map(doc => doc.data().channelId)), onError); }
export async function observeChannelNotificationPreferences(uid,onChange,onError) { const s=await getServices(); return s.firestoreApi.onSnapshot(s.firestoreApi.collection(s.db,'users',uid,'channelSettings'),snapshot=>onChange(snapshot.docs.filter(doc=>doc.data().muted===true).map(doc=>doc.id)),onError); }
export async function setChannelNotifications(uid,channelId,muted) { const s=await getServices(); const ref=s.firestoreApi.doc(s.db,'users',uid,'channelSettings',String(channelId)); return muted?s.firestoreApi.setDoc(ref,{channelId:String(channelId),muted:true,updatedAt:s.firestoreApi.serverTimestamp()}):s.firestoreApi.deleteDoc(ref); }
export async function setMembership(uid, channelId, joined) { const s = await getServices();const ref=s.firestoreApi.doc(s.db,'memberships',`${uid}_${channelId}`);const channelRef=s.firestoreApi.doc(s.db,'channels',String(channelId));return s.firestoreApi.runTransaction(s.db,async transaction=>{const [membership,channel]=await Promise.all([transaction.get(ref),transaction.get(channelRef)]);if(!channel.exists())throw Object.assign(new Error('Channel not found.'),{code:'app/not-found'});if(joined&&!membership.exists()){transaction.set(ref,{uid,channelId:String(channelId),joinedAt:s.firestoreApi.serverTimestamp()});transaction.update(channelRef,{members:Math.max(0,Number(channel.data().members)||0)+1});}if(!joined&&membership.exists()){transaction.delete(ref);transaction.update(channelRef,{members:Math.max(0,(Number(channel.data().members)||0)-1)});}}); }
export async function getChannelMemberCount(channelId) { const s=await getServices();const query=s.firestoreApi.query(s.firestoreApi.collection(s.db,'memberships'),s.firestoreApi.where('channelId','==',String(channelId)));const snapshot=await s.firestoreApi.getDocs(query);return snapshot.docs.map(item=>item.data()); }
export async function deleteCloudChannel(channelId) { const s=await getServices();return s.firestoreApi.deleteDoc(s.firestoreApi.doc(s.db,'channels',String(channelId))); }
export async function observeSaved(uid, onChange, onError) { const s = await getServices(); return s.firestoreApi.onSnapshot(s.firestoreApi.collection(s.db, 'users', uid, 'saved'), snapshot => onChange(snapshot.docs.map(doc => doc.id)), onError); }
export async function setSavedPost(uid, postId, saved) { const s = await getServices(); const ref=s.firestoreApi.doc(s.db, 'users', uid, 'saved', String(postId)); return saved ? s.firestoreApi.setDoc(ref,{postId:String(postId),savedAt:s.firestoreApi.serverTimestamp()}) : s.firestoreApi.deleteDoc(ref); }
export async function saveCloudMessage(message) { const s=await getServices();const ref=s.firestoreApi.doc(s.firestoreApi.collection(s.db,'messages'));await s.firestoreApi.setDoc(ref,{...message,seenBy:[message.senderId],createdAt:s.firestoreApi.serverTimestamp()});return ref; }
export async function deleteCloudMessage(messageId) { const s = await getServices(); return s.firestoreApi.deleteDoc(s.firestoreApi.doc(s.db, 'messages', String(messageId))); }
export async function updateCloudMessage(messageId, text) { const s = await getServices(); return s.firestoreApi.updateDoc(s.firestoreApi.doc(s.db,'messages',String(messageId)),{text,editedAt:s.firestoreApi.serverTimestamp()}); }
export async function observeMessages(conversationId, onChange, onError) { const s = await getServices(); const query=s.firestoreApi.query(s.firestoreApi.collection(s.db, 'messages'), s.firestoreApi.where('conversationId','==',conversationId)); return s.firestoreApi.onSnapshot(query, snapshot => onChange(snapshot.docs.map(doc=>({id:doc.id,...doc.data()})).sort((a,b)=>(a.createdAt?.seconds||0)-(b.createdAt?.seconds||0))), onError); }
export async function observeUserMessages(userId, onChange, onError) { const s = await getServices(); const query=s.firestoreApi.query(s.firestoreApi.collection(s.db,'messages'),s.firestoreApi.where('participants','array-contains',userId));return s.firestoreApi.onSnapshot(query,snapshot=>onChange(snapshot.docs.map(doc=>({id:doc.id,...doc.data()})).sort((a,b)=>(a.createdAt?.seconds||0)-(b.createdAt?.seconds||0))),onError); }
export async function markMessagesSeen(messages, userId) { const s=await getServices();const targets=messages.filter(message=>message.senderId!==userId&&!(message.seenBy||[]).includes(userId));if(!targets.length)return;const batch=s.firestoreApi.writeBatch(s.db);for(const message of targets)batch.update(s.firestoreApi.doc(s.db,'messages',String(message.id)),{seenBy:s.firestoreApi.arrayUnion(userId),seenAt:s.firestoreApi.serverTimestamp()});return batch.commit(); }
export async function markMessagePlayed(messageId, userId) { const s=await getServices();return s.firestoreApi.updateDoc(s.firestoreApi.doc(s.db,'messages',String(messageId)),{playedBy:s.firestoreApi.arrayUnion(userId),playedAt:s.firestoreApi.serverTimestamp()}); }
export async function observeFriendRequests(userId,onChange,onError) { const s=await getServices();let sent=[];let received=[];const emit=()=>onChange([...received,...sent].filter((item,index,all)=>all.findIndex(other=>other.id===item.id)===index));const sentQuery=s.firestoreApi.query(s.firestoreApi.collection(s.db,'friendRequests'),s.firestoreApi.where('senderId','==',userId));const receivedQuery=s.firestoreApi.query(s.firestoreApi.collection(s.db,'friendRequests'),s.firestoreApi.where('receiverId','==',userId));const stopSent=s.firestoreApi.onSnapshot(sentQuery,snapshot=>{sent=snapshot.docs.map(doc=>({id:doc.id,...doc.data()}));emit();},onError);const stopReceived=s.firestoreApi.onSnapshot(receivedQuery,snapshot=>{received=snapshot.docs.map(doc=>({id:doc.id,...doc.data()}));emit();},onError);return()=>{stopSent();stopReceived();}; }
export async function sendFriendRequest(senderId,receiverId) { return rateLimitedWrite('friendRequest',(transaction,s)=>transaction.set(s.firestoreApi.doc(s.db,'friendRequests',`${senderId}_${receiverId}`),{senderId,receiverId,status:'pending',createdAt:s.firestoreApi.serverTimestamp(),updatedAt:s.firestoreApi.serverTimestamp()})); }
export async function respondToFriendRequest(requestId,status) { const s=await getServices();return s.firestoreApi.updateDoc(s.firestoreApi.doc(s.db,'friendRequests',requestId),{status,updatedAt:s.firestoreApi.serverTimestamp()}); }
export async function observeBlocks(userId,onChange,onError) { const s=await getServices();const query=s.firestoreApi.query(s.firestoreApi.collection(s.db,'blocks'),s.firestoreApi.where('blockerId','==',userId));return s.firestoreApi.onSnapshot(query,snapshot=>onChange(snapshot.docs.map(doc=>doc.data().blockedId)),onError); }
export async function setUserBlocked(blockerId,blockedId,blocked) { const s=await getServices();const ref=s.firestoreApi.doc(s.db,'blocks',`${blockerId}_${blockedId}`);return blocked?s.firestoreApi.setDoc(ref,{blockerId,blockedId,createdAt:s.firestoreApi.serverTimestamp()}):s.firestoreApi.deleteDoc(ref); }
export async function saveCloudComment(postId, comment) { const s=await getServices();const ref=s.firestoreApi.doc(s.firestoreApi.collection(s.db,'posts',String(postId),'comments'));await s.firestoreApi.setDoc(ref,{...comment,createdAt:s.firestoreApi.serverTimestamp()});return ref; }
export async function deleteCloudComment(postId, commentId) { const s=await getServices();return s.firestoreApi.deleteDoc(s.firestoreApi.doc(s.db,'posts',String(postId),'comments',String(commentId))); }
export async function observeCloudComments(postId,onChange,onError) { const s=await getServices();return s.firestoreApi.onSnapshot(s.firestoreApi.collection(s.db,'posts',String(postId),'comments'),snapshot=>onChange(snapshot.docs.map(doc=>({id:doc.id,...doc.data()})).sort((a,b)=>(a.createdAt?.seconds||0)-(b.createdAt?.seconds||0))),onError); }
export async function observeCommentCounts(onChange,onError) { const s=await getServices();const query=s.firestoreApi.collectionGroup(s.db,'comments');return s.firestoreApi.onSnapshot(query,snapshot=>{const counts={};snapshot.docs.forEach(item=>{const postId=item.ref.parent.parent?.id;if(postId)counts[postId]=(counts[postId]||0)+1;});onChange(counts);},onError); }
export async function report(type, targetId, reason, userId) { return rateLimitedWrite('report',(transaction,s)=>{const ref=s.firestoreApi.doc(s.firestoreApi.collection(s.db,'reports'));transaction.set(ref,{type,targetId,reason,userId,createdAt:s.firestoreApi.serverTimestamp()});return ref;}); }
export async function saveCloudPost(post, userId) { const clean=Object.fromEntries(Object.entries({...post}).filter(([,value])=>value!==undefined));try{return await rateLimitedWrite('post',(transaction,s)=>transaction.set(s.firestoreApi.doc(s.db,'posts',String(post.id)),{...clean,createdAt:s.firestoreApi.serverTimestamp()}));}catch(error){error.studyloopOperation='post-write';throw error;} }
export async function deleteCloudPost(id) { const s = await getServices(); return s.firestoreApi.deleteDoc(s.firestoreApi.doc(s.db, 'posts', String(id))); }
export async function uploadAsset(file, path) {
  const s=await getServices();const ref=s.storageApi.ref(s.storage,path);const contentType=String(file.type||'').split(';')[0].trim().toLowerCase();
  const emit=(status,progress=0)=>document.dispatchEvent(new CustomEvent('studyloop-upload-progress',{detail:{id:path,name:file.name||'Upload',status,progress}}));
  const task=s.storageApi.uploadBytesResumable(ref,file,{contentType,customMetadata:{ownerUid:s.auth.currentUser?.uid||'',uploadedAt:new Date().toISOString(),scanStatus:'unverified'}});
  emit('uploading',0);
  await new Promise((resolve,reject)=>task.on('state_changed',snapshot=>emit('uploading',snapshot.totalBytes?Math.round(snapshot.bytesTransferred/snapshot.totalBytes*100):0),error=>{emit('error',0);error.studyloopOperation='upload';reject(error);},()=>{emit('complete',100);resolve();}));
  return s.storageApi.getDownloadURL(task.snapshot.ref);
}
export async function deleteUploadedAsset(url) { const s=await getServices();if(!url)return;return s.storageApi.deleteObject(s.storageApi.ref(s.storage,url)); }
