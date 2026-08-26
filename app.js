import './styles.css';
import { signUp, signIn, signOutUser, sendPasswordReset, deactivateUser, report, saveCloudPost, deleteCloudPost, uploadAsset, deleteUploadedAsset, observeAuth, observePosts, getUserProfile, getAccountEntitlement, updateUserProfile, setInstallPromptDismissed, observeChannels, createCloudChannel, observeUsers, observeMemberships, setMembership, observeSaved, setSavedPost, saveCloudMessage, deleteCloudMessage, updateCloudMessage, observeMessages, observeUserMessages, markMessagesSeen, markMessagePlayed, observeFriendRequests, sendFriendRequest, respondToFriendRequest, observeBlocks, setUserBlocked, saveCloudComment, deleteCloudComment, observeCloudComments } from './firebase.js';
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const icon = (name, cls = '') => `<svg class="icon ${cls}"><use href="#i-${name}"></use></svg>`;
const logo = () => `<img class="brand-logo" src="/studyloop-logo.png" alt="StudyLoop logo" />`;
const STUDYLOOP_URL = 'https://study-loop-one.vercel.app/';
const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[character]));
const safeAssetUrl = value => /^https:\/\/firebasestorage\.googleapis\.com\//i.test(String(value||'')) ? escapeHtml(value) : '';
const safeStorageName = file => `${crypto.randomUUID()}${(String(file?.name||'').match(/\.[a-z0-9]{1,8}$/i)||[''])[0].toLowerCase()}`;
const IMAGE_TYPES = ['image/jpeg','image/png','image/webp'];
const AUDIO_TYPES = ['audio/mpeg','audio/mp4','audio/ogg','audio/wav','audio/webm'];
const DOCUMENT_TYPES = ['application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','text/plain'];
const ALLOWED_UPLOAD_TYPES = new Set([...IMAGE_TYPES,...AUDIO_TYPES,...DOCUMENT_TYPES]);
const UPLOAD_ACCEPT = [...ALLOWED_UPLOAD_TYPES].join(',');
const baseMimeType = value => String(value||'').split(';')[0].trim().toLowerCase();
const uploadKind = file => IMAGE_TYPES.includes(baseMimeType(file?.type))?'image':AUDIO_TYPES.includes(baseMimeType(file?.type))?'audio':DOCUMENT_TYPES.includes(baseMimeType(file?.type))?'document':'';
const preferredAudioMimeType = () => ['audio/webm;codecs=opus','audio/webm','audio/mp4','audio/ogg'].find(type=>window.MediaRecorder?.isTypeSupported?.(type))||'';
const audioRecorderOptions = () => { const mimeType=preferredAudioMimeType();return {...(mimeType?{mimeType}:{}),audioBitsPerSecond:24000}; };
const audioExtension = type => ({'audio/mp4':'m4a','audio/ogg':'ogg','audio/mpeg':'mp3','audio/wav':'wav'})[baseMimeType(type)]||'webm';
function microphoneError(error) {
  if(!window.isSecureContext)return 'Microphone requires a secure HTTPS connection.';
  if(error?.name==='NotAllowedError'||error?.name==='SecurityError')return 'Microphone access is blocked. Enable it for StudyLoop in phone Settings, then try again.';
  if(error?.name==='NotFoundError')return 'No microphone was found on this device.';
  return 'Unable to start the microphone. Check StudyLoop permissions and try again.';
}
let activeRecorder;
let activeRecordingStream;
let recordingTimer;
let recordingStartedAt=0;
let recordingElapsedMs=0;
let discardActiveRecording=false;
let recordingAudioContext;
let recordingAnalyser;
let recordingAnimationFrame;
let commentRecorder;
let commentRecordingStream;
let commentRecordingTimer;
let commentRecordingStartedAt=0;
let discardCommentRecording=false;
let scrollChannelToLatest=false;
let lastHistoryPage=null;
let handlingPopState=false;

const state = {
  page: 'landing',
  isGuest: false,
  isAuthenticated: false,
  authMode: 'signin',
  userEmail: '',
  userId: '',
  profileName: 'Anonymous Student',
  profileBio: 'Learning in public, one study session at a time.',
  profileCourse: '',
  profileYear: '',
  profilePhotoURL: '',
  apkPromptDismissed: false,
  subscriptionPlan: 'Free',
  storageAddons: 0,
  storageUsedMB: 0,
  downloadsUsedMB: 0,
  feedFilter: 'All',
  channelMode: 'joined',
  channelSearch: '',
  channelMessageSearch: '',
  channelSearchOpen: false,
  chatSearch: '',
  activeChat: 0,
  activeChannel: 0,
  channelTab: 'posts',
  friendTab: 'friends',
  peopleSearch: '',
  activePost: 0,
  activeSetting: 'Personal information',
  sentRequests: new Set(),
  acceptedRequests: new Set(),
  messageRequests: [],
  blockedUsers: new Set(),
  relations: [],
  readNotifications: new Set(),
  unreadMessageIds: new Set(),
  profileUser: null,
  saved: new Set(),
  joined: new Set(),
  memberChannelIds: new Set(),
  recordedAudio: null,
  recordedAudioURL: '',
  recordedAudioDuration: 0,
  channelRecording: false,
  channelRecordingPaused: false,
  channelRecordingLocked: false,
  commentAudio: null,
  commentAudioURL: '',
  commentAudioDuration: 0,
  commentRecording: false,
  chatAudio: null,
  chatAudioURL: '',
  chatAudioDuration: 0,
  chatRecording: false,
  chatRecordingPaused: false,
  chatRecordingLocked: false,
  replyToMessage: null,
  replyToCommentId: null,
};

const formatMediaTime = seconds => `${Math.floor(Math.max(0,seconds)/60)}:${String(Math.floor(Math.max(0,seconds))%60).padStart(2,'0')}`;
const waveformMarkup = (count=34) => `<span class="voice-waveform" aria-hidden="true">${Array.from({length:count},(_,index)=>`<i style="--bar:${18+((index*17)%28)}%"></i>`).join('')}</span>`;

function voiceNotePlayer(url,duration=0,label='Voice note',options={}) {
  const safeUrl=safeAssetUrl(url);
  if(!safeUrl)return '';
  const person=options.person||null;
  return `<div class="voice-note-player ${options.listened?'is-listened':''}" data-voice-player ${options.messageId?`data-message-id="${escapeHtml(options.messageId)}"`:''} ${options.mine?'data-mine="true"':''}>${person?`<span class="voice-sender-avatar">${avatar(person)}<i>${icon('mic')}</i></span>`:`<span class="voice-mic-status">${icon('mic')}</span>`}<button type="button" class="voice-play" data-action="toggle-voice-note" aria-label="Play ${escapeHtml(label)}"><span class="voice-play-glyph"></span></button><div class="voice-track">${waveformMarkup()}<span class="voice-note-time" data-voice-time>${formatMediaTime(duration)}</span></div><button type="button" class="voice-speed" data-action="voice-speed" aria-label="Playback speed">1x</button><audio preload="metadata" src="${safeUrl}"></audio></div>`;
}

function hydrateVoicePlayers() {
  $$('[data-voice-player]').forEach(player=>{const audio=player.querySelector('audio');const time=player.querySelector('[data-voice-time]');if(!audio||!time)return;const updateDuration=()=>{if(Number.isFinite(audio.duration)&&audio.duration>0&&!audio.currentTime)time.textContent=formatMediaTime(audio.duration);};if(audio.readyState>=1)updateDuration();else audio.addEventListener('loadedmetadata',updateDuration,{once:true});});
}

const channels = [];
const posts = [];
const people = [];
const friendRequests = [];
const discoverPeople = [];
const discussionComments = {};
const notifications = [];
const chats = [];
const activeUploads = new Map();
let inboxMessages=[];

function syncPostCommentCount(postId, count) {
  const post=posts.find(item=>String(item.id)===String(postId));
  if(post)post.comments=Math.max(0,Number(count)||0);
}

function normalizeDiscussionComment(comment) {
  return {
    id:comment.id,
    parentId:comment.parentId||null,
    authorId:comment.authorId||'',
    initials:initials(comment.author),
    name:comment.author,
    authorPhotoURL:comment.authorPhotoURL||'',
    ago:comment.createdAt?.toDate?relativeTime(comment.createdAt):relativeTime(comment.createdAt||new Date()),
    text:comment.text||'',
    imageURL:comment.imageURL||'',
    audioURL:comment.audioURL||'',
    audioDuration:Number(comment.audioDuration)||0
  };
}

function initials(name='StudyLoop') { return name.split(/\s+/).filter(Boolean).slice(0,2).map(part=>part[0]).join('').toUpperCase(); }
function avatar(person, cls='') { const known=person?.id?people.find(profile=>profile.id===person.id):person?.authorId?people.find(profile=>profile.id===person.authorId):null;const photoURL=safeAssetUrl((person?.authorId&&known?.photoURL)||person?.photoURL||person?.authorPhotoURL||known?.photoURL);return `<div class="avatar ${escapeHtml(cls)}">${photoURL?`<img src="${photoURL}" alt="${escapeHtml(person?.name||person?.author||'User')}" />`:escapeHtml(person?.initials||initials(person?.name||person?.author))}</div>`; }
function currentUserAvatar() { return avatar({ initials:initials(state.profileName), name:state.profileName, photoURL:state.profilePhotoURL }); }
function applyProfile(profile={}) { profile=profile||{}; state.profileName=profile.username||state.profileName; state.profileBio=profile.bio||''; state.profileCourse=profile.course||''; state.profileYear=profile.yearLevel||''; state.profilePhotoURL=profile.photoURL||'';state.apkPromptDismissed=profile.apkPromptDismissed===true; }
function syncChats() { const old=[...chats];const oldSaved=old.find(chat=>chat.saved);const saved={ person:{initials:'SM',name:'Saved Messages',info:'Personal cloud storage',status:'Private'},time:oldSaved?.time||'',preview:oldSaved?.preview||'',messages:oldSaved?.messages||[],saved:true }; chats.splice(0,chats.length,saved,...people.map(person=>{const existing=old.find(chat=>chat.person?.id===person.id);return{person,time:existing?.time||'',preview:existing?.preview||'',messages:existing?.messages||[],unread:existing?.unread||0};}));applyInboxMessages(); }
function conversationIdFor(index=state.activeChat) { if(index===0)return `saved_${state.userId}`; const peer=people[index-1]; return [state.userId,peer?.id].filter(Boolean).sort().join('_'); }
function applyInboxMessages() {
  if(!state.userId)return;
  for(const chat of chats)if(!chat.saved)chat.unread=0;
  const incoming=inboxMessages.filter(message=>message.senderId&&message.senderId!==state.userId&&!(message.seenBy||[]).includes(state.userId));
  for(const message of incoming){
    const peer=people.find(person=>person.id===message.senderId);if(!peer)continue;
    const chat=chats.find(item=>item.person?.id===peer.id);if(!chat)continue;
    chat.preview=message.type==='attachment'?'Shared a file':message.type==='postLink'?'Shared a post':message.text||'New message';
    chat.time=message.createdAt?.toDate?message.createdAt.toDate().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}):'Now';
    const isOpen=state.page==='messages'&&state.chatOpen&&chats[state.activeChat]?.person?.id===peer.id;
    if(!isOpen){chat.unread=(chat.unread||0)+1;state.unreadMessageIds.add(message.id);}
  }
  const existing=new Set(notifications.map(item=>item.messageId).filter(Boolean));
  for(const message of incoming.slice(-20)){
    if(existing.has(message.id))continue;
    const peer=people.find(person=>person.id===message.senderId);if(!peer)continue;
    const sentAt=message.createdAt?.toMillis?.()||Date.now();
    const recent=notifications.find(item=>item.senderId===message.senderId&&sentAt-(item.createdAt?.toMillis?.()||item.createdAtMs||0)<60_000);
    if(recent){recent.count=(recent.count||1)+1;recent.messageId=message.id;recent.body=`${recent.count} new messages`;recent.createdAt=message.createdAt;recent.createdAtMs=sentAt;continue;}
    notifications.unshift({id:`message-${message.id}`,messageId:message.id,senderId:message.senderId,count:1,icon:'chat',title:`New message from ${peer.name}`,body:message.type==='attachment'?'Sent you a file':message.type==='postLink'?'Shared a post with you':message.text||'New message',createdAt:message.createdAt,createdAtMs:sentAt});
  }
  if(notifications.length>20)notifications.splice(20);
}
function notify(message) { const t=$('#toast'); t.textContent=message; t.classList.add('show'); clearTimeout(notify.timer); notify.timer=setTimeout(()=>t.classList.remove('show'),2200); }
function renderUploadProgress() {
  let panel=$('#upload-progress-panel');
  if(!activeUploads.size){panel?.remove();return;}
  const composer=$('#channel-compose-form,#chat-form');
  if(panel&&composer&&!composer.contains(panel)){panel.remove();panel=null;}
  if(!panel){if(composer){composer.insertAdjacentHTML('afterbegin','<aside class="upload-progress-panel inline-upload-progress" id="upload-progress-panel" aria-live="polite"></aside>');}else{document.body.insertAdjacentHTML('beforeend','<aside class="upload-progress-panel" id="upload-progress-panel" aria-live="polite"></aside>');}panel=$('#upload-progress-panel');}
  panel.innerHTML=[...activeUploads.values()].map(upload=>`<div class="upload-progress-item ${upload.status}"><div><strong>${escapeHtml(upload.name)}</strong><span>${upload.status==='error'?'Upload failed':upload.status==='complete'?'Upload complete':`Uploading · ${upload.progress}%`}</span></div><div class="upload-progress-track"><i style="width:${Math.max(0,Math.min(100,upload.progress))}%"></i></div></div>`).join('');
}
document.addEventListener('studyloop-upload-progress',event=>{
  const upload=event.detail||{};if(!upload.id)return;activeUploads.set(upload.id,upload);renderUploadProgress();
  if(upload.status==='complete'||upload.status==='error')setTimeout(()=>{activeUploads.delete(upload.id);renderUploadProgress();},upload.status==='complete'?900:3500);
});
function persistApkDismissal() {
  localStorage.setItem('studyloop_apk_prompt_dismissed','1');state.apkPromptDismissed=true;
  if(state.isAuthenticated&&state.userId)setInstallPromptDismissed(state.userId,true).catch(error=>console.warn('Unable to save install prompt preference.',error));
}
function relativeTime(value) {
  const date=value?.toDate ? value.toDate() : value?.seconds ? new Date(value.seconds*1000) : value ? new Date(value) : null;
  if(!date || Number.isNaN(date.getTime())) return 'just now';
  const seconds=Math.max(0,Math.floor((Date.now()-date.getTime())/1000));
  if(seconds<60) return 'just now';
  if(seconds<3600) return `${Math.floor(seconds/60)}m ago`;
  if(seconds<86400) return `${Math.floor(seconds/3600)}h ago`;
  if(seconds<604800) return `${Math.floor(seconds/86400)}d ago`;
  return date.toLocaleDateString([], { month:'short', day:'numeric', year:'numeric' });
}
function userFacingError(error, fallback='Something went wrong.') {
  const code=String(error?.code||'');
  const messages={
    'auth/invalid-credential':'Email or password is incorrect.',
    'auth/invalid-email':'Enter a valid email address.',
    'auth/user-not-found':'Email or password is incorrect.',
    'auth/wrong-password':'Email or password is incorrect.',
    'auth/email-already-in-use':'An account already exists with this email.',
    'auth/weak-password':'Choose a stronger password.',
    'permission-denied':'You do not have permission to complete this action.',
    'firestore/permission-denied':'You do not have permission to complete this action.',
    'storage/unauthorized':'You do not have permission to access this file.',
    'storage/quota-exceeded':'Storage is temporarily unavailable. Try again later.',
    'auth/too-many-requests':'Too many attempts. Try again later.',
    'auth/network-request-failed':'Check your internet connection and try again.',
    'app/rate-limited':'You’re doing that too quickly. Please wait and try again.',
    'app/not-authorized':'Sign in again before trying this action.',
    'account/deactivated':'This account has been deactivated.'
  };
  return messages[code]||fallback;
}
async function loadAccountEntitlement(userId) {
  try { state.subscriptionPlan=await getAccountEntitlement(userId); }
  catch (error) { console.warn('Unable to load account entitlement.',error);state.subscriptionPlan='Free'; }
}
async function waitForUserProfile(userId) {
  for(let attempt=0;attempt<8;attempt+=1){const profile=await getUserProfile(userId);if(profile)return profile;await new Promise(resolve=>setTimeout(resolve,150));}
  return null;
}

function navButton(page,label,ico,badge='') {
  return `<button class="nav-btn ${state.page===page?'active':''} ${badge?'has-unread':''}" data-nav="${page}">${icon(ico)}<span>${label}</span>${badge?`<b class="nav-badge">${badge}</b>`:''}</button>`;
}

function shell(content,title,actions=true) {
  const unreadMessages=chats.filter(chat=>!chat.saved&&chat.unread>0).length;
  const immersive=state.page==='channel-detail'||state.page==='post-detail'||(state.page==='messages'&&state.chatOpen);
  return `<div class="app-shell ${immersive?'immersive':''}">
    <aside class="sidebar">
      <div class="brand"><span class="brand-mark">${logo()}</span><span>StudyLoop</span></div>
      <nav class="nav">
        ${navButton('home','Home','home')}${navButton('channels','Channels','grid')}${navButton('messages','Messages','chat',unreadMessages)}${navButton('friends','Friends','users')}${navButton('saved','Saved','bookmark')}${navButton('pricing','Plans','bookmark')}${navButton('profile','Profile','user')}
      </nav>
      <div class="side-profile" data-nav="profile">${state.isGuest?avatar({initials:'G'}):currentUserAvatar()}<div><strong>${escapeHtml(state.isGuest?'Guest browsing':state.profileName)}</strong><div class="muted small">${escapeHtml(state.isGuest?'Sign in to participate':(state.profileCourse||'Add your course'))}</div></div></div>
    </aside>
    <main class="main">
      <header class="topbar"><h1>StudyLoop</h1><div class="top-actions"><button class="pricing-header" data-nav="pricing">Plans</button>${state.isGuest?`<button class="guest-chip" data-action="sign-in">Guest · Sign in</button>`:''}${actions?`<button class="icon-btn" data-action="search" aria-label="Search">${icon('search')}</button><button class="icon-btn" data-nav="saved" aria-label="Saved posts">${icon('bookmark')}</button>`:''}</div></header>
      <div class="content">${content}</div>
    </main>
    <nav class="mobile-nav">${navButton('home','Home','home')}${navButton('channels','Channels','grid')}${navButton('messages','Messages','chat',unreadMessages)}${navButton('friends','Friends','users')}${navButton('profile','Profile','user')}</nav>
  </div>`;
}

function landingPage() {
  return `<div class="landing-page">
    <header class="landing-nav"><div class="landing-brand"><span class="brand-mark">${logo()}</span><span>StudyLoop</span></div><button class="landing-login" data-action="sign-in">Sign in</button></header>
    <main class="landing-main">
      <section class="landing-copy"><div class="landing-kicker"><span></span> Built for university life</div><p>One calm place for course channels, shared notes, private messages, and the people you study with.</p><div class="powered-line"><span>Powered by</span><strong>Scheke Innnovationhub</strong><a href="https://scheke.com" target="_blank" rel="noopener noreferrer">Visit us</a></div><div class="landing-actions"><button class="landing-primary" data-action="sign-in">Sign in with email ${icon('arrow')}</button><button class="landing-secondary" data-action="continue-guest">Continue as guest</button></div></section>
    </main>
    <footer class="landing-footer"><span>StudyLoop</span><span>Channels · Messages · Friends · Saved</span></footer>
  </div>`;
}

function authModal(message='Sign in to make StudyLoop yours') {
  const signingUp=state.authMode==='signup';
  return `<div class="modal-backdrop auth-backdrop" data-action="close-modal"><form class="modal auth-modal" id="auth-form" autocomplete="on"><div class="auth-book"><span class="brand-mark">${logo()}</span></div><div class="modal-head"><div><h2>Welcome to StudyLoop</h2><p>${message}</p></div><button type="button" class="icon-btn" data-action="close-modal">${icon('x')}</button></div><div class="segment auth-tabs"><button class="${state.authMode==='signin'?'active':''}" data-auth-mode="signin" type="button">Sign in</button><button class="${state.authMode==='signin'?'':'active'}" data-auth-mode="signup" type="button">Create account</button></div><div class="form-grid">${signingUp?`<div class="field"><label>Username</label><input name="username" maxlength="80" required autocomplete="username" placeholder="Choose a username" /></div>`:''}<div class="field"><label>Email</label><input type="email" name="email" maxlength="254" required autocomplete="${signingUp?'email':'username'}" placeholder="you@example.com" /></div><div class="field"><label>Password</label><input type="password" name="password" required minlength="${signingUp?8:6}" autocomplete="${signingUp?'new-password':'current-password'}" placeholder="${signingUp?'At least 8 characters':'Enter your password'}" /></div>${signingUp?`<label class="terms-check"><input type="checkbox" name="terms" required /> I accept the <button type="button" class="inline-link" data-nav="terms">Terms & Conditions</button> and <button type="button" class="inline-link" data-nav="privacy">Privacy Policy</button>.</label>`:''}<button class="primary auth-submit" ${signingUp?'disabled aria-disabled="true"':''}>${signingUp?'Create account':'Sign in'}</button></div><div class="auth-divider"><span>or</span></div><button type="button" class="secondary auth-guest" data-action="continue-guest">Continue as guest</button></form></div>`;
}

function legalPage(kind) {
  const terms=kind==='terms';
  return shell(`<div class="stack"><button class="back-link" data-nav="landing">${icon('arrow')} Back</button><section class="card section-card legal-page"><h2>${terms?'Terms & Conditions':'Privacy Policy'}</h2><p class="muted">StudyLoop · Last updated August 2026</p>${terms?`<h3>Using StudyLoop</h3><p>Use StudyLoop respectfully for learning and genuine communication. You are responsible for your account and anything you publish.</p><h3>Content and channels</h3><p>Do not upload unlawful, harmful, misleading, or infringing material. Channel owners and members should follow applicable school policies.</p><h3>Account access</h3><p>We may restrict access when these terms are violated or when needed to protect the service.</p>`:`<h3>Information we collect</h3><p>We store account details, profile information, posts, messages, memberships, and uploaded content needed to provide StudyLoop.</p><h3>How we use it</h3><p>Your information is used to authenticate you, deliver features, protect the service, and improve reliability. We do not display your private account data publicly.</p><h3>Your choices</h3><p>You can update your profile, delete your own posts where supported, and contact StudyLoop about privacy requests.</p>`}</section></div>`,terms?'Terms & Conditions':'Privacy Policy',false);
}

function openAuthModal(message) {
  if (!document.querySelector('.auth-backdrop')) document.body.insertAdjacentHTML('beforeend',authModal(message));
}

function guestNeedsSignIn(message) {
  if (state.isAuthenticated) return false;
  openAuthModal(message);
  return true;
}

function postCard(post) {
  post={...post,audioURL:safeAssetUrl(post.audioURL)};
  const saved=state.saved.has(post.id);
  const channelIndex=channels.findIndex(channel=>channel.name===post.course);
  const authorIndex=people.findIndex(person=>person.id===post.authorId);
  const imageUrl=safeAssetUrl(post.imageURL); const audioUrl=safeAssetUrl(post.audioURL); const fileUrl=safeAssetUrl(post.file?.url);
  return `<article class="card feed-card" data-post="${escapeHtml(post.id)}">
    <div class="post-head">${avatar({ ...post, photoURL:post.authorPhotoURL||post.photoURL },post.avatar||'')}<div class="post-who">${authorIndex>=0?`<button class="post-author" data-profile="${authorIndex}">${escapeHtml(post.author)}</button>`:`<strong class="post-author">${escapeHtml(post.author)}</strong>`}<div class="post-meta">${escapeHtml(relativeTime(post.createdAt||post.ago))}</div></div>${channelIndex>=0?`<button class="course-label" data-open-channel="${channelIndex}" aria-label="Open ${escapeHtml(post.course)}"><span class="dot-icon">${escapeHtml(post.icon)}</span><span>From <b>#${escapeHtml(post.course)}</b></span>${icon('chevron')}</button>`:`<span class="course-label"><span class="dot-icon">${escapeHtml(post.icon)}</span><span>From <b>#${escapeHtml(post.course)}</b></span></span>`}<button class="action" data-action="more" aria-label="More">${icon('more')}</button></div>
    ${post.text?`<p class="post-text">${escapeHtml(post.text)}</p>`:''}
    ${imageUrl?`<img class="post-image" src="${imageUrl}" alt="Post attachment" data-action="zoom-image" />`:''}
    ${post.file?`<div class="file-card"><div class="file-icon">PDF</div><div class="file-info"><strong>${escapeHtml(post.file.name)}</strong><span>${escapeHtml(post.file.meta)}</span></div>${fileUrl?`<a class="download" href="${fileUrl}" download target="_blank" rel="noopener" aria-label="Download">${icon('download')}</a>`:`<button class="download" data-action="download" aria-label="Download">${icon('download')}</button>`}</div>`:''}
    ${post.audioURL?`<audio class="post-audio" controls src="${post.audioURL}"></audio>`:post.audio?`<div class="audio"><button class="play" data-action="play" aria-label="Play voice note">▶</button><div class="wave"></div><span class="muted small">01:45</span></div>`:''}
    ${post.note?`<div class="file-card" style="background:#fffaf0;min-height:100px;justify-content:center;color:#7d694c"><strong>0/1 Knapsack</strong><span class="muted"> recurrence → dp[i][w] = max(…)</span></div>`:''}
    <div class="post-actions"><button class="action" data-action="comments">${icon('chat')} ${post.comments}</button><button class="action push ${saved?'active':''}" data-action="save">${icon('bookmark')} <span>${saved?'Saved':'Save'}</span></button><button class="action" data-action="share">${icon('share')} <span>Share</span></button>${post.author===state.profileName?`<button class="action" data-action="delete-post">Delete</button>`:''}</div>
  </article>`;
}

function savedPage() {
  const savedPosts=posts.filter(p=>state.saved.has(p.id)&&canViewPost(p));
  return shell(savedPosts.length?`<div class="page-grid"><div class="stack">${savedPosts.map(postCard).join('')}</div><aside class="stack right-rail"><section class="card section-card"><h3 style="margin-top:0">Saved for later</h3><p class="muted">Your bookmarked posts, PDFs, voice notes and other useful learning materials live here.</p></section></aside></div>`:`<div class="card empty"><div class="channel-icon">${icon('bookmark')}</div><h3>No saved posts yet</h3><p>Bookmark useful discussions and study material to find them quickly later.</p><button class="primary" data-nav="home">Explore your feed</button></div>`,'Saved');
}

function profilePage() {
  const accountRows=[['user','Personal information'],['bell','Notifications'],['bookmark','Saved posts'],['grid','Plans & storage'],['download','Install StudyLoop'],['share','Share StudyLoop'],['users','Privacy & security']];
  const studyLine=[state.profileCourse,state.profileYear].filter(Boolean).join(' · ')||'Add your course and year level';
  const friendCount=state.relations.filter(relation=>relation.status==='accepted').length;
  return shell(`<div class="telegram-profile"><section class="telegram-profile-head">${currentUserAvatar()}<h2>${escapeHtml(state.profileName)}</h2><span>${escapeHtml(studyLine)}</span><p>${escapeHtml(state.profileBio||'Tell classmates a little about yourself.')}</p><button class="profile-edit-pill" data-action="edit-profile">Edit profile</button></section><nav class="profile-quick-stats" aria-label="Profile summary"><button data-nav="friends"><strong>${friendCount}</strong><span>Friends</span></button><button data-nav="channels"><strong>${state.joined.size}</strong><span>Channels</span></button><button data-nav="saved"><strong>${state.saved.size}</strong><span>Saved</span></button></nav><section class="telegram-settings-group"><h3>Account</h3>${accountRows.map(r=>`<button class="settings-row" data-setting="${escapeHtml(r[1])}"><span class="settings-icon">${icon(r[0])}</span><span>${escapeHtml(r[1])}</span>${icon('chevron','i-right')}</button>`).join('')}</section><section class="telegram-settings-group danger-group"><button class="settings-row logout-row" data-action="logout"><span class="settings-icon">${icon('arrow')}</span><span>Log out</span></button></section></div>`,'Profile',false);
}

async function deletePostAndAttachments(item) {
  await deleteCloudPost(item.id);
  await Promise.all([item.imageURL,item.audioURL,item.file?.url].filter(Boolean).map(url=>deleteUploadedAsset(url).catch(error=>console.warn('Unable to remove an attachment after deleting its post.',error))));
}
function canViewPost(post) { const index=channels.findIndex(channel=>channel.id===post.channelId||channel.name===post.course);const channel=channels[index];return Boolean(channel&&state.joined.has(index)); }

function settingsPage() {
  const setting=state.activeSetting;
  const copy={
    'Personal information':'Update the details classmates see on your profile.',
    'Privacy & security':'Control who can find you and how your account stays secure.',
  }[setting]||'Manage this area of your account.';
  const securityActions=setting==='Privacy & security'?`<button class="secondary" data-action="password-reset">Send password reset email</button><button class="secondary danger-action" data-action="deactivate-account">Deactivate account</button>`:'';
  const installAction=setting==='Install StudyLoop'?`<div class="install-settings-card"><img src="/studyloop-logo.png" alt="StudyLoop" /><div><strong>StudyLoop for Android</strong><p class="muted">Install the mobile app for a faster experience.</p><a class="primary apk-download" href="https://www.mediafire.com/file/cm39bwlcxgs2vd6/StudyLoop.apk/file" target="_blank" rel="noopener">Download APK ${icon('download')}</a></div></div>`:'';
  const shareAction=setting==='Share StudyLoop'?`<div class="app-share-card"><strong>Share StudyLoop</strong><p class="muted">Invite classmates to StudyLoop using the website link.</p><div class="app-link-row"><input id="studyloop-app-link" value="${STUDYLOOP_URL}" readonly aria-label="StudyLoop website link" /><button class="secondary" data-action="copy-app-link">Copy</button></div><a class="whatsapp-share" href="https://wa.me/?text=${encodeURIComponent(`Join me on StudyLoop: ${STUDYLOOP_URL}`)}" target="_blank" rel="noopener noreferrer">${icon('share')} Share to WhatsApp</a></div>`:'';
  return shell(`<div class="stack"><button class="back-link" data-nav="profile">${icon('arrow')} Back to profile</button><section class="card section-card"><h2 style="margin:0">${escapeHtml(setting)}</h2><p class="muted">${escapeHtml(copy)}</p>${installAction}${shareAction}<div class="settings-row">${icon('check')}<span>${setting==='Privacy & security'?'Profile visible to university members':escapeHtml(state.profileName)}</span></div><div class="settings-row">${icon('bell')}<span>${setting==='Privacy & security'?'Login alerts enabled':escapeHtml(state.userEmail||'No email loaded')}</span></div>${securityActions}</section></div>`,setting,false);
}

// Updated feed view: channel attribution is intentionally prominent on every post.
function homePage() {
  const filtered=posts.filter(p=>canViewPost(p)&&(state.feedFilter==='All'||p.course===state.feedFilter));
  const chips=['All',...channels.map(channel=>channel.name)];
  const friends=people.filter(person=>isAcceptedFriend(person.id));
  const feedContent=!channels.length?`<div class="card empty channel-empty-state"><div class="channel-icon">${icon('plus')}</div><h2>No channel created yet</h2><p class="muted">Create a channel to start sharing notes, questions, and study resources.</p><button class="primary" data-action="create-channel">Create a channel</button></div>`:filtered.length?filtered.map(postCard).join(''):`<div class="card empty"><div class="channel-icon">${icon('grid')}</div><h2>No posts yet</h2><p class="muted">Join a channel or create one to see study posts here.</p><button class="primary" data-nav="channels">Browse channels</button></div>`;
  const joinedChannels=channels.filter((channel,index)=>state.joined.has(index));
  return shell(`<div class="page-grid"><div class="stack">
    <div class="chips">${chips.map(c=>`<button class="chip ${state.feedFilter===c?'active':''}" data-filter="${c}">${c}</button>`).join('')}</div>
    <div class="stack">${feedContent}</div>
  </div><aside class="stack right-rail">
    <section class="card section-card"><div class="section-title"><h3>Your channels</h3><button class="link-btn" data-nav="channels">See all</button></div>${joinedChannels.slice(0,3).map(raw=>`<div class="mini-channel"><div class="channel-icon ${escapeHtml(raw.cls)}">${escapeHtml(raw.icon)}</div><div class="channel-body"><strong>${escapeHtml(raw.name)}</strong><span>${escapeHtml(raw.access||'Public')} channel</span></div>${icon('chevron')}</div>`).join('')||'<p class="muted">Join a channel to see its feed here.</p>'}</section>
    <section class="card section-card"><div class="section-title"><h3>Study circle</h3><span class="muted small">${friends.length} friends</span></div>${friends.length?friends.slice(0,3).map((p,i)=>`<div class="mini-channel" data-profile="${people.indexOf(p)}">${avatar(p,['','green','purple'][i])}<div class="channel-body"><strong>${escapeHtml(p.name)}</strong><span>${escapeHtml(p.status)}</span></div><button class="action" data-person-chat="${people.indexOf(p)}">${icon('chat')}</button></div>`).join(''):'<p class="muted">Accepted friends will appear here.</p>'}</section>
  </aside></div>`,'Home');
}

function channelsPage() {
  const list=channels.filter((c,i)=>(state.channelMode==='discover'||state.joined.has(i)||c.ownerId===state.userId)&&c.name.toLowerCase().includes(state.channelSearch.toLowerCase()));
  return shell(`<div class="telegram-directory"><div class="directory-tools"><div class="segment"><button class="${state.channelMode==='joined'?'active':''}" data-channel-mode="joined">Joined</button><button class="${state.channelMode==='discover'?'active':''}" data-channel-mode="discover">Discover</button></div><button class="new-channel-button" data-action="create-channel" aria-label="Create channel">${icon('plus')}</button></div><label class="search-box directory-search">${icon('search')}<input id="channel-search" placeholder="Search channels" value="${escapeHtml(state.channelSearch)}" /></label><section class="telegram-channel-list">${list.length?list.map(raw=>{const idx=channels.indexOf(raw),joined=!state.isGuest&&state.joined.has(idx);const preview=raw.desc||raw.sub||`${raw.access||'Public'} study channel`;return `<article class="telegram-channel-row"><button class="channel-row-main" data-open-channel="${idx}"><div class="channel-icon ${escapeHtml(raw.cls)}">${escapeHtml(raw.icon)}</div><span class="channel-row-copy"><span class="channel-row-top"><strong>${escapeHtml(raw.name)}</strong><small>${Number(raw.members)||0} members</small></span><span class="channel-row-preview">${escapeHtml(preview)}</span><span class="channel-row-meta">${raw.access==='Private'?icon('bookmark'):icon('users')} ${escapeHtml(raw.access||'Public')}${raw.course?` · ${escapeHtml(raw.course)}`:''}</span></span></button><span class="channel-row-action">${joined?`<button class="row-open" data-open-channel="${idx}" aria-label="Open ${escapeHtml(raw.name)}">${icon('chevron')}</button>`:`<button class="row-join" data-join="${idx}">Join</button>`}</span></article>`}).join(''):`<div class="telegram-empty"><div class="channel-icon">${icon('search')}</div><h3>No channels found</h3><p>Try another search or create a new channel.</p><button class="primary" data-action="create-channel">Create channel</button></div>`}</section></div>`,'Channels',false);
}

function messageBubble(message) {
  if (!Array.isArray(message) && message.type==='unread-divider') return `<div class="unread-divider"><span>Unread messages</span></div>`;
  if (!Array.isArray(message) && message.type==='text') {
    const reply=message.replyTo?`<div class="message-reply-preview"><b>${escapeHtml(message.replyTo.sender||'StudyLoop member')}</b><span>${escapeHtml(message.replyTo.text||'Attachment')}</span></div>`:'';
    return `<div class="bubble ${message.side}" data-message-id="${escapeHtml(message.id)}">${reply}<span>${escapeHtml(message.text)}</span><div class="bubble-footer"><button class="bubble-more" data-action="message-menu" aria-label="Message actions">${icon('more')}</button><span class="bubble-time">${escapeHtml(message.time)} ${message.edited?'edited · ':''}${message.side==='mine'?(message.seen?'&#10003;&#10003;':'&#10003;'):''}</span></div></div>`;
  }
  if (!Array.isArray(message) && message.type==='post-link') {
    const deleteButton=message.side==='mine'&&message.id&&!String(message.id).startsWith('bookmark-')?`<button class="message-delete" data-delete-message="${escapeHtml(message.id)}">Delete</button>`:'';
    return `<div class="bubble ${message.side} forwarded-bubble"><div class="forwarded-label">${icon('share')} Forwarded post</div><button class="post-link-card" data-open-post="${escapeHtml(message.postId)}">${icon('chevron')} Open original post</button><div class="bubble-footer">${deleteButton}<span class="bubble-time">${escapeHtml(message.time)} ${message.side==='mine'?(message.seen?'&#10003;&#10003;':'&#10003;'):''}</span></div></div>`;
  }
  if (!Array.isArray(message) && message.type==='attachment') {
    const file=message.file||{}; const fileUrl=safeAssetUrl(file.url);
    const sender=message.side==='mine'?{name:state.profileName,photoURL:state.profilePhotoURL,initials:initials(state.profileName)}:people.find(person=>person.id===message.senderId);
    return `<div class="bubble ${message.side} forwarded-bubble" data-message-id="${escapeHtml(message.id)}"><div class="forwarded-label">${icon('paperclip')} ${file.type?.startsWith('audio/')?'Voice note':'Shared file'}</div>${fileUrl&&file.type?.startsWith('audio/')?voiceNotePlayer(file.url,file.duration||0,'voice message',{messageId:message.id,mine:message.side==='mine',listened:message.listened,person:sender}):fileUrl?`<a class="forwarded-file" href="${fileUrl}" download="${escapeHtml(file.name||'download')}"><span class="file-icon">${file.type==='application/pdf'?'PDF':'FILE'}</span><span><b>${escapeHtml(file.name||'Attachment')}</b><small>${escapeHtml(file.meta||'')}</small></span>${icon('download')}</a>`:''}<div class="bubble-footer"><button class="bubble-more" data-action="message-menu" aria-label="Message actions">${icon('more')}</button><span class="bubble-time">${escapeHtml(message.time)} ${message.side==='mine'?(message.seen?'&#10003;&#10003;':'&#10003;'):''}</span></div></div>`;
  }
  if (!Array.isArray(message) && message.type==='forwarded-post') {
    let post=message.post||{};
    post={...post,course:escapeHtml(post.course),author:escapeHtml(post.author),text:escapeHtml(post.text),file:post.file?{...post.file,name:escapeHtml(post.file.name),meta:escapeHtml(post.file.meta)}:null};
    const fileUrl=safeAssetUrl(post.file?.url);
    const imageUrl=safeAssetUrl(post.imageURL);
    const audioUrl=safeAssetUrl(post.audioURL);
    const fileMarkup=post.file?(fileUrl?`<a class="forwarded-file" href="${fileUrl}" download="${post.file.name}"><span class="file-icon">PDF</span><span><b>${post.file.name}</b><small>${post.file.meta}</small></span>${icon('download')}</a>`:`<div class="forwarded-file"><span class="file-icon">PDF</span><span><b>${post.file.name}</b><small>${post.file.meta}</small></span></div>`):'';
    const deleteButton=message.side==='mine'&&message.id&&!String(message.id).startsWith('bookmark-')?`<button class="message-delete" data-delete-message="${escapeHtml(message.id)}">Delete</button>`:'';
    return `<div class="bubble ${message.side} forwarded-bubble"><div class="forwarded-label">${icon('bookmark')} Saved post</div><div class="forwarded-post"><strong>From #${post.course}</strong><span class="muted small">${post.author}</span>${post.text?`<p>${post.text}</p>`:''}${imageUrl?`<img class="saved-post-image" src="${imageUrl}" alt="Saved post attachment" data-action="zoom-image" />`:''}${fileMarkup}${audioUrl?voiceNotePlayer(post.audioURL,post.audioDuration||0,'saved voice note'):''}</div><div class="bubble-footer">${deleteButton}<span class="bubble-time">${escapeHtml(message.time)} ${message.side==='mine'?(message.seen?'&#10003;&#10003;':'&#10003;'):''}</span></div></div>`;
  }
  const own=message[0]==='mine'&&message[3];const editButton=own?`<button class="message-share" data-edit-message="${escapeHtml(message[3])}">Edit</button>`:'';const deleteButton=own?`<button class="message-delete" data-delete-message="${escapeHtml(message[3])}">Delete</button>`:'';
  return `<div class="bubble ${escapeHtml(message[0])}">${escapeHtml(message[1])}<div class="bubble-footer">${editButton}${deleteButton}<span class="bubble-time">${escapeHtml(message[2])} ${message[0]==='mine'?(message[4]?'&#10003;&#10003;':'&#10003;'):''}</span></div></div>`;
}

function chatComposer(blocked=false) {
  if(blocked)return `<div class="chat-compose blocked-compose">Unblock this user to send messages.</div>`;
  const draft=escapeHtml(localStorage.getItem(`studyloop-draft:${state.userId}:${conversationIdFor()}`)||'');
  const reply=state.replyToMessage?`<div class="compose-reply"><span><b>Replying to ${escapeHtml(state.replyToMessage.sender||'message')}</b><small>${escapeHtml(state.replyToMessage.text||'Attachment')}</small></span><button type="button" data-action="cancel-message-reply" aria-label="Cancel reply">${icon('x')}</button></div>`:'';
  return `${reply}<form class="channel-compose chat-telegram-compose ${state.chatRecording?'is-recording':state.chatAudioURL?'is-preview':''}" id="chat-form">
    <div class="channel-compose-idle"><button type="button" class="channel-compose-action" data-action="upload-saved" aria-label="Attach picture or document">${icon('paperclip')}</button><input id="message-input" autocomplete="off" maxlength="4000" placeholder="Message" value="${draft}" /><button type="button" class="channel-mic" data-action="record-chat-voice" aria-label="Record voice note">${icon('mic')}</button><button class="channel-send-text" aria-label="Send message">${icon('send')}</button></div>
    <div class="channel-compose-recording" aria-live="polite"><span class="recording-dot"></span><strong id="chat-record-time">${formatMediaTime(recordingElapsedMs/1000)}</strong>${waveformMarkup(42)}<button type="button" class="recording-cancel" data-action="discard-chat-voice">Cancel</button><button type="button" class="recording-pause ${state.chatRecordingPaused?'is-paused':''}" data-action="pause-chat-voice" aria-label="${state.chatRecordingPaused?'Resume':'Pause'} recording"><span></span></button><button type="button" class="recording-finish" data-action="finish-chat-voice" aria-label="Stop and preview">${icon('send')}</button></div>
    <div class="channel-compose-preview"><button type="button" class="voice-discard" data-action="discard-chat-voice" aria-label="Discard voice note">${icon('x')}</button><button type="button" class="voice-preview-play" data-action="play-chat-preview" aria-label="Play voice note"><span class="voice-play-glyph"></span></button><div class="voice-preview-track">${waveformMarkup(34)}<span id="chat-preview-time">${formatMediaTime(state.chatAudioDuration)}</span></div><audio id="chat-voice-preview" preload="metadata" src="${escapeHtml(state.chatAudioURL)}"></audio><button class="recording-finish" aria-label="Send voice note">${icon('send')}</button></div>
  </form>`;
}

function relationFor(userId) { return state.relations.find(relation=>(relation.senderId===state.userId&&relation.receiverId===userId)||(relation.receiverId===state.userId&&relation.senderId===userId)); }
function isAcceptedFriend(userId) { return relationFor(userId)?.status==='accepted'; }

function messagesPage() {
  if (!chats.length) syncChats();
  const chat=chats[state.activeChat]||chats[0];
  const visibleChats=chats.map((c,i)=>({c,i})).filter(({c})=>!c.saved&&(isAcceptedFriend(c.person?.id)||c.preview||c.unread)&&`${c.person?.name||''} ${c.preview||''}`.toLowerCase().includes(state.chatSearch.toLowerCase()));
  const isIncomingRequest=entry=>{const relation=relationFor(entry.c.person?.id);return relation?.status==='pending'&&relation.receiverId===state.userId;};
  const requestChats=visibleChats.filter(isIncomingRequest);
  const regularChats=visibleChats.filter(entry=>!isIncomingRequest(entry));
  const renderChat=({c,i})=>`<div class="conversation ${i===state.activeChat?'active':''}" data-chat="${i}">${avatar(c.person,['','green','purple','green'][i]||'')}<div class="conversation-copy"><div class="conversation-top"><strong>${escapeHtml(c.person.name)}</strong><span class="muted small">${escapeHtml(c.time)}</span></div><p>${escapeHtml(c.preview)}</p></div>${c.unread?`<span class="message-unread">${c.unread}</span>`:''}</div>`;
  const peerId=chat?.person?.id;
  const blocked=peerId&&state.blockedUsers.has(peerId);
  const pendingRequest=peerId?relationFor(peerId):null;
  return shell(`<div class="messages-layout ${state.chatOpen?'chat-open':''}">
    <section class="conversation-list"><div class="conversation-list-head"><strong>Chats</strong>${requestChats.length?`<span>${requestChats.length} request${requestChats.length===1?'':'s'}</span>`:''}</div><div class="conversation-search"><label class="search-box">${icon('search')}<input id="conversation-search" placeholder="Search conversations" value="${escapeHtml(state.chatSearch)}" /></label></div>${requestChats.length?`<div class="conversation-section-label">Message requests · ${requestChats.length}</div>${requestChats.map(renderChat).join('')}`:''}${regularChats.length?regularChats.map(renderChat).join(''):`<div class="telegram-empty compact-empty"><div class="channel-icon">${icon('chat')}</div><h3>${state.chatSearch?'No chats found':'No conversations yet'}</h3><p>${state.chatSearch?'Try another name or message.':'Message a classmate from Discover to start a conversation.'}</p></div>`}</section>
     <section class="chat-pane"><header class="chat-head"><button class="icon-btn back-mobile" data-action="back-chats">${icon('arrow')}</button><button class="chat-profile" ${peerId?`data-profile="${people.findIndex(person=>person.id===peerId)}"`:''}>${avatar(chat.person,chat.saved?'green':'')}<span><strong>${escapeHtml(chat.person.name)}</strong><small>${chat.saved?'Private saved space':escapeHtml(chat.person.status||'StudyLoop member')}</small></span></button>${pendingRequest?.status==='pending'&&peerId?`<span class="chat-request-label">${pendingRequest.receiverId===state.userId?'Message request':'Request pending'}</span>`:''}${pendingRequest?.status==='pending'&&pendingRequest.receiverId===state.userId?`<button class="secondary chat-request-action" data-request-action="declined" data-request-id="${escapeHtml(pendingRequest.id)}">Decline</button><button class="primary chat-request-action" data-request-action="accepted" data-request-id="${escapeHtml(pendingRequest.id)}">Accept</button>`:''}${peerId?`<button class="icon-btn push" data-action="chat-options" data-user-id="${escapeHtml(peerId)}" aria-label="Chat options">${icon('more')}</button>`:''}</header><div class="chat-messages" id="chat-messages">${chat.messages.map(messageBubble).join('')}</div>${chatComposer(blocked)}</section>
  </div>`,'Messages',false);
}

function profileChannelsFor(userIndex) {
  const user=people[userIndex];
  return user ? channels.map((channel,index)=>channel.ownerId===user.id?index:-1).filter(index=>index>=0) : [];
}

function userProfilePage() {
  const sourceUser=people[state.profileUser]||people[0];
  if(!sourceUser) return shell(`<div class="card empty"><h3>User profile unavailable</h3><p>This profile is no longer available.</p></div>`,'Profile',false);
  const user={...sourceUser,name:escapeHtml(sourceUser.name),info:escapeHtml(sourceUser.info),status:escapeHtml(sourceUser.status)};
  const userChannels=profileChannelsFor(state.profileUser);
  const isBlocked=state.blockedUsers.has(sourceUser.id);
  return shell(`<div class="telegram-profile public-telegram-profile"><button class="profile-back" data-nav="friends">${icon('arrow')}</button><section class="telegram-profile-head">${avatar(user,state.profileUser===1?'green':'')}<h2>${user.name}</h2><span>${user.info}</span><p>${user.status||'StudyLoop member'}</p><div class="public-profile-actions"><button data-person-chat="${state.profileUser}">${icon('chat')}<span>Message</span></button><button data-action="toggle-block-user" data-user-id="${escapeHtml(sourceUser.id)}">${icon('more')}<span>${isBlocked?'Unblock':'Block'}</span></button></div></section><section class="telegram-settings-group profile-channel-group"><div class="telegram-group-title"><h3>Channels</h3><span>${userChannels.length}</span></div>${userChannels.length?userChannels.map(idx=>{const c=channels[idx],joined=state.joined.has(idx);return `<div class="profile-channel-row"><button class="channel-row-main" data-open-channel="${idx}"><div class="channel-icon ${escapeHtml(c.cls)}">${escapeHtml(c.icon)}</div><span><strong>${escapeHtml(c.name)}</strong><small>${escapeHtml(c.sub||c.access+' channel')}</small></span></button>${joined?`<button class="row-open" data-open-channel="${idx}">${icon('chevron')}</button>`:`<button class="row-join" data-join="${idx}">Join</button>`}</div>`}).join(''):`<div class="telegram-empty compact-empty"><p>No public channels yet.</p></div>`}</section></div>`,'Profile',false);
}

function channelPostBubble(post) {
  const authorIndex=people.findIndex(person=>person.id===post.authorId);
  const mine=post.authorId===state.userId;
  const saved=state.saved.has(post.id);
  const imageUrl=safeAssetUrl(post.imageURL);
  const fileUrl=safeAssetUrl(post.file?.url);
  const audioUrl=safeAssetUrl(post.audioURL);
  return `<div class="channel-message ${mine?'mine':''}">
    ${mine?'':avatar({...post,photoURL:post.authorPhotoURL},post.avatar||'')}
    <article class="channel-message-bubble" data-post="${escapeHtml(post.id)}">
      <div class="channel-message-head">${authorIndex>=0?`<button class="post-author" data-profile="${authorIndex}">${escapeHtml(post.author)}</button>`:`<strong>${escapeHtml(post.author)}</strong>`}<button class="action" data-action="more" aria-label="More options">${icon('more')}</button></div>
      ${post.text?`<p class="channel-message-text">${escapeHtml(post.text)}</p>`:''}
      ${imageUrl?`<img class="channel-message-image" src="${imageUrl}" alt="Post attachment" data-action="zoom-image" />`:''}
      ${post.file?`<div class="file-card compact-file"><div class="file-icon">${baseMimeType(post.file.type)==='application/pdf'?'PDF':'FILE'}</div><div class="file-info"><strong>${escapeHtml(post.file.name)}</strong><span>${escapeHtml(post.file.meta||'Document')}</span></div>${fileUrl?`<a class="download" href="${fileUrl}" download="${escapeHtml(post.file.name||'download')}" aria-label="Download ${escapeHtml(post.file.name||'file')}">${icon('download')}</a>`:''}</div>`:''}
      ${audioUrl?voiceNotePlayer(audioUrl,post.audioDuration||0):''}
      <div class="channel-message-footer"><button class="action comment-count" data-action="comments" aria-label="Comments">${icon('chat')} ${Number(post.comments)||0}</button><button class="action channel-share" data-action="share" aria-label="Share post">${icon('share')}</button><span>${escapeHtml(channelPostTime(post.createdAt))}</span></div>
    </article>
  </div>`;
}

function channelPostDate(value) {
  const date=value?.toDate?value.toDate():value?.seconds?new Date(value.seconds*1000):value?new Date(value):new Date();
  return Number.isNaN(date.getTime())?new Date():date;
}
function channelPostTime(value) { return channelPostDate(value).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}); }
function channelTimeline(channelPosts) {
  const ordered=[...channelPosts].sort((a,b)=>channelPostDate(a.createdAt)-channelPostDate(b.createdAt));
  let dateKey='';
  return ordered.map(post=>{
    const date=channelPostDate(post.createdAt);const nextKey=date.toDateString();
    const divider=nextKey===dateKey?'':`<div class="channel-day"><span>${date.toLocaleDateString([],{month:'long',day:'numeric',year:date.getFullYear()===new Date().getFullYear()?undefined:'numeric'})}</span></div>`;
    dateKey=nextKey;return `${divider}${channelPostBubble(post)}`;
  }).join('');
}

function channelComposer(channel,joined) {
  if(!joined)return `<div class="channel-join-note"><span>Join this channel to publish posts.</span><button class="primary" data-join="${state.activeChannel}">Join channel</button></div>`;
  return `<form class="channel-compose ${state.channelRecording?'is-recording':state.recordedAudioURL?'is-preview':''}" id="channel-compose-form">
    <div class="channel-attachment-preview" aria-live="polite"></div>
    <div class="channel-compose-idle">
      <label class="channel-compose-action" aria-label="Attach picture, document, or audio">${icon('paperclip')}<input type="file" name="channelAssets" accept="${UPLOAD_ACCEPT}" multiple hidden /></label>
      <input name="channelText" maxlength="1000" autocomplete="off" placeholder="Message #${escapeHtml(channel.name)}" />
      <button type="button" class="channel-mic" data-action="record-channel-voice" aria-label="Record voice note">${icon('mic')}</button>
      <button class="channel-send-text" aria-label="Publish post">${icon('send')}</button>
    </div>
    <div class="channel-compose-recording" aria-live="polite">
      <span class="recording-dot"></span><strong id="channel-record-time">${formatMediaTime(recordingElapsedMs/1000)}</strong>${waveformMarkup(42)}
      <button type="button" class="recording-cancel" data-action="discard-channel-voice">Cancel</button>
      <button type="button" class="recording-pause ${state.channelRecordingPaused?'is-paused':''}" data-action="pause-channel-voice" aria-label="${state.channelRecordingPaused?'Resume':'Pause'} recording"><span></span></button>
      <button type="button" class="recording-finish" data-action="finish-channel-voice" aria-label="Stop and preview">${icon('send')}</button>
    </div>
    <div class="channel-compose-preview">
      <button type="button" class="voice-discard" data-action="discard-channel-voice" aria-label="Discard voice note">${icon('x')}</button>
      <button type="button" class="voice-preview-play" data-action="play-channel-preview" aria-label="Play voice note"><span class="voice-play-glyph"></span></button>
      <div class="voice-preview-track">${waveformMarkup(34)}<span id="channel-preview-time">${formatMediaTime(state.recordedAudioDuration)}</span></div>
      <audio id="channel-voice-preview" preload="metadata" src="${escapeHtml(state.recordedAudioURL)}"></audio>
      <button class="recording-finish" aria-label="Publish voice note">${icon('send')}</button>
    </div>
  </form>`;
}

function setChannelComposerMode(mode) {
  const composer=$('#channel-compose-form');
  if(!composer)return;
  composer.classList.toggle('is-recording',mode==='recording');
  composer.classList.toggle('is-preview',mode==='preview');
}

function clearChannelVoice() {
  clearInterval(recordingTimer);
  cancelAnimationFrame(recordingAnimationFrame);recordingAnimationFrame=0;
  recordingAudioContext?.close?.().catch(()=>{});recordingAudioContext=null;recordingAnalyser=null;
  activeRecordingStream?.getTracks?.().forEach(track=>track.stop());
  activeRecordingStream=null;
  if(state.recordedAudioURL)URL.revokeObjectURL(state.recordedAudioURL);
  state.recordedAudio=null;
  state.recordedAudioURL='';
  state.recordedAudioDuration=0;
  state.channelRecording=false;
  state.channelRecordingPaused=false;
  state.channelRecordingLocked=false;
  recordingElapsedMs=0;
  setChannelComposerMode('idle');
}

async function startChannelVoiceRecording() {
  if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder)throw Object.assign(new Error('Voice recording is not supported.'),{code:'media/unsupported'});
  clearChannelVoice();
  const stream=await navigator.mediaDevices.getUserMedia({audio:true});
  activeRecordingStream=stream;
  const AudioContextClass=window.AudioContext||window.webkitAudioContext;
  if(AudioContextClass){recordingAudioContext=new AudioContextClass();const source=recordingAudioContext.createMediaStreamSource(stream);recordingAnalyser=recordingAudioContext.createAnalyser();recordingAnalyser.fftSize=128;recordingAnalyser.smoothingTimeConstant=.72;source.connect(recordingAnalyser);}
  const chunks=[];
  activeRecorder=new MediaRecorder(stream,audioRecorderOptions());
  discardActiveRecording=false;
  activeRecorder.ondataavailable=event=>{if(event.data.size)chunks.push(event.data);};
  activeRecorder.onstop=()=>{
    clearInterval(recordingTimer);
    stream.getTracks().forEach(track=>track.stop());
    activeRecordingStream=null;
    cancelAnimationFrame(recordingAnimationFrame);recordingAnimationFrame=0;recordingAudioContext?.close?.().catch(()=>{});recordingAudioContext=null;recordingAnalyser=null;
    state.channelRecording=false;
    state.channelRecordingPaused=false;
    if(discardActiveRecording){discardActiveRecording=false;clearChannelVoice();return;}
    state.recordedAudio=new Blob(chunks,{type:activeRecorder.mimeType||'audio/webm'});
    state.recordedAudioDuration=Math.max(1,Math.round(recordingElapsedMs/1000));
    state.recordedAudioURL=URL.createObjectURL(state.recordedAudio);
    const preview=$('#channel-voice-preview');
    if(preview)preview.src=state.recordedAudioURL;
    const time=$('#channel-preview-time');
    if(time)time.textContent=formatMediaTime(state.recordedAudioDuration);
    setChannelComposerMode('preview');
  };
  activeRecorder.start(250);
  recordingElapsedMs=0;
  state.channelRecording=true;
  state.channelRecordingPaused=false;
  state.channelRecordingLocked=false;
  setChannelComposerMode('recording');
  const animateWaveform=()=>{if(!recordingAnalyser||!state.channelRecording)return;const data=new Uint8Array(recordingAnalyser.frequencyBinCount);recordingAnalyser.getByteFrequencyData(data);const bars=$$('#channel-compose-form .channel-compose-recording .voice-waveform i');bars.forEach((bar,index)=>{const value=data[index%data.length]||0;bar.style.height=`${Math.max(12,Math.min(100,12+value/255*88))}%`;});recordingAnimationFrame=requestAnimationFrame(animateWaveform);};animateWaveform();
  recordingTimer=setInterval(()=>{
    if(activeRecorder?.state==='recording')recordingElapsedMs+=100;
    const time=$('#channel-record-time');
    if(time)time.textContent=formatMediaTime(recordingElapsedMs/1000);
  },100);
}

function clearChatVoice() {
  clearInterval(recordingTimer);
  cancelAnimationFrame(recordingAnimationFrame);recordingAnimationFrame=0;
  recordingAudioContext?.close?.().catch(()=>{});recordingAudioContext=null;recordingAnalyser=null;
  activeRecordingStream?.getTracks?.().forEach(track=>track.stop());activeRecordingStream=null;
  if(state.chatAudioURL)URL.revokeObjectURL(state.chatAudioURL);
  state.chatAudio=null;state.chatAudioURL='';state.chatAudioDuration=0;
  state.chatRecording=false;state.chatRecordingPaused=false;state.chatRecordingLocked=false;
  recordingElapsedMs=0;
  const composer=$('#chat-form');composer?.classList.remove('is-recording','is-preview');
}

async function startChatVoiceRecording() {
  if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder)throw Object.assign(new Error('Voice recording is not supported.'),{code:'media/unsupported'});
  clearChatVoice();
  const stream=await navigator.mediaDevices.getUserMedia({audio:true});activeRecordingStream=stream;
  const AudioContextClass=window.AudioContext||window.webkitAudioContext;
  if(AudioContextClass){recordingAudioContext=new AudioContextClass();const source=recordingAudioContext.createMediaStreamSource(stream);recordingAnalyser=recordingAudioContext.createAnalyser();recordingAnalyser.fftSize=128;recordingAnalyser.smoothingTimeConstant=.72;source.connect(recordingAnalyser);}
  const chunks=[];activeRecorder=new MediaRecorder(stream,audioRecorderOptions());discardActiveRecording=false;
  activeRecorder.ondataavailable=event=>{if(event.data.size)chunks.push(event.data);};
  activeRecorder.onstop=()=>{clearInterval(recordingTimer);stream.getTracks().forEach(track=>track.stop());activeRecordingStream=null;cancelAnimationFrame(recordingAnimationFrame);recordingAnimationFrame=0;recordingAudioContext?.close?.().catch(()=>{});recordingAudioContext=null;recordingAnalyser=null;state.chatRecording=false;state.chatRecordingPaused=false;if(discardActiveRecording){discardActiveRecording=false;clearChatVoice();return;}state.chatAudio=new Blob(chunks,{type:activeRecorder.mimeType||'audio/webm'});state.chatAudioDuration=Math.max(1,Math.round(recordingElapsedMs/1000));state.chatAudioURL=URL.createObjectURL(state.chatAudio);const preview=$('#chat-voice-preview');if(preview)preview.src=state.chatAudioURL;const time=$('#chat-preview-time');if(time)time.textContent=formatMediaTime(state.chatAudioDuration);const composer=$('#chat-form');composer?.classList.remove('is-recording');composer?.classList.add('is-preview');};
  activeRecorder.start(250);recordingElapsedMs=0;state.chatRecording=true;state.chatRecordingPaused=false;state.chatRecordingLocked=false;const composer=$('#chat-form');composer?.classList.add('is-recording');composer?.classList.remove('is-preview');
  const animateWaveform=()=>{if(!recordingAnalyser||!state.chatRecording)return;const data=new Uint8Array(recordingAnalyser.frequencyBinCount);recordingAnalyser.getByteFrequencyData(data);const bars=$$('#chat-form .channel-compose-recording .voice-waveform i');bars.forEach((bar,index)=>{const value=data[index%data.length]||0;bar.style.height=`${Math.max(12,Math.min(100,12+value/255*88))}%`;});recordingAnimationFrame=requestAnimationFrame(animateWaveform);};animateWaveform();
  recordingTimer=setInterval(()=>{if(activeRecorder?.state==='recording')recordingElapsedMs+=100;const time=$('#chat-record-time');if(time)time.textContent=formatMediaTime(recordingElapsedMs/1000);},100);
}

function setCommentComposerMode(mode) {
  const composer=$('#comment-form');
  if(!composer)return;
  composer.classList.toggle('is-recording',mode==='recording');
  composer.classList.toggle('is-preview',mode==='preview');
}

function hydrateCommentRecorder() {
  const preview=$('#comment-voice-preview');
  if(preview&&state.commentAudioURL&&preview.src!==state.commentAudioURL)preview.src=state.commentAudioURL;
  const time=$('#comment-preview-time');
  if(time)time.textContent=formatMediaTime(state.commentAudioDuration);
  setCommentComposerMode(state.commentRecording?'recording':state.commentAudio?'preview':'idle');
}

function clearCommentVoice() {
  clearInterval(commentRecordingTimer);
  commentRecordingTimer=undefined;
  commentRecordingStream?.getTracks?.().forEach(track=>track.stop());
  commentRecordingStream=null;
  if(state.commentAudioURL)URL.revokeObjectURL(state.commentAudioURL);
  state.commentAudio=null;
  state.commentAudioURL='';
  state.commentAudioDuration=0;
  state.commentRecording=false;
  commentRecorder=undefined;
  setCommentComposerMode('idle');
}

function abandonCommentVoice() {
  if(commentRecorder&&['recording','paused'].includes(commentRecorder.state)){discardCommentRecording=true;commentRecorder.stop();}
  else clearCommentVoice();
}

async function startCommentVoiceRecording() {
  if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder)throw Object.assign(new Error('Voice recording is not supported.'),{code:'media/unsupported'});
  if(commentRecorder&&['recording','paused'].includes(commentRecorder.state))return;
  clearCommentVoice();
  const stream=await navigator.mediaDevices.getUserMedia({audio:true});
  commentRecordingStream=stream;
  const chunks=[];
  let recorder;
  try { recorder=new MediaRecorder(stream,audioRecorderOptions()); }
  catch(error){stream.getTracks().forEach(track=>track.stop());commentRecordingStream=null;throw error;}
  commentRecorder=recorder;
  discardCommentRecording=false;
  recorder.ondataavailable=event=>{if(event.data.size)chunks.push(event.data);};
  recorder.onerror=event=>{stream.getTracks().forEach(track=>track.stop());commentRecordingStream=null;state.commentRecording=false;notify(microphoneError(event.error));setCommentComposerMode('idle');};
  recorder.onstop=()=>{
    clearInterval(commentRecordingTimer);
    commentRecordingTimer=undefined;
    stream.getTracks().forEach(track=>track.stop());
    if(commentRecordingStream===stream)commentRecordingStream=null;
    state.commentRecording=false;
    if(discardCommentRecording){discardCommentRecording=false;clearCommentVoice();notify('Voice comment discarded');return;}
    if(!chunks.length){clearCommentVoice();notify('No audio was captured. Try recording again.');return;}
    state.commentAudio=new Blob(chunks,{type:recorder.mimeType||'audio/webm'});
    state.commentAudioDuration=Math.max(1,Math.round((Date.now()-commentRecordingStartedAt)/1000));
    state.commentAudioURL=URL.createObjectURL(state.commentAudio);
    hydrateCommentRecorder();
    notify('Listen to your voice comment, then send or discard it.');
  };
  try { recorder.start(250); }
  catch(error){stream.getTracks().forEach(track=>track.stop());commentRecordingStream=null;commentRecorder=undefined;throw error;}
  commentRecordingStartedAt=Date.now();
  state.commentRecording=true;
  setCommentComposerMode('recording');
  const time=$('#comment-record-time');
  if(time)time.textContent='0:00';
  commentRecordingTimer=setInterval(()=>{const target=$('#comment-record-time');if(target)target.textContent=formatMediaTime((Date.now()-commentRecordingStartedAt)/1000);},200);
}

function channelDetailPage() {
  const channelRaw=channels[state.activeChannel]||channels[0];
  if(!channelRaw)return shell(`<div class="card empty"><h3>Channel unavailable</h3><p>This channel could not be loaded.</p></div>`,'Channel',false);
  const channel={...channelRaw,name:escapeHtml(channelRaw.name),sub:escapeHtml(channelRaw.sub),access:escapeHtml(channelRaw.access),icon:escapeHtml(channelRaw.icon),cls:escapeHtml(channelRaw.cls)};
  const joined=!state.isGuest&&state.joined.has(state.activeChannel);
  const channelPosts=posts.filter(post=>(post.channelId===channelRaw.id||post.course===channelRaw.name)&&(channelRaw.access==='Public'||joined)&&(!state.channelMessageSearch||`${post.author||''} ${post.text||''} ${post.file?.name||''}`.toLowerCase().includes(state.channelMessageSearch.toLowerCase())));
  const files=channelPosts.filter(post=>post.file);
  const creator=channelRaw.ownerId===state.userId?{name:state.profileName,photoURL:state.profilePhotoURL,initials:initials(state.profileName)}:people.find(person=>person.id===channelRaw.ownerId);
  const createdDate=channelRaw.createdAt?.toDate?channelRaw.createdAt.toDate().toLocaleDateString([],{year:'numeric',month:'long',day:'numeric'}):'Date unavailable';
  const tabBody=state.channelTab==='files'
    ? `<div class="stack channel-tab-content">${files.length?files.map(post=>`<div class="card file-row"><div class="file-icon">${baseMimeType(post.file.type)==='application/pdf'?'PDF':'FILE'}</div><div class="file-info"><strong>${escapeHtml(post.file.name)}</strong><span>${escapeHtml(post.file.meta||'Document')} · From ${escapeHtml(post.author)}</span></div>${safeAssetUrl(post.file.url)?`<a class="download" href="${safeAssetUrl(post.file.url)}" download="${escapeHtml(post.file.name)}">${icon('download')}</a>`:''}</div>`).join(''):`<div class="card empty"><h3>No files yet</h3><p>Documents shared in this channel will appear here.</p></div>`}</div>`
    : `<div class="stack channel-tab-content"><section class="card section-card channel-info-sheet"><div class="channel-info-identity"><div class="channel-icon ${channel.cls}">${channel.icon}</div><h2>${channel.name}</h2><span>${channel.access} · ${Number(channelRaw.members)||0} members</span></div><p class="channel-info-description">${escapeHtml(channelRaw.desc||'No description provided.')}</p><button class="settings-row" data-channel-tab="files">${icon('paperclip')}<span><strong>Shared files</strong><small class="muted">${files.length} document${files.length===1?'':'s'}</small></span>${icon('chevron','i-right')}</button><div class="settings-row">${creator?avatar(creator):avatar({initials:'SL'})}<span><strong>Created by ${escapeHtml(creator?.name||'StudyLoop member')}</strong><small class="muted">${escapeHtml(createdDate)}</small></span></div><div class="settings-row">${icon(channelRaw.access==='Private'?'bookmark':'users')}<span>${channel.access} channel${channelRaw.course?` · ${escapeHtml(channelRaw.course)}`:''}${channelRaw.sub?` · ${channel.sub}`:''}</span></div>${joined?`<button class="secondary danger-action" data-leave="${state.activeChannel}">Leave channel</button>`:`<button class="primary" data-join="${state.activeChannel}">Join channel</button>`}</section></div>`;
  const postsMarkup=channelPosts.length?channelTimeline(channelPosts):`<div class="channel-conversation-empty"><div class="channel-icon ${channel.cls}">${channel.icon}</div><h3>No posts yet</h3><p>Start the conversation in this channel.</p></div>`;
  const body=state.channelTab==='posts'?`<section class="channel-conversation"><div class="channel-messages">${postsMarkup}</div><button class="channel-jump-bottom" data-action="channel-jump-bottom" aria-label="Jump to latest">${icon('chevron')}</button>${channelComposer(channelRaw,joined)}</section>`:tabBody;
  return shell(`<div class="channel-view"><header class="channel-chat-head"><button class="icon-btn" ${state.channelTab==='posts'?'data-nav="channels" aria-label="Back to channels"':'data-channel-tab="posts" aria-label="Back to posts"'}>${icon('arrow')}</button>${state.channelSearchOpen?`<label class="channel-inline-search">${icon('search')}<input id="channel-message-search" autocomplete="off" placeholder="Search this channel" value="${escapeHtml(state.channelMessageSearch)}" /></label><button class="icon-btn" data-action="close-channel-search" aria-label="Close search">${icon('x')}</button>`:`<div class="channel-icon ${channel.cls}">${channel.icon}</div><button class="channel-chat-title" data-channel-tab="about"><strong>${channel.name}</strong><span>${channel.access} channel · ${Number(channelRaw.members)||0} members</span></button>${state.channelTab==='posts'?`<button class="icon-btn" data-action="open-channel-search" aria-label="Search channel">${icon('search')}</button>`:''}<button class="icon-btn" data-channel-tab="about" aria-label="Channel information">${icon('more')}</button>`}</header><div class="channel-tabs"><button class="${state.channelTab==='posts'?'active':''}" data-channel-tab="posts">Posts</button><button class="${state.channelTab==='files'?'active':''}" data-channel-tab="files">Files</button><button class="${state.channelTab==='about'?'active':''}" data-channel-tab="about">About</button></div>${body}</div>`,'Channel',false);
}

function friendsPage() {
  const incoming=state.relations.filter(relation=>relation.receiverId===state.userId&&relation.status==='pending');
  const communicatedIds=new Set(inboxMessages.flatMap(message=>(message.participants||[]).filter(id=>id&&id!==state.userId)));
  const acceptedIds=new Set([...state.relations.filter(relation=>relation.status==='accepted').map(relation=>relation.senderId===state.userId?relation.receiverId:relation.senderId),...communicatedIds]);
  const tabs=[['friends','Friends'],['discover','Discover']];
  const tabBar=`<div class="segment friends-tabs" style="grid-template-columns:repeat(3,1fr)">${tabs.map(([id,label])=>`<button class="${state.friendTab===id?'active':''}" data-friend-tab="${id}">${label}</button>`).join('')}</div>`;
  const friendCards=people.map((raw,i)=>({raw,i})).filter(({raw})=>acceptedIds.has(raw.id)).map(({raw,i})=>{const p={...raw,name:escapeHtml(raw.name),info:escapeHtml(raw.info),status:escapeHtml(raw.status)};return `<article class="card person-card" data-profile="${i}">${avatar(p,['','green','purple','green'][i])}<div class="person-info"><strong>${p.name}</strong><span>${p.info}</span><span>${p.status}</span></div><button class="icon-btn" data-person-chat="${i}" aria-label="Message">${icon('chat')}</button></article>`}).join('')||`<div class="card empty"><h3>No friends yet</h3><p>Use Discover to find classmates and send a request.</p></div>`;
  const requestCards=incoming.map(relation=>{const raw=people.find(person=>person.id===relation.senderId);if(!raw)return'';const personIndex=people.indexOf(raw);return `<article class="card person-card">${avatar(raw)}<div class="person-info"><strong>${escapeHtml(raw.name)}</strong><span>${escapeHtml(raw.info)}</span><small>They can message you while you decide.</small></div><div class="friend-actions"><button class="icon-btn" data-person-chat="${personIndex}" aria-label="Message ${escapeHtml(raw.name)}">${icon('chat')}</button><button class="secondary" data-request-action="declined" data-request-id="${escapeHtml(relation.id)}">Decline</button><button class="primary" data-request-action="accepted" data-request-id="${escapeHtml(relation.id)}">Accept</button><button class="secondary danger-action" data-action="toggle-block-user" data-user-id="${escapeHtml(raw.id)}">Block</button></div></article>`}).join('')||`<div class="card empty"><div class="channel-icon green">${icon('check')}</div><h3>You're all caught up</h3><p>No pending friend requests.</p></div>`;
  const discoverCards=discoverPeople.filter(p=>`${p.name} ${p.info} ${p.status}`.toLowerCase().includes(state.peopleSearch.toLowerCase())).map((p,i)=>{const personIndex=people.indexOf(p);return `<article class="card person-card" data-profile="${personIndex}">${avatar(p,i===1?'green':'purple')}<div class="person-info"><strong>${escapeHtml(p.name)}</strong><span>${escapeHtml(p.info)}</span><span>${escapeHtml(p.status)}</span></div><button class="primary" data-person-chat="${personIndex}">${icon('chat')} Message</button></article>`}).join('')||`<div class="card empty"><h3>No users found</h3><p>Try another search.</p></div>`;
  const content=state.friendTab==='friends'?friendCards:discoverCards;
  return shell(`<div class="stack">${tabBar}<label class="search-box">${icon('search')}<input id="people-search" placeholder="Search people" value="${escapeHtml(state.peopleSearch)}" /></label><div class="people-grid">${content}</div></div>`,'Friends');
}

function postDetailPage() {
  const post=posts.find(p=>p.id===state.activePost)||posts[0];
  if(!post)return shell(`<div class="telegram-empty"><h3>Post unavailable</h3><p>This post may have been removed.</p></div>`,'Replies',false);
  const comments=discussionComments[post.id]||[];
  const ids=new Set(comments.map(comment=>comment.id));
  const renderComment=(c,isReply=false)=>{const authorIndex=people.findIndex(person=>person.id===c.authorId);return `<article class="discussion-message ${isReply?'comment-reply':''}">${avatar({name:c.name,photoURL:c.authorPhotoURL,initials:c.initials})}<div class="discussion-bubble"><div class="comment-heading">${authorIndex>=0?`<button data-profile="${authorIndex}">${escapeHtml(c.name)}</button>`:`<strong>${escapeHtml(c.name)}</strong>`}${c.authorId===state.userId?`<button class="comment-more" data-delete-comment="${escapeHtml(c.id)}" aria-label="Delete comment">${icon('more')}</button>`:''}</div>${c.text?`<p>${escapeHtml(c.text)}</p>`:''}${safeAssetUrl(c.imageURL)?`<img class="comment-image" src="${safeAssetUrl(c.imageURL)}" alt="Comment attachment" data-action="zoom-image" />`:''}${safeAssetUrl(c.audioURL)?voiceNotePlayer(c.audioURL,c.audioDuration,'voice comment'):''}<div class="discussion-message-footer">${!isReply&&c.id?`<button data-action="reply-comment" data-reply-comment="${escapeHtml(c.id)}">Reply</button>`:''}<span>${escapeHtml(c.ago||relativeTime(c.createdAt))}</span></div></div></article>`;};
  const roots=comments.filter(comment=>!comment.parentId||!ids.has(comment.parentId));
  const commentHtml=roots.map(root=>`<section class="discussion-thread">${renderComment(root)}${comments.filter(reply=>reply.parentId===root.id).map(reply=>renderComment(reply,true)).join('')}</section>`).join('');
  const replyNotice=state.replyToCommentId?`<div class="compose-reply discussion-reply-notice"><span><b>Replying to a comment</b><small>Replies are limited to one level.</small></span><button type="button" data-action="cancel-reply">${icon('x')}</button></div>`:'';
  return shell(`<div class="discussion-view"><header class="discussion-head"><button class="icon-btn" data-nav="home" aria-label="Back to feed">${icon('arrow')}</button><span><strong>Replies</strong><small>${comments.length} comment${comments.length===1?'':'s'}</small></span><button class="icon-btn" data-action="share" data-post="${escapeHtml(post.id)}" aria-label="Share post">${icon('share')}</button></header><div class="discussion-scroll"><div class="discussion-original">${postCard(post)}</div><div class="discussion-divider"><span>${comments.length?'Replies':'No replies yet'}</span></div><div class="discussion-list">${commentHtml||`<div class="telegram-empty compact-empty"><p>Be the first to reply.</p></div>`}</div></div>${replyNotice}<form id="comment-form" class="comment-compose telegram-comment-compose ${state.commentRecording?'is-recording':state.commentAudio?'is-preview':''}"><div class="comment-compose-idle"><label class="action comment-upload">${icon('paperclip')}<input type="file" name="commentImage" accept="image/jpeg,image/png,image/webp" hidden /></label><input name="comment" autocomplete="off" maxlength="2000" placeholder="${state.replyToCommentId?'Write a reply…':'Write a comment…'}" /><button type="button" class="action" data-action="record-comment-voice" aria-label="Record voice comment">${icon('mic')}</button><button class="send-btn" aria-label="Post comment">${icon('send')}</button></div><div class="comment-compose-recording"><i class="recording-dot"></i><strong id="comment-record-time">0:00</strong>${waveformMarkup(24)}<button type="button" class="recording-cancel" data-action="discard-comment-voice">Cancel</button><button type="button" class="recording-finish" data-action="finish-comment-voice" aria-label="Stop recording">${icon('send')}</button></div><div class="comment-compose-preview"><audio id="comment-voice-preview" controls preload="metadata"></audio><span id="comment-preview-time">${formatMediaTime(state.commentAudioDuration)}</span><button type="button" class="voice-comment-discard" data-action="discard-comment-voice" aria-label="Discard voice comment">${icon('trash')}</button><button class="send-btn" aria-label="Post voice comment">${icon('send')}</button></div></form></div>`,'Replies',false);
}

function notificationsPage() {
  const content=notifications.length?notifications.map(n=>`<article class="card notification-item ${state.readNotifications.has(n.id)?'read':''}"><div class="notification-icon">${icon(n.icon)}</div><div><strong>${n.title}</strong><p>${n.body}</p><span>${n.createdAt?escapeHtml(relativeTime(n.createdAt)):escapeHtml(n.time||'')}</span></div>${!state.readNotifications.has(n.id)?'<i></i>':''}</article>`).join(''):`<div class="card empty"><div class="notification-icon">${icon('bell')}</div><h3>No notifications</h3><p class="muted">You’re all caught up. New activity will appear here.</p></div>`;
  const permissionButton=typeof Notification!=='undefined'&&Notification.permission!=='granted'?'<button class="secondary" data-action="request-notifications">Enable notifications</button>':'';
  return shell(`<div class="stack"><div class="section-title"><div><h2 style="margin:0">Notifications</h2><p class="muted" style="margin:4px 0 0">Stay up to date with your learning circle.</p></div><span class="notification-actions">${permissionButton}${notifications.length?'<button class="secondary" data-action="mark-notifications-read">Mark all read</button>':''}</span></div>${content}</div>`,'Notifications',false);
}

function postComposerModal() {
  const channel=channels[state.activeChannel]||channels[0];
  const displayChannelName=escapeHtml(channel.name);
  return `<div class="modal-backdrop" data-action="close-modal"><form class="modal" id="post-form"><div class="modal-head"><div><h2>New post</h2><p class="muted" style="margin:4px 0 0">Posting in #${displayChannelName}</p></div><button type="button" class="icon-btn" data-action="close-modal">${icon('x')}</button></div><div class="field"><label>Text</label><textarea name="postText" maxlength="1000" placeholder="Ask a question, share a note, or start a discussion…"></textarea></div><div class="field"><label>Attachments</label><input type="file" name="assets" multiple accept="${UPLOAD_ACCEPT}" /><span class="muted small">Add one image, one document, and one audio file. Videos are not accepted. Each file is limited to 50 MB.</span></div><div class="voice-recorder"><button type="button" class="secondary" data-action="record-voice">${icon('mic')} Record voice note</button><span class="muted small" id="voice-status">Not recording</span><audio id="voice-preview" controls hidden></audio></div><div class="modal-actions"><button type="button" class="secondary" data-action="close-modal">Cancel</button><button class="primary">Publish post</button></div></form></div>`;
}

function profileEditorModal() {
  return `<div class="modal-backdrop" data-action="close-modal"><form class="modal" id="profile-form"><div class="modal-head"><h2>Edit profile</h2><button type="button" class="icon-btn" data-action="close-modal">${icon('x')}</button></div><div class="form-grid"><div class="field"><label>Profile picture</label><input type="file" name="profilePhoto" accept="image/jpeg,image/png,image/webp" /><span class="muted small">Choose a JPEG, PNG, or WebP image up to 10 MB.</span></div><div class="field"><label>Display name</label><input name="displayName" maxlength="80" required value="${escapeHtml(state.profileName)}" /></div><div class="field"><label>Course</label><input name="course" maxlength="120" value="${escapeHtml(state.profileCourse)}" placeholder="e.g. Computer Science" /></div><div class="field"><label>Year level</label><input name="yearLevel" maxlength="40" value="${escapeHtml(state.profileYear)}" placeholder="e.g. Year 3" /></div><div class="field"><label>Bio</label><textarea name="bio" maxlength="180" placeholder="Tell classmates about your learning interests.">${escapeHtml(state.profileBio)}</textarea></div></div><div class="modal-actions"><button type="button" class="secondary" data-action="close-modal">Cancel</button><button class="primary">Save changes</button></div></form></div>`;
}

function shareModal(postId) {
  const post=posts.find(p=>String(p.id)===String(postId));
  return `<div class="modal-backdrop" data-action="close-modal"><div class="modal share-modal"><div class="modal-head"><h2>Share this post</h2><button type="button" class="icon-btn" data-action="close-modal">${icon('x')}</button></div><p class="muted">Choose a destination for “${post?.course||'this post'}”.</p><div class="share-targets"><button class="share-target" data-share-target="saved"><div class="channel-icon green">${icon('bookmark')}</div><span><strong>Saved Messages</strong><small>Keep it in your personal cloud</small></span>${icon('chevron')}</button>${people.map((p,i)=>`<button class="share-target" data-share-target="${i}">${avatar(p,i===1?'green':'')}<span><strong>${p.name}</strong><small>${p.info}</small></span>${icon('chevron')}</button>`).join('')}</div></div></div>`;
}

function attachmentForwardModal(messageId) {
  return `<div class="modal-backdrop" data-action="close-modal"><div class="modal attachment-forward-modal" data-message-id="${escapeHtml(messageId)}"><div class="modal-head"><h2>Forward saved file</h2><button class="icon-btn" data-action="close-modal">${icon('x')}</button></div><div class="share-targets">${people.map((p,i)=>`<button class="share-target" data-forward-person="${i}">${avatar(p)}<span><strong>${escapeHtml(p.name)}</strong><small>Send in chat</small></span>${icon('chevron')}</button>`).join('')}${channels.map((c,i)=>state.joined.has(i)?`<button class="share-target" data-forward-channel="${i}"><div class="channel-icon ${escapeHtml(c.cls)}">${escapeHtml(c.icon)}</div><span><strong>${escapeHtml(c.name)}</strong><small>Post in channel</small></span>${icon('chevron')}</button>`:'').join('')}</div></div></div>`;
}

function createChannelModal() {
  return `<div class="modal-backdrop" data-action="close-modal"><form class="modal" id="channel-form"><div class="modal-head"><h2>Create channel</h2><button type="button" class="icon-btn" data-action="close-modal">${icon('x')}</button></div><div class="form-grid"><div class="field"><label>Channel name</label><input name="name" maxlength="50" required placeholder="e.g. SQL Queries & Joins" /></div><div class="field"><label>Description</label><textarea name="description" maxlength="250" placeholder="What is this channel about? Who is it for?"></textarea></div><div class="field"><label>Course</label><input name="course" placeholder="Type a course name" /></div><div class="field"><label>Module</label><input name="module" required placeholder="Type a module name" /></div><div class="field"><label>Visibility</label><div class="radio-row"><div class="radio-card selected" data-visibility="Public"><strong>Public</strong><div class="muted small">Anyone can discover and join.</div></div><div class="radio-card" data-visibility="Private"><strong>Private</strong><div class="muted small">Only invited members can join.</div></div></div></div></div><div class="modal-actions"><button type="button" class="secondary" data-action="close-modal">Cancel</button><button class="primary">Create channel</button></div></form></div>`;
}

function pricingPage() {
  const plans=[
    { name:'Free', price:0, storage:'100 MB', downloads:'100 MB/month', voice:'2 min', saved:'7', private:'No', addons:'No', tone:'free' },
    { name:'Student+', price:40, storage:'5 GB', downloads:'5 GB/month', voice:'10 min', saved:'Unlimited', private:'Yes', addons:'Yes', tone:'student' },
    { name:'Power', price:80, storage:'10 GB', downloads:'10 GB/month', voice:'10 min', saved:'Unlimited', private:'Yes', addons:'Yes', tone:'power' },
  ];
  const active=plans.find(plan=>plan.name===state.subscriptionPlan)||plans[0];
  const hasAddons=active.addons==='Yes';
  const recurringTotal=active.price+(hasAddons?state.storageAddons*20:0);
  const storageTotalMB=(Number.parseFloat(active.storage)||0)*(active.storage.includes('GB')?1024:1)+(state.storageAddons*1024);
  const storageLeftMB=Math.max(0,storageTotalMB-(Number(state.storageUsedMB)||0));
  const downloadTotalMB=Number.parseFloat(active.downloads)||0;
  const downloadsLeftMB=Math.max(0,downloadTotalMB-(Number(state.downloadsUsedMB)||0));
  const formatMB=value=>value>=1024?`${(value/1024).toFixed(value%1024?1:0)} GB`:`${Math.round(value)} MB`;
  const savedLimit=active.saved==='Unlimited'?null:Number(active.saved);
  const usageCards=`<section class="usage-summary card"><div class="usage-summary-head"><div><span class="pricing-eyebrow">YOUR USAGE</span><h3>What you have left</h3></div><span class="usage-plan">${active.name} plan</span></div><div class="usage-grid"><div class="usage-item"><span class="usage-label">Storage left</span><strong>${formatMB(storageLeftMB)}</strong><small>of ${formatMB(storageTotalMB)}</small><div class="usage-meter"><i style="width:${storageTotalMB?Math.min(100,(storageLeftMB/storageTotalMB)*100):0}%"></i></div></div><div class="usage-item"><span class="usage-label">Downloads left</span><strong>${formatMB(downloadsLeftMB)}</strong><small>this month</small><div class="usage-meter"><i style="width:${downloadTotalMB?Math.min(100,(downloadsLeftMB/downloadTotalMB)*100):0}%"></i></div></div><div class="usage-item"><span class="usage-label">Saved posts</span><strong>${savedLimit===null?'Unlimited':Math.max(0,savedLimit-state.saved.size)}</strong><small>${savedLimit===null?'no limit':`of ${savedLimit} remaining`}</small></div><div class="usage-item"><span class="usage-label">Channels joined</span><strong>${state.memberChannelIds.size||state.joined.size}</strong><small>active communities</small></div></div></section>`;
  const rows=[['Total upload storage','storage'],['Media download allowance','downloads'],['Max individual file','50 MB'],['Voice note length','voice'],['Saved posts','saved'],['Create public channels','Yes'],['Create private channels','private'],['Join private channels','Yes'],['Storage add-ons','addons']];
  return shell(`<div class="stack pricing-page">${usageCards}<section class="pricing-grid">${plans.map(plan=>`<article class="pricing-card ${plan.tone} ${state.subscriptionPlan===plan.name?'selected':''}"><div class="pricing-card-top"><h3>${plan.name}</h3><p>${plan.name==='Free'?'For getting started':plan.name==='Student+'?'More room for coursework':'For serious study communities'}</p></div><div class="plan-price"><strong>P${plan.price}</strong><span>/ month</span></div><div class="plan-storage">${icon('bookmark')} ${plan.storage} upload storage</div><ul><li>${plan.downloads} downloads</li><li>${plan.voice} voice notes</li><li>${plan.saved} saved posts</li><li>${plan.private==='Yes'?'Private channels included':'Public channels only'}</li></ul><button class="${state.subscriptionPlan===plan.name?'secondary':'primary'}" data-select-plan="${plan.name}">${state.subscriptionPlan===plan.name?'Current plan':plan.price?'Choose plan':'Stay free'}</button></article>`).join('')}</section><section class="card pricing-comparison"><div class="section-title"><div><h3>Compare plans</h3><p class="muted" style="margin:4px 0 0">All prices are monthly recurring payments in Pula.</p></div></div><div class="pricing-table-wrap"><table><thead><tr><th>Feature</th>${plans.map(plan=>`<th>${plan.name}</th>`).join('')}</tr></thead><tbody><tr><td>Monthly price</td>${plans.map(plan=>`<td><strong>P${plan.price}</strong></td>`).join('')}</tr>${rows.map(([label,key])=>`<tr><td>${label}</td>${plans.map(plan=>`<td>${key in plan?plan[key]:key}</td>`).join('')}</tr>`).join('')}</tbody></table></div></section></div>`,'Plans',false);
}

function render() {
  if(state.commentRecording&&state.page==='post-detail'&&$('#comment-form'))return;
  if(lastHistoryPage===null){try{history.replaceState({studyloopPage:state.page},'',location.href);}catch{};lastHistoryPage=state.page;}
  else if(!handlingPopState&&lastHistoryPage!==state.page){try{history.pushState({studyloopPage:state.page},'',location.href);}catch{};lastHistoryPage=state.page;}
  const pages={landing:landingPage,home:homePage,channels:channelsPage,messages:messagesPage,friends:friendsPage,saved:savedPage,pricing:pricingPage,profile:profilePage,settings:settingsPage,terms:()=>legalPage('terms'),privacy:()=>legalPage('privacy'),'user-profile':userProfilePage,'channel-detail':channelDetailPage,'post-detail':postDetailPage,notifications:notificationsPage};
  $('#app').innerHTML=(pages[state.page]||homePage)();
  hydrateVoicePlayers();
  if(state.page==='post-detail')hydrateCommentRecorder();
  if(state.page==='messages') requestAnimationFrame(()=>{const c=$('#chat-messages');if(c)c.scrollTop=c.scrollHeight;});
  if(state.page==='channel-detail'&&scrollChannelToLatest)requestAnimationFrame(()=>{const c=$('.channel-messages');if(c)c.scrollTop=c.scrollHeight;scrollChannelToLatest=false;});
}

function usageSummaryHtml(){
  const limits={Free:{storage:100,downloads:100,saved:7},'Student+':{storage:5120,downloads:5120,saved:null},Power:{storage:10240,downloads:10240,saved:null}};
  const limit=limits[state.subscriptionPlan]||limits.Free;
  const storageTotal=limit.storage+state.storageAddons*1024, storageLeft=Math.max(0,storageTotal-(state.storageUsedMB||0));
  const downloadsLeft=Math.max(0,limit.downloads-(state.downloadsUsedMB||0));
  const fmt=n=>n>=1024?`${(n/1024).toFixed(n%1024?1:0)} GB`:`${Math.round(n)} MB`;
  return `<section class="usage-summary card"><div class="usage-summary-head"><div><span class="pricing-eyebrow">YOUR USAGE</span><h3>What you have left</h3></div><span class="usage-plan">${escapeHtml(state.subscriptionPlan)} plan</span></div><div class="usage-grid"><div class="usage-item"><span class="usage-label">Storage left</span><strong>${fmt(storageLeft)}</strong><small>of ${fmt(storageTotal)}</small><div class="usage-meter"><i style="width:${storageTotal?storageLeft/storageTotal*100:0}%"></i></div></div><div class="usage-item"><span class="usage-label">Downloads left</span><strong>${fmt(downloadsLeft)}</strong><small>this month</small><div class="usage-meter"><i style="width:${limit.downloads?downloadsLeft/limit.downloads*100:0}%"></i></div></div><div class="usage-item"><span class="usage-label">Saved posts</span><strong>${limit.saved===null?'Unlimited':Math.max(0,limit.saved-state.saved.size)}</strong><small>${limit.saved===null?'no limit':'remaining'}</small></div><div class="usage-item"><span class="usage-label">Channels joined</span><strong>${state.memberChannelIds.size||state.joined.size}</strong><small>active communities</small></div></div></section>`;
}

document.addEventListener('click',e=>{
  const nav=e.target.closest('[data-nav]'); if(nav){
    const protectedPages=new Set(['messages','friends','saved','profile']);
    if(state.isGuest&&protectedPages.has(nav.dataset.nav)){openAuthModal('Sign in to access your personal StudyLoop space.');return;}
    if(state.page==='post-detail'&&nav.dataset.nav!=='post-detail')abandonCommentVoice();
    state.page=nav.dataset.nav;state.chatOpen=false;if(state.page==='messages'&&state.activeChat===0&&chats.length>1)state.activeChat=1;render();return;
  }
  const shareTarget=e.target.closest('[data-share-target]'); if(shareTarget){
    if(guestNeedsSignIn('Sign in to share posts with classmates or save them.')) return;
    const postId=String(document.querySelector('.share-modal')?.dataset.postId||state.sharePostId||''); const post=posts.find(p=>String(p.id)===postId);
    if(!post){notify('This post is no longer available.');return;}
    const target=shareTarget.dataset.shareTarget==='saved'?0:+shareTarget.dataset.shareTarget+1;
    state.activeChat=target; const participants=target===0?[state.userId]:[state.userId,people[target-1]?.id].filter(Boolean);
    saveCloudMessage({conversationId:conversationIdFor(target),participants,senderId:state.userId,type:'postLink',text:'Forwarded post',postId:String(post.id)}).then(()=>subscribeActiveMessages()).catch(error=>notify(userFacingError(error,'Unable to forward this post.')));
    document.querySelector('.modal-backdrop')?.remove(); state.page='messages'; state.chatOpen=true; notify(target===0?'Saved to Saved Messages':`Shared with ${chats[target].person.name}`); render(); return;
  }
  if(e.target.closest('[data-action="share-external"]')){const modal=e.target.closest('.share-modal');const url=`${STUDYLOOP_URL}?post=${encodeURIComponent(modal?.dataset.postId||state.sharePostId||'')}`;if(navigator.share)navigator.share({title:'StudyLoop post',text:'Check out this StudyLoop post',url}).catch(()=>{});else navigator.clipboard?.writeText(url).then(()=>notify('Post link copied')).catch(()=>notify('Unable to copy post link.'));return;}
  const filter=e.target.closest('[data-filter]'); if(filter){state.feedFilter=filter.dataset.filterIndex&&+filter.dataset.filterIndex>=0?channels[+filter.dataset.filterIndex]?.name||'All':'All';render();return;}
  const mode=e.target.closest('[data-channel-mode]'); if(mode){state.channelMode=mode.dataset.channelMode;render();return;}
  const channelTab=e.target.closest('[data-channel-tab]'); if(channelTab){state.channelTab=channelTab.dataset.channelTab;render();return;}
  const authMode=e.target.closest('[data-auth-mode]'); if(authMode){state.authMode=authMode.dataset.authMode;document.querySelector('.auth-backdrop')?.remove();openAuthModal();return;}
  const selectPlan=e.target.closest('[data-select-plan]'); if(selectPlan){if(guestNeedsSignIn('Sign in to choose a StudyLoop plan.'))return;notify('Plan activation requires verified billing setup.');return;}
  const setting=e.target.closest('[data-setting]'); if(setting){const name=setting.dataset.setting;if(name==='Notifications'){state.page='notifications';}else if(name==='Saved posts'){state.page='saved';}else if(name==='Plans & storage'){state.page='pricing';}else{state.activeSetting=name;state.page='settings';}render();return;}
  if(e.target.closest('[data-action="copy-app-link"]')){const input=$('#studyloop-app-link');navigator.clipboard?.writeText(STUDYLOOP_URL).then(()=>notify('StudyLoop link copied')).catch(()=>{input?.select();document.execCommand('copy');notify('StudyLoop link copied');});return;}
  const friendTab=e.target.closest('[data-friend-tab]'); if(friendTab){state.friendTab=friendTab.dataset.friendTab;render();return;}
  const requestAction=e.target.closest('[data-request-action]'); if(requestAction){respondToFriendRequest(requestAction.dataset.requestId,requestAction.dataset.requestAction).then(()=>notify(requestAction.dataset.requestAction==='accepted'?'Friend request accepted':'Friend request declined')).catch(error=>notify(userFacingError(error,'Unable to update this request.')));return;}
  const discoverAdd=e.target.closest('[data-discover-add]'); if(discoverAdd){const person=people.find(item=>item.id===discoverAdd.dataset.discoverAdd);const index=people.indexOf(person);if(index>=0){state.activeChat=index+1;state.page='messages';state.chatOpen=true;subscribeActiveMessages();render();}return;}
  const chat=e.target.closest('[data-chat]'); if(chat){if(guestNeedsSignIn('Sign in to read and send private messages.'))return;state.activeChat=+chat.dataset.chat;state.chatOpen=true;const selected=chats[state.activeChat];if(selected){selected.unread=0;const selectedConversation=conversationIdFor();inboxMessages.filter(message=>message.conversationId===selectedConversation).forEach(message=>state.unreadMessageIds.delete(message.id));}subscribeActiveMessages();render();return;}
  const savedChat=e.target.closest('[data-saved-chat]'); if(savedChat){if(guestNeedsSignIn('Sign in to access Saved Messages.'))return;state.activeChat=0;state.page='messages';state.chatOpen=true;subscribeActiveMessages();render();return;}
  const personChat=e.target.closest('[data-person-chat]'); if(personChat){if(guestNeedsSignIn('Sign in to message classmates.'))return;state.activeChat=+personChat.dataset.personChat+1;state.page='messages';state.chatOpen=true;subscribeActiveMessages();render();return;}
  const profile=e.target.closest('[data-profile]'); if(profile){state.profileUser=+profile.dataset.profile;state.page='user-profile';render();return;}
  const openPost=e.target.closest('[data-open-post]'); if(openPost){const index=posts.findIndex(item=>String(item.id)===String(openPost.dataset.openPost));if(index<0){notify('This post is no longer available.');return;}state.activePost=posts[index].id;state.page='post-detail';render();return;}
  const forwardMessage=e.target.closest('[data-forward-message]'); if(forwardMessage){document.body.insertAdjacentHTML('beforeend',attachmentForwardModal(forwardMessage.dataset.forwardMessage));return;}
  const forwardPerson=e.target.closest('[data-forward-person]');
  if(forwardPerson){const modal=forwardPerson.closest('[data-message-id]');const source=(chats[0]?.messages||[]).find(item=>!Array.isArray(item)&&item.id===modal?.dataset.messageId);const person=people[+forwardPerson.dataset.forwardPerson];if(source?.file&&person){saveCloudMessage({conversationId:[state.userId,person.id].sort().join('_'),participants:[state.userId,person.id],senderId:state.userId,type:'attachment',text:'Shared a file',file:source.file,...(source.file.type?.startsWith('audio/')?{playedBy:[state.userId]}:{})}).then(()=>{modal.closest('.modal-backdrop')?.remove();notify(`File sent to ${person.name}`);}).catch(error=>notify(userFacingError(error,'Unable to forward this file.')));}return;}
  const forwardChannel=e.target.closest('[data-forward-channel]');
  if(forwardChannel){const modal=forwardChannel.closest('[data-message-id]');const source=(chats[0]?.messages||[]).find(item=>!Array.isArray(item)&&item.id===modal?.dataset.messageId);const channel=channels[+forwardChannel.dataset.forwardChannel];if(source?.file&&channel&&state.joined.has(+forwardChannel.dataset.forwardChannel)){const id=String(Date.now());const post={id,initials:initials(state.profileName),author:state.profileName,authorId:state.userId,authorPhotoURL:state.profilePhotoURL,ago:'now',course:channel.name,channelId:channel.id,icon:channel.icon,text:'',comments:0,file:source.file};saveCloudPost(post,state.userId).then(()=>{modal.closest('.modal-backdrop')?.remove();notify(`File posted in ${channel.name}`);}).catch(error=>notify(userFacingError(error,'Unable to post this file.')));}return;}
  const join=e.target.closest('[data-join]'); if(join){if(guestNeedsSignIn('Sign in to join this channel.'))return;const idx=+join.dataset.join;const channel=channels[idx];if(state.joined.has(idx)){state.activeChannel=idx;state.page='channel-detail';render();}else{setMembership(state.userId,channel.id,true).then(()=>notify(`Joined ${channel.name}`)).catch(error=>notify(userFacingError(error,channel.access==='Private'?'This private channel requires an invitation.':'Unable to join this channel.')));}return;}
  const leave=e.target.closest('[data-leave]'); if(leave){if(guestNeedsSignIn('Sign in to manage your channel membership.'))return;const idx=+leave.dataset.leave;const channel=channels[idx];if(channel.ownerId===state.userId){notify('Channel owners must remove members before leaving.');return;}setMembership(state.userId,channel.id,false).then(()=>notify(`Left ${channel.name}`)).catch(error=>notify(userFacingError(error,'Unable to leave this channel.')));return;}
  const openChannel=e.target.closest('[data-open-channel]'); if(openChannel){state.activeChannel=+openChannel.dataset.openChannel;state.channelTab='posts';state.page='channel-detail';scrollChannelToLatest=true;render();return;}
  const deleteComment=e.target.closest('[data-delete-comment]');
  if(deleteComment){const comment=(discussionComments[state.activePost]||[]).find(item=>item.id===deleteComment.dataset.deleteComment);if(comment?.authorId!==state.userId){notify('You can only delete your own comment.');return;}if(confirm('Delete this comment?'))Promise.all([deleteCloudComment(state.activePost,comment.id),deleteUploadedAsset(comment.imageURL).catch(()=>{}),deleteUploadedAsset(comment.audioURL).catch(()=>{})]).then(()=>notify('Comment deleted')).catch(error=>notify(userFacingError(error,'Unable to delete this comment.')));return;}
  const deleteMessage=e.target.closest('[data-delete-message]');
  if(deleteMessage){
    const messageId=deleteMessage.dataset.deleteMessage;
    if(messageId){
      deleteCloudMessage(messageId).catch(error=>notify(userFacingError(error,'Unable to delete this saved item.')));
    }
    return;
  }
  const editMessage=e.target.closest('[data-edit-message]');
  if(editMessage){const current=editMessage.closest('.bubble')?.childNodes?.[0]?.textContent?.trim()||'';const next=prompt('Edit message',current)?.trim();if(next&&next!==current)updateCloudMessage(editMessage.dataset.editMessage,next).catch(error=>notify(userFacingError(error,'Unable to edit this message.')));return;}
  const action=e.target.closest('[data-action]'); if(!action)return;
  if(action.dataset.action==='dismiss-apk'){const prompt=action.closest('[data-apk-prompt]');if(prompt?.querySelector('[data-apk-never]')?.checked)persistApkDismissal();prompt?.remove();return;}
  if(action.dataset.action==='download-apk'){persistApkDismissal();return;}
  const post=action.closest('[data-post]');
  if(action.dataset.action==='message-menu'){
    const bubble=action.closest('[data-message-id]');const messageId=bubble?.dataset.messageId;const source=inboxMessages.find(message=>String(message.id)===String(messageId));if(!source)return;
    const own=source.senderId===state.userId;const attachment=source.type==='attachment';
    document.body.insertAdjacentHTML('beforeend',`<div class="modal-backdrop message-menu-backdrop" data-action="close-modal" data-message-id="${escapeHtml(messageId)}"><div class="post-menu"><button class="secondary" data-action="reply-message">${icon('chat')} Reply</button>${own&&source.type==='text'?`<button class="secondary" data-action="edit-message-menu">Edit message</button>`:''}${attachment?`<button class="secondary" data-action="forward-message-menu">${icon('share')} Forward</button>`:''}${own?`<button class="secondary danger-action" data-action="delete-message-menu">Delete message</button>`:''}<button class="secondary" data-action="close-modal">Cancel</button></div></div>`);return;
  }
  if(['reply-message','edit-message-menu','forward-message-menu','delete-message-menu'].includes(action.dataset.action)){
    const menu=action.closest('[data-message-id]');const messageId=menu?.dataset.messageId;const source=inboxMessages.find(message=>String(message.id)===String(messageId));if(!source)return;
    if(action.dataset.action==='reply-message'){const sender=source.senderId===state.userId?state.profileName:(people.find(person=>person.id===source.senderId)?.name||'StudyLoop member');state.replyToMessage={id:messageId,sender,text:source.text||source.file?.name||'Attachment'};menu.remove();render();setTimeout(()=>$('#message-input')?.focus(),0);return;}
    if(action.dataset.action==='edit-message-menu'){const next=prompt('Edit message',source.text||'')?.trim();if(next&&next!==source.text)updateCloudMessage(messageId,next).catch(error=>notify(userFacingError(error,'Unable to edit this message.')));menu.remove();return;}
    if(action.dataset.action==='forward-message-menu'){menu.remove();document.body.insertAdjacentHTML('beforeend',attachmentForwardModal(messageId));return;}
    if(action.dataset.action==='delete-message-menu'){if(confirm('Delete this message?'))deleteCloudMessage(messageId).catch(error=>notify(userFacingError(error,'Unable to delete this message.')));menu.remove();return;}
  }
  if(action.dataset.action==='zoom-image'){document.body.insertAdjacentHTML('beforeend',`<div class="image-lightbox" data-action="close-modal"><img src="${action.src}" alt="Expanded attachment" /></div>`);return;}
  if(action.dataset.action==='channel-jump-bottom'){const list=action.closest('.channel-conversation')?.querySelector('.channel-messages');list?.scrollTo({top:list.scrollHeight,behavior:'smooth'});return;}
  if(action.dataset.action==='open-channel-search'){state.channelSearchOpen=true;render();setTimeout(()=>$('#channel-message-search')?.focus(),0);return;}
  if(action.dataset.action==='close-channel-search'){state.channelSearchOpen=false;state.channelMessageSearch='';render();return;}
  if(action.dataset.action==='more'&&post){const item=posts.find(p=>String(p.id)===String(post.dataset.post));const own=item&&item.authorId===state.userId;const downloadable=Boolean(safeAssetUrl(item?.file?.url||item?.imageURL||item?.audioURL));const saved=item&&state.saved.has(String(item.id));document.body.insertAdjacentHTML('beforeend',`<div class="modal-backdrop post-menu-backdrop" data-action="close-modal" data-post-id="${post.dataset.post}"><div class="post-menu"><button class="secondary" data-action="save-menu">${icon('bookmark')} ${saved?'Remove from Saved Messages':'Save to Saved Messages'}</button><button class="secondary" data-action="share-menu">${icon('share')} Forward</button>${downloadable?`<button class="secondary" data-action="download-post">${icon('download')} Download</button>`:''}${own?`<button class="secondary danger-action" data-action="delete-post">Delete post</button>`:''}<button class="secondary" data-action="close-modal">Cancel</button></div></div>`);return;}
  if(action.dataset.action==='sign-in'){openAuthModal();return;}
  if(action.dataset.action==='chat-options'){const userId=action.dataset.userId;const blocked=state.blockedUsers.has(userId);document.body.insertAdjacentHTML('beforeend',`<div class="modal-backdrop" data-action="close-modal"><div class="post-menu chat-options-menu"><button class="secondary ${blocked?'':'danger-action'}" data-action="toggle-block-user" data-user-id="${escapeHtml(userId)}">${blocked?'Unblock user':'Block user'}</button><button class="secondary" data-action="close-modal">Cancel</button></div></div>`);return;}
  if(action.dataset.action==='toggle-block-user'){const userId=action.dataset.userId;const blocked=state.blockedUsers.has(userId);action.closest('.modal-backdrop')?.remove();setUserBlocked(state.userId,userId,!blocked).then(()=>notify(blocked?'User unblocked':'User blocked')).catch(error=>notify(userFacingError(error,'Unable to update this block.')));return;}
  if(action.dataset.action==='password-reset'){sendPasswordReset(state.userEmail).then(()=>notify('Password reset email sent')).catch(error=>notify(userFacingError(error,'Unable to send reset email.')));return;}
  if(action.dataset.action==='deactivate-account'){if(!confirm('Deactivate your account? You will be signed out.'))return;deactivateUser(state.userId).then(()=>signOutUser()).then(()=>{resetPrivateState();state.isAuthenticated=false;state.userId='';state.userEmail='';state.page='landing';render();notify('Account deactivated');}).catch(error=>notify(userFacingError(error,'Unable to deactivate account.')));return;}
  if(action.dataset.action==='logout'){signOutUser().then(()=>{resetPrivateState();state.isAuthenticated=false;state.isGuest=false;state.userId='';state.userEmail='';state.profileName='';state.profilePhotoURL='';state.page='landing';render();notify('You have been logged out');}).catch(error=>notify(userFacingError(error,'Unable to log out.')));return;}
  if(action.dataset.action==='continue-guest'){document.querySelector('.auth-backdrop')?.remove();state.isGuest=true;state.page='home';state.chatOpen=false;notify('Browsing StudyLoop as a guest');render();return;}
  if(['save','share','create-channel','upload-saved','upload-file','share-saved','channel-post','add-friend','edit-profile','notifications'].includes(action.dataset.action)&&guestNeedsSignIn('Sign in to participate in StudyLoop.')) return;
  if(action.dataset.action==='report-post'&&post){report('post',String(post.dataset.post),'User report',state.userId).then(()=>notify('Post reported')).catch(error=>notify(userFacingError(error,'Unable to submit this report.')));return;}
  if(action.dataset.action==='download-post'){const menu=action.closest('[data-post-id]');const item=posts.find(p=>String(p.id)===String(menu?.dataset.postId));const url=safeAssetUrl(item?.file?.url||item?.imageURL||item?.audioURL);if(url){const link=document.createElement('a');link.href=url;link.download=item?.file?.name||'studyloop-download';link.click();}else notify('No downloadable attachment found.');menu?.remove();return;}
  if(action.dataset.action==='save-menu'){const menu=action.closest('[data-post-id]');const id=String(menu?.dataset.postId||'');const item=posts.find(entry=>String(entry.id)===id);const willSave=!state.saved.has(id);const savedPost=item?{id:String(item.id),course:item.course,author:item.author,authorId:item.authorId||'',text:item.text||'',imageURL:item.imageURL||null,audioURL:item.audioURL||null,file:item.file||null}:null;Promise.all([setSavedPost(state.userId,id,willSave),willSave&&savedPost?saveCloudMessage({conversationId:`saved_${state.userId}`,participants:[state.userId],senderId:state.userId,type:'savedPost',text:'Saved post',postId:id,post:savedPost}):Promise.resolve()]).then(()=>{menu?.remove();notify(willSave?'Saved to Saved Messages':'Bookmark removed');}).catch(error=>notify(userFacingError(error,'Unable to update Saved Messages.')));return;}
  if(action.dataset.action==='share-menu'){const menu=action.closest('[data-post-id]');state.sharePostId=String(menu?.dataset.postId||'');menu?.remove();document.body.insertAdjacentHTML('beforeend',shareModal(state.sharePostId));const modal=document.querySelector('.share-modal');if(modal){modal.dataset.postId=state.sharePostId;modal.querySelector('.share-targets')?.insertAdjacentHTML('beforeend',`<button class="share-target" data-action="share-external">${icon('share')}<span><strong>Share link</strong><small>Use your device share menu</small></span>${icon('chevron')}</button><a class="share-target share-link-anchor" data-action="share-whatsapp" href="https://wa.me/?text=${encodeURIComponent(`Check out this StudyLoop post: ${STUDYLOOP_URL}?post=${state.sharePostId}`)}" target="_blank" rel="noopener noreferrer">${icon('share')}<span><strong>Share to WhatsApp</strong><small>Send the post link</small></span>${icon('chevron')}</a>`);}return;}
  if(action.dataset.action==='delete-post'&&!post){const menu=action.closest('[data-post-id]');const item=posts.find(p=>String(p.id)===String(menu?.dataset.postId));if(item?.authorId===state.userId&&!confirm('Delete this post? This cannot be undone.'))return;if(item?.authorId===state.userId){deletePostAndAttachments(item).then(()=>{const index=posts.indexOf(item);if(index>=0)posts.splice(index,1);menu?.remove();render();notify('Post deleted');}).catch(error=>notify(userFacingError(error,'Unable to delete post.')));}return;}
  if(action.dataset.action==='delete-post'&&post){const item=posts.find(entry=>String(entry.id)===String(post.dataset.post));if(item?.authorId===state.userId&&!confirm('Delete this post? This cannot be undone.'))return;if(item?.authorId===state.userId)deletePostAndAttachments(item).then(()=>{state.page='home';render();notify('Post deleted');}).catch(error=>notify(userFacingError(error,'Unable to delete post.')));return;}
  if(action.dataset.action==='upload-saved'||action.dataset.action==='upload-file'){const input=$('#file-upload');input.accept=UPLOAD_ACCEPT;input.dataset.destination=state.page==='messages'&&state.activeChat!==0?'chat':'saved';input.click();return;}
  if(action.dataset.action==='channel-post'){state.recordedAudio=null;document.body.insertAdjacentHTML('beforeend',postComposerModal());return;}
  if(action.dataset.action==='record-channel-voice'){
    if(guestNeedsSignIn('Sign in to record a voice note.'))return;
    startChannelVoiceRecording().catch(error=>notify(error?.code==='media/unsupported'?'Voice recording is not supported in this browser.':microphoneError(error)));
    return;
  }
  if(action.dataset.action==='pause-channel-voice'){
    if(activeRecorder?.state==='recording'){activeRecorder.pause();state.channelRecordingPaused=true;action.classList.add('is-paused');action.setAttribute('aria-label','Resume recording');}
    else if(activeRecorder?.state==='paused'){activeRecorder.resume();state.channelRecordingPaused=false;action.classList.remove('is-paused');action.setAttribute('aria-label','Pause recording');}
    return;
  }
  if(action.dataset.action==='finish-channel-voice'){
    if(activeRecorder&&['recording','paused'].includes(activeRecorder.state))activeRecorder.stop();
    return;
  }
  if(action.dataset.action==='discard-channel-voice'){
    if(activeRecorder&&['recording','paused'].includes(activeRecorder.state)){discardActiveRecording=true;activeRecorder.stop();}
    else clearChannelVoice();
    return;
  }
  if(action.dataset.action==='play-channel-preview'){
    const audio=$('#channel-voice-preview');if(!audio?.src)return;
    if(audio.paused){audio.play();action.classList.add('is-playing');}else{audio.pause();action.classList.remove('is-playing');}
    audio.onended=()=>action.classList.remove('is-playing');
    return;
  }
  if(action.dataset.action==='toggle-voice-note'){
    const player=action.closest('[data-voice-player]');const audio=player?.querySelector('audio');if(!audio)return;
    $$('[data-voice-player] audio').filter(item=>item!==audio).forEach(item=>{item.pause();const other=item.closest('[data-voice-player]');other?.querySelector('.voice-play')?.classList.remove('is-playing');other?.classList.remove('is-playing');});
    if(audio.paused){audio.play();action.classList.add('is-playing');player.classList.add('is-playing');if(player.dataset.messageId&&player.dataset.mine!=='true'&&!player.dataset.played){player.dataset.played='true';player.classList.add('is-listened');markMessagePlayed(player.dataset.messageId,state.userId).catch(error=>console.warn('Unable to save voice-note playback state.',error));}}else{audio.pause();action.classList.remove('is-playing');player.classList.remove('is-playing');}
    const sync=()=>{const duration=Number.isFinite(audio.duration)?audio.duration:0;const progress=duration?audio.currentTime/duration:0;player.style.setProperty('--voice-progress',`${progress*100}%`);const time=player.querySelector('[data-voice-time]');if(time)time.textContent=formatMediaTime(audio.currentTime||duration);};
    audio.onloadedmetadata=sync;audio.ontimeupdate=sync;audio.onended=()=>{action.classList.remove('is-playing');player.classList.remove('is-playing');player.style.setProperty('--voice-progress','0%');const time=player.querySelector('[data-voice-time]');if(time)time.textContent=formatMediaTime(Number.isFinite(audio.duration)?audio.duration:0);};
    return;
  }
  if(action.dataset.action==='voice-speed'){const player=action.closest('[data-voice-player]');const audio=player?.querySelector('audio');if(!audio)return;const speeds=[1,1.5,2];const next=speeds[(speeds.indexOf(audio.playbackRate)+1)%speeds.length];audio.playbackRate=next;action.textContent=`${next}x`;return;}
  if(action.dataset.action==='record-voice'){
    if(!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder){notify('Voice recording is not supported in this browser.');return;}
    const status=$('#voice-status'); const preview=$('#voice-preview');
    if(activeRecorder?.state==='recording'){activeRecorder.stop();clearInterval(recordingTimer);action.textContent='Record voice note';return;}
    navigator.mediaDevices.getUserMedia({ audio:true }).then(stream=>{
      activeRecordingStream=stream; const chunks=[];activeRecorder=new MediaRecorder(stream,audioRecorderOptions());
      activeRecorder.ondataavailable=event=>{if(event.data.size)chunks.push(event.data);};
      activeRecorder.onstop=()=>{state.recordedAudio=new Blob(chunks,{type:activeRecorder.mimeType||'audio/webm'});stream.getTracks().forEach(track=>track.stop());if(preview){preview.src=URL.createObjectURL(state.recordedAudio);preview.hidden=false;}clearInterval(recordingTimer);const seconds=Math.max(1,Math.round((Date.now()-recordingStartedAt)/1000));state.recordedAudioDuration=seconds;if(status)status.textContent='Voice note ready · '+Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0');action.textContent='Record again';};
      activeRecorder.start(250); recordingStartedAt=Date.now(); if(status)status.textContent='Recording 0:00 · tap to stop'; recordingTimer=setInterval(()=>{const seconds=Math.floor((Date.now()-recordingStartedAt)/1000);if(status)status.textContent='Recording '+Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0')+' · tap to stop';},250); action.textContent='Stop recording';
    }).catch(error=>notify(microphoneError(error)));
    return;
  }
  if(action.dataset.action==='discard-chat-voice'){if(activeRecorder&&['recording','paused'].includes(activeRecorder.state)){discardActiveRecording=true;activeRecorder.stop();}else clearChatVoice();return;}
  if(action.dataset.action==='pause-chat-voice'){if(activeRecorder?.state==='recording'){activeRecorder.pause();state.chatRecordingPaused=true;action.classList.add('is-paused');}else if(activeRecorder?.state==='paused'){activeRecorder.resume();state.chatRecordingPaused=false;action.classList.remove('is-paused');}return;}
  if(action.dataset.action==='finish-chat-voice'){if(activeRecorder&&['recording','paused'].includes(activeRecorder.state))activeRecorder.stop();return;}
  if(action.dataset.action==='play-chat-preview'){const audio=$('#chat-voice-preview');if(!audio?.src)return;if(audio.paused){audio.play();action.classList.add('is-playing');}else{audio.pause();action.classList.remove('is-playing');}audio.onended=()=>action.classList.remove('is-playing');return;}
  if(action.dataset.action==='cancel-message-reply'){state.replyToMessage=null;render();return;}
  if(action.dataset.action==='discard-comment-voice'){if(commentRecorder&&['recording','paused'].includes(commentRecorder.state)){discardCommentRecording=true;commentRecorder.stop();}else{clearCommentVoice();notify('Voice comment discarded');}return;}
  if(action.dataset.action==='finish-comment-voice'){if(commentRecorder&&['recording','paused'].includes(commentRecorder.state))commentRecorder.stop();return;}
  if(action.dataset.action==='record-chat-voice'){
    startChatVoiceRecording().catch(error=>notify(microphoneError(error)));return;
  }
  if(action.dataset.action==='record-comment-voice'){
    startCommentVoiceRecording().catch(error=>notify(microphoneError(error)));return;
  }
  if(action.dataset.action==='share-saved'){state.sharePostId=state.activePost;document.body.insertAdjacentHTML('beforeend',shareModal(state.sharePostId));const modal=document.querySelector('.share-modal');if(modal){modal.dataset.postId=state.sharePostId;modal.querySelector('.share-targets')?.insertAdjacentHTML('beforeend',`<button class="share-target" data-action="share-external">${icon('share')}<span><strong>Share link</strong><small>Use your device share menu</small></span>${icon('chevron')}</button><a class="share-target share-link-anchor" href="https://wa.me/?text=${encodeURIComponent(`Check out this StudyLoop post: ${STUDYLOOP_URL}?post=${state.sharePostId}`)}" target="_blank" rel="noopener noreferrer">${icon('share')}<span><strong>Share to WhatsApp</strong><small>Send the post link</small></span>${icon('chevron')}</a>`);}return;}
  if(action.dataset.action==='edit-profile'){document.body.insertAdjacentHTML('beforeend',profileEditorModal());return;}
  if(action.dataset.action==='mark-notifications-read'){notifications.forEach(n=>state.readNotifications.add(n.id));render();return;}
  if(action.dataset.action==='request-notifications'){if(typeof Notification==='undefined'){notify('Notifications are not supported on this device.');return;}Notification.requestPermission().then(permission=>notify(permission==='granted'?'Notifications enabled':'Notifications remain disabled.')).catch(()=>notify('Unable to request notification permission.'));return;}
  if(action.dataset.action==='reply-comment'){state.replyToCommentId=action.dataset.replyComment;render();return;}
  if(action.dataset.action==='cancel-reply'){state.replyToCommentId=null;render();return;}
  if(action.dataset.action==='save'&&post){const id=String(post.dataset.post);const item=posts.find(entry=>String(entry.id)===id);const willSave=!state.saved.has(id);const update=setSavedPost(state.userId,id,willSave);const savedPost=item?{id:String(item.id),course:item.course,author:item.author,authorId:item.authorId||'',text:item.text||'',imageURL:item.imageURL||null,audioURL:item.audioURL||null,file:item.file||null}:null;const addToChat=willSave&&savedPost?saveCloudMessage({conversationId:`saved_${state.userId}`,participants:[state.userId],senderId:state.userId,type:'savedPost',text:'Saved post',postId:id,post:savedPost}):Promise.resolve();Promise.all([update,addToChat]).then(()=>notify(willSave?'Saved to Saved Messages':'Bookmark removed')).catch(error=>notify(userFacingError(error,'Unable to update Saved Messages.')));}
  else if(action.dataset.action==='share'&&post){state.sharePostId=String(post.dataset.post);document.body.insertAdjacentHTML('beforeend',shareModal(state.sharePostId));const modal=document.querySelector('.share-modal');if(modal){modal.dataset.postId=state.sharePostId;modal.querySelector('.share-targets')?.insertAdjacentHTML('beforeend',`<button class="share-target" data-action="share-external">${icon('share')}<span><strong>Share link</strong><small>Use your device share menu</small></span>${icon('chevron')}</button><a class="share-target share-link-anchor" href="https://wa.me/?text=${encodeURIComponent(`Check out this StudyLoop post: ${STUDYLOOP_URL}?post=${state.sharePostId}`)}" target="_blank" rel="noopener noreferrer">${icon('share')}<span><strong>Share to WhatsApp</strong><small>Send the post link</small></span>${icon('chevron')}</a>`);}}
  else if(action.dataset.action==='download') notify('Download started');
  else if(action.dataset.action==='play'){action.textContent=action.textContent==='❚❚'?'▶':'❚❚';notify(action.textContent==='❚❚'?'Playing voice note':'Voice note paused');}
  else if(action.dataset.action==='comments'&&post){state.activePost=String(post.dataset.post);state.page='post-detail';subscribeActiveComments();render();}
  else if(action.dataset.action==='create-channel') document.body.insertAdjacentHTML('beforeend',createChannelModal());
  else if(action.dataset.action==='close-modal') {
    if(action.classList.contains('image-lightbox')) action.remove();
    else if(action.classList.contains('modal-backdrop')){if(e.target===action)action.remove();}
    else action.closest('.modal-backdrop')?.remove();
  }
  else if(action.dataset.action==='back-chats'){state.chatOpen=false;render();}
  else if(action.dataset.action==='notifications'){state.page='notifications';render();}
  else if(action.dataset.action==='search'){state.page='channels';state.channelMode='discover';render();}
  else if(action.dataset.action==='upload-saved') notify('Choose a file to save it securely.');
  else if(action.dataset.action==='share-saved') notify('Choose a post to forward it here or to a friend.');
  else if(action.dataset.action==='channel-post') notify('Open a channel to publish a post.');
  else if(action.dataset.action==='add-friend'){action.textContent='Request sent';action.disabled=true;notify('Friend request sent');}
  else if(action.dataset.action==='edit-profile') notify('Open your profile to update it.');
});

document.addEventListener('input',e=>{
  if(e.target.id==='channel-search'){state.channelSearch=e.target.value;const caret=e.target.selectionStart;render();const input=$('#channel-search');input.focus();input.setSelectionRange(caret,caret);}
  if(e.target.id==='channel-message-search'){state.channelMessageSearch=e.target.value;const caret=e.target.selectionStart;render();const input=$('#channel-message-search');input?.focus();input?.setSelectionRange(caret,caret);}
  if(e.target.id==='message-input')localStorage.setItem(`studyloop-draft:${state.userId}:${conversationIdFor()}`,e.target.value);
  if(e.target.id==='conversation-search'){state.chatSearch=e.target.value;const caret=e.target.selectionStart;render();const input=$('#conversation-search');input?.focus();input?.setSelectionRange(caret,caret);}
});

document.addEventListener('submit',async e=>{
  if(e.target.id==='auth-form'){e.preventDefault();const data=new FormData(e.target);if(state.authMode==='signup'&&!data.get('terms')){notify('Accept the Terms & Conditions to create your account.');return;}try{const user=state.authMode==='signup'?await signUp(data.get('username'),data.get('email'),data.get('password')):await signIn(data.get('email'),data.get('password'));state.userEmail=user.email;await loadAccountEntitlement(user.uid);state.profileName=state.authMode==='signup'?String(data.get('username')||'').trim():state.profileName;state.isGuest=false;state.isAuthenticated=true;$('.auth-backdrop')?.remove();state.page='home';state.chatOpen=false;notify('Signed in successfully');render();}catch(error){notify(userFacingError(error,'Unable to sign in.'));}}
  if(e.target.id==='chat-form'){e.preventDefault();if(guestNeedsSignIn('Sign in to send messages.'))return;const input=$('#message-input');const value=input?.value.trim()||'';if(!value&&!state.chatAudio)return;const peer=state.activeChat===0?null:people[state.activeChat-1];const participants=peer?[state.userId,peer.id]:[state.userId];const conversationId=conversationIdFor();const replyTo=state.replyToMessage?{id:String(state.replyToMessage.id),sender:String(state.replyToMessage.sender).slice(0,80),text:String(state.replyToMessage.text).slice(0,300)}:null;try{if(state.chatAudio){const extension=baseMimeType(state.chatAudio.type)==='audio/mp4'?'m4a':'webm';const name=`voice-${Date.now()}.${extension}`;const blob=state.chatAudio;const url=await uploadAsset(new File([blob],name,{type:blob.type}),`users/${state.userId}/messages/${name}`);await saveCloudMessage({conversationId,participants,senderId:state.userId,type:'attachment',text:'Voice note',playedBy:[state.userId],file:{name:'Voice note',meta:`${Math.max(1,Math.round(blob.size/1024))} KB`,type:blob.type,url,duration:state.chatAudioDuration},...(replyTo?{replyTo}:{})});if(state.chatAudioURL)URL.revokeObjectURL(state.chatAudioURL);state.chatAudio=null;state.chatAudioURL='';state.chatAudioDuration=0;}if(value)await saveCloudMessage({conversationId,participants,senderId:state.userId,type:'text',text:value,...(replyTo?{replyTo}:{})});localStorage.removeItem(`studyloop-draft:${state.userId}:${conversationId}`);state.replyToMessage=null;if(input)input.value='';render();}catch(error){notify(userFacingError(error,'Unable to send message.'));}}
  if(e.target.id==='channel-form'){
    e.preventDefault();
    if(guestNeedsSignIn('Sign in to create a channel.'))return;
    const data=new FormData(e.target);
    const submit=e.target.querySelector('button.primary');
    submit.disabled=true;
    try{
      const access=e.target.querySelector('[data-visibility].selected')?.dataset.visibility||'Public';
      if(access==='Private'&&state.subscriptionPlan==='Free'){notify('Private channels require Student+ or Power.');submit.disabled=false;return;}
      const channel={name:String(data.get('name')||'').trim(),course:String(data.get('course')||'').trim(),sub:String(data.get('module')||'').trim(),access,desc:String(data.get('description')||'').trim(),icon:String(data.get('name')||'').trim().slice(0,2).toUpperCase(),cls:'',members:1,ownerId:state.userId};
      const id=await createCloudChannel(channel);
      const localChannel={...channel,id};
      if(!channels.some(item=>item.id===id))channels.push(localChannel);
      $('.modal-backdrop')?.remove();
      state.page='channels';
      render();
      try{
        await setMembership(state.userId,id,true);
        notify('Channel created');
      }catch(membershipError){
        console.warn('Channel created; creator membership sync failed.',membershipError);
        notify('Channel created. Membership is still syncing.');
      }
    }catch(error){
      notify(userFacingError(error,'Unable to create this channel.'));
      submit.disabled=false;
    }
  }
  if(e.target.id==='channel-compose-form'){
    e.preventDefault();if(guestNeedsSignIn('Sign in to publish a post.'))return;
    const data=new FormData(e.target);const text=String(data.get('channelText')||'').trim();const assets=data.getAll('channelAssets').filter(file=>file instanceof File&&file.size);
    const kinds=assets.map(uploadKind);
    if(assets.length>3||assets.some((file,index)=>file.size>50*1024*1024||!kinds[index])||new Set(kinds).size!==kinds.length){notify('Use up to one image, one document, and one audio file, each 50 MB or smaller. Videos are not accepted.');return;}
    if(!text&&!assets.length&&!state.recordedAudio){notify('Write a message, attach a file, or record a voice note.');return;}
    const channel=channels[state.activeChannel];if(!channel||!state.joined.has(state.activeChannel)){notify('Join this channel before publishing.');return;}
    const submit=e.submitter||e.target.querySelector('.channel-send-text');submit.disabled=true;e.target.classList.add('is-publishing');
    const uploaded=[];
    try{
      const id=crypto.randomUUID();const image=assets.find(file=>uploadKind(file)==='image');const audio=state.recordedAudio||assets.find(file=>uploadKind(file)==='audio');const documentFile=assets.find(file=>uploadKind(file)==='document');
      let imageURL=null,audioURL=null,fileURL=null;
      if(image){imageURL=await uploadAsset(image,`users/${state.userId}/posts/${id}/${safeStorageName(image)}`);uploaded.push(imageURL);}
      if(audio){audioURL=await uploadAsset(audio,`users/${state.userId}/posts/${id}/voice-note.${baseMimeType(audio.type).includes('ogg')?'ogg':'webm'}`);uploaded.push(audioURL);}
      if(documentFile){fileURL=await uploadAsset(documentFile,`users/${state.userId}/posts/${id}/${safeStorageName(documentFile)}`);uploaded.push(fileURL);}
      const post={id,initials:initials(state.profileName),author:state.profileName,authorId:state.userId,authorPhotoURL:state.profilePhotoURL,ago:'now',course:channel.name,channelId:channel.id,icon:channel.icon,text,comments:0,imageURL,audioURL,audioDuration:state.recordedAudioDuration||0,file:documentFile?{name:documentFile.name,meta:`${Math.max(1,Math.round(documentFile.size/1024))} KB`,type:documentFile.type,url:fileURL}:undefined};
      await saveCloudPost(post,state.userId);clearChannelVoice();scrollChannelToLatest=true;render();notify('Post published');
    }catch(error){await Promise.all(uploaded.filter(Boolean).map(url=>deleteUploadedAsset(url).catch(()=>{})));submit.disabled=false;e.target.classList.remove('is-publishing');notify(userFacingError(error,'Unable to publish your post.'));}
  }
  if(e.target.id==='post-form'){
    e.preventDefault();if(guestNeedsSignIn('Sign in to publish a post.'))return;
    const data=new FormData(e.target);const text=String(data.get('postText')||'').trim();const assets=data.getAll('assets').filter(file=>file instanceof File&&file.size);
    const kinds=assets.map(uploadKind);
    if(assets.length>3||assets.some((file,index)=>file.size>50*1024*1024||!kinds[index])||new Set(kinds).size!==kinds.length){notify('Use up to one image, one document, and one audio file, each 50 MB or smaller. Videos are not accepted.');return;}
    if(!text&&!assets.length&&!state.recordedAudio){notify('Add text, an attachment, or a voice note before publishing.');return;}
    const channel=channels[state.activeChannel];if(!channel||!state.joined.has(state.activeChannel)){notify('Join this channel before publishing.');return;}
    const submit=e.target.querySelector('button.primary');submit.disabled=true;submit.textContent='Publishing…';document.querySelector('.modal-backdrop')?.remove();notify('Publishing post…');
    const uploaded=[];
    try{
      const id=crypto.randomUUID();const image=assets.find(file=>uploadKind(file)==='image');const audio=state.recordedAudio||assets.find(file=>uploadKind(file)==='audio');const documentFile=assets.find(file=>uploadKind(file)==='document');
      let imageURL=null,audioURL=null,fileURL=null;
      if(image){imageURL=await uploadAsset(image,`users/${state.userId}/posts/${id}/${safeStorageName(image)}`);uploaded.push(imageURL);}
      if(audio){audioURL=await uploadAsset(audio,`users/${state.userId}/posts/${id}/voice-note.${audio.type.includes('ogg')?'ogg':'webm'}`);uploaded.push(audioURL);}
      if(documentFile){fileURL=await uploadAsset(documentFile,`users/${state.userId}/posts/${id}/${safeStorageName(documentFile)}`);uploaded.push(fileURL);}
      const post={id,initials:initials(state.profileName),author:state.profileName,authorId:state.userId,authorPhotoURL:state.profilePhotoURL,ago:'now',course:channel.name,channelId:channel.id,icon:channel.icon,text,comments:0,imageURL,audioURL,audioDuration:state.recordedAudioDuration||0,file:documentFile?{name:documentFile.name,meta:`${Math.max(1,Math.round(documentFile.size/1024))} KB`,type:documentFile.type,url:fileURL}:undefined};
      await saveCloudPost(post,state.userId);state.recordedAudio=null;state.page='channel-detail';state.channelTab='posts';render();notify('Post published');
    }catch(error){await Promise.all(uploaded.filter(Boolean).map(url=>deleteUploadedAsset(url).catch(()=>{})));notify(userFacingError(error,'Unable to publish your post.'));}
  }
  if(e.target.id==='comment-form'){e.preventDefault();if(guestNeedsSignIn('Sign in to comment on this discussion.'))return;if(state.commentRecording){notify('Stop the recording before sending it.');return;}const data=new FormData(e.target);const text=String(data.get('comment')||'').trim();const image=data.get('commentImage');if(!text&&!(image instanceof File&&image.size)&&!state.commentAudio){notify('Add text, a picture, or a voice note.');return;}const submit=e.submitter||e.target.querySelector('.send-btn');if(submit)submit.disabled=true;const uploaded=[];try{const postId=String(state.activePost);const commentId=crypto.randomUUID();const parentId=state.replyToCommentId||null;let imageURL=null,audioURL=null;if(image instanceof File&&image.size){imageURL=await uploadAsset(image,`users/${state.userId}/comments/${postId}/${commentId}-${safeStorageName(image)}`);uploaded.push(imageURL);}if(state.commentAudio){const extension=audioExtension(state.commentAudio.type);audioURL=await uploadAsset(new File([state.commentAudio],`${commentId}.${extension}`,{type:state.commentAudio.type}),`users/${state.userId}/comments/${postId}/${commentId}.${extension}`);uploaded.push(audioURL);}const audioDuration=state.commentAudio?state.commentAudioDuration:0;const commentRef=await saveCloudComment(postId,{authorId:state.userId,author:state.profileName,authorPhotoURL:state.profilePhotoURL||'',text,imageURL,audioURL,audioDuration,parentId});const current=discussionComments[postId]||[];if(!current.some(comment=>comment.id===commentRef.id)){discussionComments[postId]=[...current,normalizeDiscussionComment({id:commentRef.id,authorId:state.userId,author:state.profileName,authorPhotoURL:state.profilePhotoURL||'',text,imageURL,audioURL,audioDuration,parentId,createdAt:new Date()})];}syncPostCommentCount(postId,discussionComments[postId].length);clearCommentVoice();state.replyToCommentId=null;e.target.reset();render();notify('Comment posted');}catch(error){await Promise.all(uploaded.map(url=>deleteUploadedAsset(url).catch(()=>{})));notify(userFacingError(error,'Unable to post this comment.'));if(submit)submit.disabled=false;}}
  if(e.target.id==='profile-form'){e.preventDefault();const data=new FormData(e.target);const save=e.target.querySelector('button.primary');const photo=data.get('profilePhoto');if(photo instanceof File&&photo.size&&(photo.size>10*1024*1024||!['image/jpeg','image/png','image/webp'].includes(photo.type))){notify('Choose a JPEG, PNG, or WebP image up to 10 MB.');return;}save.disabled=true;save.textContent='Saving…';try{const profile={username:data.get('displayName').trim(),bio:data.get('bio').trim(),course:data.get('course').trim(),yearLevel:data.get('yearLevel').trim(),photoURL:state.profilePhotoURL};if(photo instanceof File&&photo.size)profile.photoURL=await uploadAsset(photo,`users/${state.userId}/profile/${safeStorageName(photo)}`);await updateUserProfile(state.userId,profile);applyProfile(profile);$('.modal-backdrop')?.remove();render();notify('Profile updated');}catch(error){notify(userFacingError(error,'Unable to save your profile.'));save.disabled=false;save.textContent='Save changes';}}
});

document.addEventListener('input',e=>{if(e.target.id==='people-search'){state.peopleSearch=e.target.value;render();}});
document.addEventListener('change',async e=>{
  if(e.target.matches('[data-apk-never]')){if(e.target.checked)persistApkDismissal();return;}
  if(e.target.name==='channelAssets'){
    const files=[...(e.target.files||[])];const kinds=files.map(uploadKind);
    if(files.length>3||files.some((file,index)=>file.size>50*1024*1024||!kinds[index])||new Set(kinds).size!==kinds.length){notify('Use up to one image, one document, and one audio file, each 50 MB or smaller. Videos are not accepted.');e.target.value='';return;}
    const composer=e.target.closest('.channel-compose');composer?.classList.toggle('has-attachments',files.length>0);e.target.closest('label')?.classList.toggle('has-files',files.length>0);
    const preview=composer?.querySelector('.channel-attachment-preview');if(preview)preview.innerHTML=files.map(file=>`<span>${icon(uploadKind(file)==='image'?'image':uploadKind(file)==='audio'?'mic':'paperclip')}<b>${escapeHtml(file.name)}</b><small>${Math.max(1,Math.round(file.size/1024))} KB</small></span>`).join('');
    if(files.length)notify(`${files.length} attachment${files.length===1?'':'s'} ready to send`);
    return;
  }
  if(e.target.id!=='file-upload')return;
  e.stopImmediatePropagation();
  const file=e.target.files?.[0]; if(!file)return;
  const allowed=ALLOWED_UPLOAD_TYPES.has(baseMimeType(file.type));
  if(!allowed){notify('Choose an image, voice note, PDF, Office document, or text file. Videos, HTML, and executable files are not allowed.');e.target.value='';return;}
  if(file.size>50*1024*1024){notify('Files must be 50 MB or smaller.');e.target.value='';return;}
  const size=file.size<1024*1024?`${Math.max(1,Math.round(file.size/1024))} KB`:`${(file.size/(1024*1024)).toFixed(1)} MB`;
  try {
    const destination=e.target.dataset.destination||'saved';
    const peer=destination==='chat'?people[state.activeChat-1]:null;
    const participants=peer?[state.userId,peer.id]:[state.userId];
    const storedName=`${Date.now()}-${safeStorageName(file)}`;
    const folder=peer?'messages':'saved';
    const url=await uploadAsset(file,`users/${state.userId}/${folder}/${storedName}`);
    await saveCloudMessage({conversationId:peer?[state.userId,peer.id].sort().join('_'):`saved_${state.userId}`,participants,senderId:state.userId,type:'attachment',text:peer?'Shared a file':'Saved a file',file:{name:file.name,meta:size,type:file.type,url},...(file.type?.startsWith('audio/')?{playedBy:[state.userId]}:{})});
    notify(peer?'File sent':'File saved to Saved Messages');
  } catch(error) { notify(userFacingError(error,'Unable to save this file.')); }
  finally { e.target.value='';delete e.target.dataset.destination; }
},true);

document.addEventListener('change',e=>{
  if(e.target.matches('#auth-form input[name="terms"]')){
    const submit=e.target.form.querySelector('.auth-submit');
    submit.disabled=!e.target.checked;
    submit.setAttribute('aria-disabled',String(!e.target.checked));
  }
});

document.addEventListener('click',e=>{
  const radio=e.target.closest('[data-visibility]');if(radio){$$('.radio-card').forEach(x=>x.classList.remove('selected'));radio.classList.add('selected');}
});

let stopCloudPosts, stopCloudChannels, stopCloudUsers, stopCloudMemberships, stopCloudSaved, stopActiveMessages, stopUserMessages, stopActiveComments, stopFriendRequests, stopBlocks;
let currentAuthUid='';
function disconnectUserSubscriptions() {
  for(const stop of [stopCloudUsers,stopCloudMemberships,stopCloudSaved,stopActiveMessages,stopUserMessages,stopActiveComments,stopFriendRequests,stopBlocks])stop?.();
  stopCloudUsers=stopCloudMemberships=stopCloudSaved=stopActiveMessages=stopUserMessages=stopActiveComments=stopFriendRequests=stopBlocks=undefined;
}

window.addEventListener('popstate',event=>{
  const page=event.state?.studyloopPage;
  if(!page)return;
  if(state.page==='post-detail'&&page!=='post-detail')abandonCommentVoice();
  handlingPopState=true;lastHistoryPage=page;state.page=page;state.chatOpen=false;render();handlingPopState=false;
});
function resetPrivateState() {
  abandonCommentVoice();
  disconnectUserSubscriptions();
  currentAuthUid='';inboxMessages=[];state.relations=[];state.blockedUsers=new Set();state.memberChannelIds=new Set();state.joined=new Set();state.saved=new Set();state.unreadMessageIds=new Set();state.chatOpen=false;state.activeChat=0;state.subscriptionPlan='Free';chats.splice(0);people.splice(0);notifications.splice(0);
}
function syncJoinedChannels() { state.joined=new Set(channels.map((channel,index)=>(state.memberChannelIds.has(channel.id)||channel.ownerId===state.userId)?index:-1).filter(index=>index>=0)); }
async function subscribeActiveMessages() {
  stopActiveMessages?.();
  const conversationId=conversationIdFor();
  if(!conversationId)return;
  try {
    stopActiveMessages=await observeMessages(conversationId,messages=>{
      const chat=chats[state.activeChat];if(!chat)return;
      const timeOf=message=>message.createdAt?.toDate?message.createdAt.toDate().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}):'Sending';
      const seenByOther=message=>message.participants?.length===1||(message.seenBy||[]).some(uid=>uid!==message.senderId);
      const firstUnread=messages.findIndex(message=>message.senderId!==state.userId&&!(message.seenBy||[]).includes(state.userId));
      const mapped=[];
      messages.forEach((message,index)=>{
        if(index===firstUnread)mapped.push({type:'unread-divider'});
        const side=message.senderId===state.userId?'mine':'theirs';const seen=seenByOther(message);
        if(message.type==='postLink')mapped.push({id:message.id,type:'post-link',side,time:timeOf(message),postId:message.postId,seen});
        else if(message.type==='savedPost'||message.type==='forwardedPost')mapped.push({id:message.id,type:'forwarded-post',side,time:timeOf(message),post:message.post,seen});
        else if(message.type==='attachment')mapped.push({id:message.id,type:'attachment',side,time:timeOf(message),senderId:message.senderId,file:message.file,seen,listened:(message.playedBy||[]).some(uid=>uid!==message.senderId),replyTo:message.replyTo});
        else mapped.push({id:message.id,type:'text',side,time:timeOf(message),text:message.text||'',seen,replyTo:message.replyTo,edited:Boolean(message.editedAt)});
      });
      if(state.activeChat===0){const represented=new Set(messages.map(message=>String(message.postId||message.post?.id||'')));for(const postId of state.saved){if(represented.has(String(postId)))continue;const post=posts.find(item=>String(item.id)===String(postId));if(post)mapped.push({id:`bookmark-${postId}`,type:'forwarded-post',side:'mine',time:'Saved',post,seen:true});}}
      chat.messages=mapped;chat.preview=messages.at(-1)?.text||'Saved item';
      if(state.activeChat!==0)markMessagesSeen(messages,state.userId).catch(error=>console.warn('Unable to mark messages seen.',error));
      render();
    },error=>console.warn('Unable to load messages',error));
  } catch(error) { console.warn('Unable to subscribe to messages',error); }
}

function showApkPrompt() {
  if(state.apkPromptDismissed||localStorage.getItem('studyloop_apk_prompt_dismissed')==='1'||document.querySelector('[data-apk-prompt]'))return;
  document.body.insertAdjacentHTML('beforeend',`<div class="modal-backdrop apk-prompt-backdrop" data-action="close-modal" data-apk-prompt><div class="modal apk-prompt"><div class="apk-prompt-icon"><img src="/studyloop-logo.png" alt="StudyLoop" /></div><div class="modal-head"><div><h2>Install StudyLoop</h2><p class="muted">Get the StudyLoop Android app for a faster experience.</p></div><button class="icon-btn" data-action="close-modal" aria-label="Close">${icon('x')}</button></div><label class="apk-never"><input type="checkbox" data-apk-never /> Don’t show this again</label><div class="modal-actions"><button class="secondary" data-action="dismiss-apk">Not now</button><a class="primary apk-download" data-action="download-apk" href="https://www.mediafire.com/file/cm39bwlcxgs2vd6/StudyLoop.apk/file" target="_blank" rel="noopener">Download APK ${icon('download')}</a></div></div></div>`);
}
async function subscribeActiveComments(){stopActiveComments?.();try{stopActiveComments=await observeCloudComments(String(state.activePost),comments=>{const postId=String(state.activePost);discussionComments[postId]=comments.map(normalizeDiscussionComment);syncPostCommentCount(postId,comments.length);if(state.page==='post-detail')render();},error=>console.warn('Unable to load comments',error));}catch(error){console.warn('Unable to subscribe to comments',error);}}
async function connectFirebase() {
  try {
    stopCloudPosts=await observePosts(cloudPosts => { posts.splice(0,posts.length,...cloudPosts.map(post => ({ ...post, id:String(post.id), ago:post.ago||'just now', comments:post.comments||0 }))); render(); }, error => console.warn('Unable to load posts', error));
    stopCloudChannels=await observeChannels(cloudChannels => { const normalized=cloudChannels.map(channel=>({ icon:channel.icon||'SL', cls:channel.cls||'', access:channel.access||'Public', members:channel.members||0, desc:channel.desc||'', sub:channel.sub||'', ...channel }));channels.splice(0,channels.length,...normalized);syncJoinedChannels(); render(); }, error => { console.warn('Unable to load channels', error);notify('Unable to load channels. Check your connection and Firebase configuration.'); });
    await observeAuth(async user => {
      if (!user) {
        resetPrivateState();
        if (!state.isGuest) { state.isAuthenticated=false; state.userId=''; state.userEmail='';state.profileName='';state.profilePhotoURL=''; }
        render();setTimeout(showApkPrompt,500);
        return;
      }
      if(currentAuthUid&&currentAuthUid!==user.uid)resetPrivateState();
      currentAuthUid=user.uid;state.isAuthenticated=true; state.isGuest=false; state.userId=user.uid; state.userEmail=user.email||'';
      try { const profile=await waitForUserProfile(user.uid);if(!profile){notify('Your account profile could not be loaded. Please sign in again.');await signOutUser();return;}if(profile.deactivated){await signOutUser();notify('This account has been deactivated.');return;}applyProfile(profile);if(!state.apkPromptDismissed&&localStorage.getItem('studyloop_apk_prompt_dismissed')==='1'){state.apkPromptDismissed=true;setInstallPromptDismissed(user.uid,true).catch(error=>console.warn('Unable to migrate install prompt preference.',error));} } catch (error) { console.warn('Unable to load profile', error);await signOutUser();return; }
      await loadAccountEntitlement(user.uid);
      if (!stopCloudUsers) stopCloudUsers=await observeUsers(users => { people.splice(0,people.length,...users.filter(profile=>profile.id!==state.userId).map(profile=>({ id:profile.id, initials:initials(profile.username||'Student'), name:profile.username||'Student', info:[profile.course,profile.yearLevel].filter(Boolean).join(' · '), status:profile.bio||'', photoURL:profile.photoURL||'' }))); friendRequests.splice(0);discoverPeople.splice(0,discoverPeople.length,...people);notifications.splice(0);syncChats(); render(); }, error=>console.warn('Unable to load users',error));
      if (!stopUserMessages) stopUserMessages=await observeUserMessages(user.uid,messages=>{inboxMessages=messages;applyInboxMessages();render();},error=>console.warn('Unable to load message notifications',error));
      if (!stopCloudMemberships) stopCloudMemberships=await observeMemberships(user.uid, ids=>{state.memberChannelIds=new Set(ids);syncJoinedChannels();render();}, error=>console.warn('Unable to load memberships',error));
      if (!stopCloudSaved) stopCloudSaved=await observeSaved(user.uid, ids=>{state.saved=new Set(ids);render();}, error=>console.warn('Unable to load saved posts',error));
      if (!stopFriendRequests) stopFriendRequests=await observeFriendRequests(user.uid,relations=>{state.relations=relations;render();},error=>console.warn('Unable to load friend requests',error));
      if (!stopBlocks) stopBlocks=await observeBlocks(user.uid,ids=>{state.blockedUsers=new Set(ids);render();},error=>console.warn('Unable to load blocks',error));
      if (state.page==='landing') state.page='home';
      render();setTimeout(showApkPrompt,500);
    });
  } catch (error) { console.warn('Firebase is unavailable', error); }
}

render();
connectFirebase();
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}

if ('serviceWorker' in navigator && ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)) {
  navigator.serviceWorker.getRegistrations().then(registrations => registrations.forEach(registration => registration.unregister())).catch(() => {});
  if ('caches' in window) caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('studyloop-')).map(key => caches.delete(key)))).catch(() => {});
}
