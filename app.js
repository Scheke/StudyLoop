import { signUp, signIn, signOutUser, sendPasswordReset, deactivateUser, report, saveCloudPost, deleteCloudPost, uploadAsset, observeAuth, observePosts, getUserProfile, updateUserProfile, observeChannels, createCloudChannel, observeUsers, observeMemberships, setMembership, observeSaved, setSavedPost, saveCloudMessage, observeMessages } from './firebase.js';
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const icon = (name, cls = '') => `<svg class="icon ${cls}"><use href="#i-${name}"></use></svg>`;
const logo = () => `<img class="brand-logo" src="/studyloop-logo.png" alt="StudyLoop logo" />`;
const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[character]));
const safeAssetUrl = value => /^https:\/\/firebasestorage\.googleapis\.com\//i.test(String(value||'')) ? escapeHtml(value) : '';
const safeStorageName = file => `${crypto.randomUUID()}${(String(file?.name||'').match(/\.[a-z0-9]{1,8}$/i)||[''])[0].toLowerCase()}`;
let activeRecorder;
let activeRecordingStream;
let recordingTimer;
let recordingStartedAt=0;

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
  subscriptionPlan: 'Free',
  storageAddons: 0,
  storageUsedMB: 0,
  downloadsUsedMB: 0,
  feedFilter: 'All',
  channelMode: 'joined',
  channelSearch: '',
  activeChat: 0,
  activeChannel: 0,
  channelTab: 'posts',
  friendTab: 'friends',
  activePost: 0,
  activeSetting: 'Personal information',
  sentRequests: new Set(),
  acceptedRequests: new Set(),
  messageRequests: [],
  blockedUsers: new Set(),
  readNotifications: new Set(),
  profileUser: null,
  saved: new Set(),
  joined: new Set(),
  memberChannelIds: new Set(),
  recordedAudio: null,
};

const channels = [
  { icon:'</>', cls:'', name:'CS301 Algorithms', sub:'Algorithms & Data Structures', access:'Public', members:248, desc:'Discuss lectures, assignments, and algorithmic problem solving together.' },
  { icon:'DB', cls:'green', name:'Database Systems', sub:'Relational Databases', access:'Private', members:96, desc:'Share notes, discuss queries, and prepare for exams together.' },
  { icon:'π', cls:'purple', name:'Discrete Mathematics', sub:'Mathematical Foundations', access:'Public', members:180, desc:'Proofs, logic, sets, and more. Ask questions and grow together.' },
  { icon:'>_', cls:'orange', name:'Operating Systems', sub:'Systems Programming', access:'Public', members:132, desc:'Discuss concepts, labs, and real-world OS challenges.' },
  { icon:'NW', cls:'orange', name:'Computer Networks', sub:'Protocols, routing & networking', access:'Public', members:154, desc:'Build a stronger understanding of modern networks.' },
];

const posts = [
  { id:0, initials:'AS', author:'Arjun Sharma', ago:'2h', course:'CS301 Algorithms', icon:'</>', text:'In Dijkstra’s algorithm, why do we mark a vertex as “visited” when it’s popped from the priority queue? Could we mark it when we push it instead?', comments:12 },
  { id:1, initials:'MI', avatar:'green', author:'Meera Iyer', ago:'4h', course:'Database Systems', icon:'DB', text:'Here’s a quick cheatsheet for SQL joins and constraints. Hope this helps!', comments:8, file:{name:'Database-Cheatsheet.pdf',meta:'842 KB • 2 pages'} },
  { id:2, initials:'RV', avatar:'purple', author:'Rahul Verma', ago:'6h', course:'Discrete Mathematics', icon:'π', text:'Quick explanation of Proof by Contradiction with examples.', comments:15, audio:true },
  { id:3, initials:'AR', avatar:'green', author:'Ananya Rao', ago:'9h', course:'CS301 Algorithms', icon:'</>', text:'Sharing my handwritten notes on Dynamic Programming — knapsack problems.', comments:9, note:true },
];

const people = [
  {initials:'AM',name:'Alex Mensah',info:'Computer Science • 3rd Year',status:'Online'},
  {initials:'MI',name:'Meera Iyer',info:'DBMS • 2nd Year',status:'Dijkstra University'},
  {initials:'RV',name:'Rahul Verma',info:'Discrete Math • 2nd Year',status:'Dijkstra University'},
  {initials:'AR',name:'Ananya Rao',info:'Algorithms • 3rd Year',status:'Dijkstra University'},
];

const friendRequests = [
  { initials:'KG', name:'Karan Gupta', info:'Computer Science · 2nd Year', status:'Dijkstra University' },
  { initials:'NS', name:'Neha Singh', info:'Mathematics · 2nd Year', status:'Dijkstra University' },
];

const discoverPeople = [
  { initials:'VP', name:'Vikram Patel', info:'Computer Science · 1st Year', status:'Dijkstra University' },
  { initials:'IN', name:'Ishita Nair', info:'DBMS · 2nd Year', status:'Dijkstra University' },
  { initials:'AM', name:'Aditya Mehta', info:'Discrete Math · 1st Year', status:'Dijkstra University' },
];

const discussionComments = {
  0: [
    { initials:'MI', name:'Meera Iyer', ago:'2h ago', text:'We mark a vertex when it is popped because that is when its shortest distance is guaranteed.' },
    { initials:'RV', name:'Rahul Verma', ago:'1h ago', text:'Exactly. If we mark it on push, we might miss a shorter path found later.' },
  ],
  1: [{ initials:'AS', name:'Arjun Sharma', ago:'1h ago', text:'This is a great summary — thank you for sharing it.' }],
};

const notifications = [
  { id:0, title:'New reply on your question', body:'Meera replied in CS301 Algorithms.', time:'2m ago', icon:'chat' },
  { id:1, title:'New channel suggestion', body:'Computer Networks may be useful for you.', time:'1h ago', icon:'grid' },
  { id:2, title:'Friend request accepted', body:'Alex Mensah is now your friend.', time:'3h ago', icon:'users' },
];

const chats = [
  { person:{initials:'SM',name:'Saved Messages',info:'Personal cloud storage',status:'Private'}, time:'Now', preview:'Your saved items stay here.', messages:[
    ['theirs','This is your personal Saved Messages channel. Send text, upload files, or share posts here to keep them handy.','Now'],
  ], saved:true},
  { person:people[0], time:'9:22', preview:'Just joined and bookmarked. You’re the best!', messages:[
    ['mine','Hey Alex! Do you have the database normalization notes we discussed in class?','9:15'],
    ['theirs','Hey! Yeah, I’ve uploaded the full notes. They cover 1NF to BCNF with examples.','9:16'],
    ['mine','Thanks! This will help a lot 🙌','9:17'],
    ['theirs','Also, check out the short summary I recorded on functional dependencies.','9:18'],
    ['mine','Awesome! Just listened, super clear 🔥','9:20'],
  ]},
  { person:people[1], time:'8:44', preview:'I added the PDF to our channel.', messages:[['theirs','I added the PDF to our channel.','8:44']] },
  { person:people[2], time:'Tue', preview:'Ready for tomorrow’s study session?', messages:[['mine','Ready for tomorrow’s study session?','Tue']] },
  { person:people[3], time:'Mon', preview:'Those notes were really helpful!', messages:[['theirs','Those notes were really helpful!','Mon']] },
];

// The UI starts empty and is populated exclusively by Firestore subscriptions.
channels.splice(0);
posts.splice(0);
people.splice(0);
friendRequests.splice(0);
discoverPeople.splice(0);
notifications.splice(0);
chats.splice(0);

function initials(name='StudyLoop') { return name.split(/\s+/).filter(Boolean).slice(0,2).map(part=>part[0]).join('').toUpperCase(); }
function avatar(person, cls='') { return `<div class="avatar ${escapeHtml(cls)}">${person.photoURL?`<img src="${safeAssetUrl(person.photoURL)}" alt="" />`:escapeHtml(person.initials||initials(person.name))}</div>`; }
function currentUserAvatar() { return avatar({ initials:initials(state.profileName), name:state.profileName, photoURL:state.profilePhotoURL }); }
function applyProfile(profile={}) { profile=profile||{}; state.profileName=profile.username||state.profileName; state.profileBio=profile.bio||''; state.profileCourse=profile.course||''; state.profileYear=profile.yearLevel||''; state.profilePhotoURL=profile.photoURL||''; }
function syncChats() { const saved={ person:{initials:'SM',name:'Saved Messages',info:'Personal cloud storage',status:'Private'},time:'',preview:'',messages:[],saved:true }; chats.splice(0,chats.length,saved,...people.map(person=>({person,time:'',preview:'',messages:[]}))); }
function conversationIdFor(index=state.activeChat) { if(index===0)return `saved_${state.userId}`; const peer=people[index-1]; return [state.userId,peer?.id].filter(Boolean).sort().join('_'); }
function notify(message) { const t=$('#toast'); t.textContent=message; t.classList.add('show'); clearTimeout(notify.timer); notify.timer=setTimeout(()=>t.classList.remove('show'),2200); }
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
    'auth/too-many-requests':'Too many attempts. Try again later.'
  };
  return messages[code]||fallback;
}
// Temporary QA entitlement; production billing must be enforced by trusted backend claims.
function applyTestEntitlement(email) { state.subscriptionPlan=String(email||'').toLowerCase()==='boipusorante@gmail.com'?'Student+':'Free'; }

function navButton(page,label,ico,badge='') {
  return `<button class="nav-btn ${state.page===page?'active':''}" data-nav="${page}">${icon(ico)}<span>${label}</span>${badge?`<b class="nav-badge">${badge}</b>`:''}</button>`;
}

function shell(content,title,actions=true) {
  return `<div class="app-shell">
    <aside class="sidebar">
      <div class="brand"><span class="brand-mark">${logo()}</span><span>StudyLoop</span></div>
      <nav class="nav">
        ${navButton('home','Home','home')}${navButton('channels','Channels','grid')}${navButton('messages','Messages','chat')}${navButton('friends','Friends','users')}${navButton('saved','Saved','bookmark')}${navButton('pricing','Plans','bookmark')}${navButton('profile','Profile','user')}
      </nav>
      <div class="side-profile" data-nav="profile">${state.isGuest?avatar({initials:'G'}):currentUserAvatar()}<div><strong>${escapeHtml(state.isGuest?'Guest browsing':state.profileName)}</strong><div class="muted small">${escapeHtml(state.isGuest?'Sign in to participate':(state.profileCourse||'Add your course'))}</div></div></div>
    </aside>
    <main class="main">
      <header class="topbar"><h1>StudyLoop</h1><div class="top-actions"><button class="pricing-header" data-nav="pricing">Plans</button>${state.isGuest?`<button class="guest-chip" data-action="sign-in">Guest · Sign in</button>`:''}${actions?`<button class="icon-btn" data-action="search" aria-label="Search">${icon('search')}</button>${notifications.length?`<button class="icon-btn" data-action="notifications" aria-label="Notifications">${icon('bell')}<span class="notify-dot">${notifications.length}</span></button>`:''}`:''}</div></header>
      <div class="content">${content}</div>
    </main>
    <nav class="mobile-nav">${navButton('home','Home','home')}${navButton('channels','Channels','grid')}${navButton('messages','Messages','chat')}${navButton('friends','Friends','users')}${navButton('profile','Profile','user')}</nav>
  </div>`;
}

function landingPage() {
  return `<div class="landing-page">
    <header class="landing-nav"><div class="landing-brand"><span class="brand-mark">${logo()}</span><span>StudyLoop</span></div><button class="landing-login" data-action="sign-in">Sign in</button></header>
    <main class="landing-main">
      <section class="landing-copy"><div class="landing-kicker"><span></span> Built for university life</div><p>One calm place for course channels, shared notes, private messages, and the people you study with.</p><div class="powered-line"><span>Powered by</span><strong>Scheke Innnovationhub</strong><a href="https://scheke.com" target="_blank" rel="noopener noreferrer">Visit us</a></div><div class="landing-actions"><button class="landing-primary" data-action="sign-in">Sign in with email ${icon('arrow')}</button><button class="landing-secondary" data-action="continue-guest">Continue as guest</button></div></section>
      <section class="landing-visual" aria-label="StudyLoop app preview"><div class="orbit orbit-one"></div><div class="orbit orbit-two"></div><div class="floating-pill pill-one">${icon('bookmark')} Saved</div><div class="floating-pill pill-two">${icon('users')} 248 students</div><div class="phone-preview"><div class="phone-speaker"></div><div class="phone-top"><div><small>9:41</small><strong>StudyLoop</strong></div>${icon('search')}</div><div class="preview-chips"><span class="active">All</span><span>Algorithms</span><span>Databases</span></div><article class="preview-post"><div class="preview-post-head"><div class="avatar">AS</div><div><strong>Arjun Sharma</strong><small>2h ago</small></div></div><div class="preview-channel"><span>&lt;/&gt;</span> From <b>#CS301 Algorithms</b></div><p>Could someone explain why we mark a vertex as visited when it is popped?</p><div class="preview-actions"><span>${icon('chat')} 12</span><span>${icon('bookmark')}</span><span>${icon('share')}</span></div></article><article class="preview-message"><div class="avatar green">SM</div><div><strong>Saved Messages</strong><p>Database-Cheatsheet.pdf</p></div><span>✓✓</span></article><div class="phone-tabs">${icon('home')}${icon('grid')}${icon('chat')}${icon('users')}${icon('user')}</div></div>
      </section>
    </main>
    <footer class="landing-footer"><span>StudyLoop</span><span>Channels · Messages · Friends · Saved</span></footer>
  </div>`;
}

function authModalLegacy(message='Sign in to make StudyLoop yours') {
  return `<div class="modal-backdrop auth-backdrop" data-action="close-modal"><form class="modal auth-modal" id="auth-form"><div class="auth-book"><span class="brand-mark">${logo()}</span></div><div class="modal-head"><div><h2>Welcome to StudyLoop</h2><p>${message}</p></div><button type="button" class="icon-btn" data-action="close-modal">${icon('x')}</button></div><div class="form-grid"><div class="field"><label>Email address</label><input type="email" name="email" required autocomplete="email" placeholder="you@university.edu" /></div><button class="primary auth-submit">Continue with email ${icon('chevron')}</button></div><div class="auth-divider"><span>or</span></div><button type="button" class="secondary auth-guest" data-action="continue-guest">Continue as guest</button><small class="auth-note">Guests can browse channels and read posts. Sign in to join, save, share, post, message, or manage your profile.</small></form></div>`;
}

function authModal(message='Sign in to make StudyLoop yours') {
  const signingUp=state.authMode==='signup';
  return `<div class="modal-backdrop auth-backdrop" data-action="close-modal"><form class="modal auth-modal" id="auth-form" autocomplete="on"><div class="auth-book"><span class="brand-mark">${logo()}</span></div><div class="modal-head"><div><h2>Welcome to StudyLoop</h2><p>${message}</p></div><button type="button" class="icon-btn" data-action="close-modal">${icon('x')}</button></div><div class="segment auth-tabs"><button class="${state.authMode==='signin'?'active':''}" data-auth-mode="signin" type="button">Sign in</button><button class="${state.authMode==='signin'?'':'active'}" data-auth-mode="signup" type="button">Create account</button></div><div class="form-grid">${signingUp?`<div class="field"><label>Username</label><input name="username" required autocomplete="username" placeholder="Choose a username" /></div>`:''}<div class="field"><label>Email</label><input type="email" name="email" required autocomplete="${signingUp?'email':'username'}" placeholder="you@example.com" /></div><div class="field"><label>Password</label><input type="password" name="password" required minlength="6" autocomplete="${signingUp?'new-password':'current-password'}" placeholder="${signingUp?'At least 6 characters':'Enter your password'}" /></div>${signingUp?`<label class="terms-check"><input type="checkbox" name="terms" required /> I accept the <button type="button" class="inline-link" data-nav="terms">Terms & Conditions</button> and <button type="button" class="inline-link" data-nav="privacy">Privacy Policy</button>.</label>`:''}<button class="primary auth-submit" ${signingUp?'disabled aria-disabled="true"':''}>${signingUp?'Create account':'Sign in'}</button></div><div class="auth-divider"><span>or</span></div><button type="button" class="secondary auth-guest" data-action="continue-guest">Continue as guest</button></form></div>`;
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
  const imageUrl=safeAssetUrl(post.imageURL); const audioUrl=safeAssetUrl(post.audioURL); const fileUrl=safeAssetUrl(post.file?.url);
  return `<article class="card feed-card" data-post="${escapeHtml(post.id)}">
    <div class="post-head">${avatar({ ...post, photoURL:post.authorPhotoURL||post.photoURL },post.avatar||'')}<div class="post-who"><strong>${escapeHtml(post.author)}</strong><div class="post-meta">${escapeHtml(relativeTime(post.createdAt||post.ago))}</div></div><button class="course-label" data-open-channel="${channelIndex}" aria-label="Open ${escapeHtml(post.course)}"><span class="dot-icon">${escapeHtml(post.icon)}</span><span>From <b>#${escapeHtml(post.course)}</b></span>${icon('chevron')}</button><button class="action" data-action="more" aria-label="More">${icon('more')}</button></div>
    ${post.text?`<p class="post-text">${escapeHtml(post.text)}</p>`:''}
    ${imageUrl?`<img class="post-image" src="${imageUrl}" alt="Post attachment" />`:''}
    ${post.file?`<div class="file-card"><div class="file-icon">PDF</div><div class="file-info"><strong>${escapeHtml(post.file.name)}</strong><span>${escapeHtml(post.file.meta)}</span></div>${fileUrl?`<a class="download" href="${fileUrl}" target="_blank" rel="noopener" aria-label="Download">${icon('download')}</a>`:`<button class="download" data-action="download" aria-label="Download">${icon('download')}</button>`}</div>`:''}
    ${post.audioURL?`<audio class="post-audio" controls src="${post.audioURL}"></audio>`:post.audio?`<div class="audio"><button class="play" data-action="play" aria-label="Play voice note">▶</button><div class="wave"></div><span class="muted small">01:45</span></div>`:''}
    ${post.note?`<div class="file-card" style="background:#fffaf0;min-height:100px;justify-content:center;color:#7d694c"><strong>0/1 Knapsack</strong><span class="muted"> recurrence → dp[i][w] = max(…)</span></div>`:''}
    <div class="post-actions"><button class="action" data-action="comments">${icon('chat')} ${post.comments}</button><button class="action push ${saved?'active':''}" data-action="save">${icon('bookmark')} <span>${saved?'Saved':'Save'}</span></button><button class="action" data-action="share">${icon('share')} <span>Share</span></button><button class="action" data-action="report-post">Report</button>${post.author===state.profileName?`<button class="action" data-action="delete-post">Delete</button>`:''}</div>
  </article>`;
}

function homePageLegacy() {
  const filtered=posts.filter(p=>state.feedFilter==='All'||p.course===state.feedFilter);
  const chips=['All',...channels.map(channel=>channel.name)];
  return shell(`<div class="page-grid"><div class="stack">
    <div class="feed-spacer"></div>
    <div class="chips">${chips.map((c,i)=>`<button class="chip ${state.feedFilter===c?'active':''}" data-filter="${escapeHtml(c)}" data-filter-index="${i-1}">${escapeHtml(c)}</button>`).join('')}</div>
    <div class="stack">${filtered.map(postCard).join('')}</div>
  </div><aside class="stack right-rail">
    <section class="card section-card"><div class="section-title"><h3>Your activity</h3></div><p class="muted">Activity will appear here as you join channels and participate.</p></section>
    <section class="card section-card"><div class="section-title"><h3>Your channels</h3><button class="link-btn" data-nav="channels">See all</button></div>${channels.slice(0,3).map(c=>`<div class="mini-channel"><div class="channel-icon ${c.cls}">${c.icon}</div><div class="channel-body"><strong>${c.name}</strong><span>${c.members} members</span></div>${icon('chevron')}</div>`).join('')}</section>
    <section class="card section-card"><div class="section-title"><h3>Study circle</h3><span class="muted small">12 friends</span></div>${people.slice(0,3).map((p,i)=>`<div class="mini-channel">${avatar(p,['','green','purple'][i])}<div class="channel-body"><strong>${p.name}</strong><span>${p.status}</span></div><button class="action" data-nav="messages">${icon('chat')}</button></div>`).join('')}</section>
  </aside></div>`,'Home');
}

function channelsPageLegacy() {
  const list=channels.filter((c,i)=>(state.channelMode==='discover'||state.joined.has(i))&&c.name.toLowerCase().includes(state.channelSearch.toLowerCase()));
  return shell(`<div class="stack">
    <div style="display:flex;gap:12px"><div class="segment" style="flex:1"><button class="${state.channelMode==='joined'?'active':''}" data-channel-mode="joined">Joined</button><button class="${state.channelMode==='discover'?'active':''}" data-channel-mode="discover">Discover</button></div><button class="icon-btn" data-action="create-channel" aria-label="Create channel">${icon('plus')}</button></div>
    <label class="search-box">${icon('search')}<input id="channel-search" placeholder="Search channels" value="${state.channelSearch}" /></label>
    <div class="stack">${list.length?list.map((c,i)=>{const idx=channels.indexOf(c),joined=state.joined.has(idx);return `<article class="card channel-card"><div class="channel-icon ${c.cls}">${c.icon}</div><div class="channel-copy"><h3 data-open-channel="${idx}" role="button" tabindex="0">${c.name}</h3><div class="muted">${c.sub}</div><div class="channel-tags"><span class="public">◉ ${c.access}</span><span>•</span><span>${c.members} members</span></div><p>${c.desc}</p></div><button class="${joined?'secondary':'primary'}" data-join="${idx}">${joined?'Open':'Join'}</button></article>`}).join(''):`<div class="card empty"><div class="channel-icon">?</div><h3>No channels found</h3><p>Try a different name or browse all available channels.</p></div>`}</div>
  </div>`,'Channels',false);
}

function messagesPageLegacy() {
  const chat=chats[state.activeChat];
  return shell(`<div class="messages-layout ${state.chatOpen?'chat-open':''}">
    <section class="conversation-list"><div class="conversation-search"><label class="search-box">${icon('search')}<input placeholder="Search conversations" /></label></div>${chats.map((c,i)=>`<div class="conversation ${i===state.activeChat?'active':''}" data-chat="${i}">${avatar(c.person,['','green','purple','green'][i])}<div class="conversation-copy"><div class="conversation-top"><strong>${c.person.name}</strong><span class="muted small">${c.time}</span></div><p>${c.preview}</p></div></div>`).join('')}</section>
    <section class="chat-pane"><header class="chat-head"><button class="icon-btn back-mobile" data-action="back-chats">${icon('arrow')}</button>${avatar(chat.person)}<div><strong>${chat.person.name}</strong><div class="small" style="color:var(--green)">${chat.person.status}</div></div><button class="action push">${icon('search')}</button><button class="action">${icon('more')}</button></header><div class="chat-messages" id="chat-messages">${chat.messages.map(m=>`<div class="bubble ${m[0]}">${m[1]}<span class="bubble-time">${m[2]} ${m[0]==='mine'?'✓✓':''}</span></div>`).join('')}</div><form class="chat-compose" id="chat-form"><button type="button" class="action">${icon('paperclip')}</button><input id="message-input" autocomplete="off" placeholder="Write a message..." /><button class="send-btn" aria-label="Send">${icon('send')}</button></form></section>
  </div>`,'Messages',false);
}

function friendsPageLegacy() {
  return shell(`<div class="stack"><div class="segment" style="grid-template-columns:repeat(3,1fr)"><button class="active">Friends</button><button data-action="requests">Requests · 2</button><button data-action="discover">Discover</button></div><label class="search-box">${icon('search')}<input placeholder="Search people" /></label><div class="people-grid">${people.map((p,i)=>`<article class="card person-card">${avatar(p,['','green','purple','green'][i])}<div class="person-info"><strong>${p.name}</strong><span>${p.info}</span><span>${p.status}</span></div><button class="icon-btn" data-person-chat="${i}" aria-label="Message">${icon('chat')}</button><button class="action">${icon('more')}</button></article>`).join('')}</div><section class="card section-card"><div class="section-title"><h3>People you may know</h3><button class="link-btn">See all</button></div>${['Karan Gupta','Neha Singh','Vikram Patel'].map((n,i)=>`<div class="mini-channel">${avatar({initials:n.split(' ').map(x=>x[0]).join('')},i===1?'green':'')}<div class="channel-body"><strong>${n}</strong><span>Computer Science • Dijkstra University</span></div><button class="secondary" data-action="add-friend">+ Add friend</button></div>`).join('')}</section></div>`,'Friends');
}

function savedPageLegacy() {
  const savedPosts=posts.filter(p=>state.saved.has(p.id));
  return shell(`<div class="stack"><section class="card section-card saved-channel-card"><div class="section-title"><div style="display:flex;align-items:center;gap:10px"><div class="channel-icon green">${icon('bookmark')}</div><div><h3 style="margin:0">Saved Messages</h3><div class="muted small">Your personal cloud channel</div></div></div><button class="primary" data-saved-chat>Open</button></div><p class="muted">Send, upload, or share anything here to keep it safe and easy to find later.</p></section>${savedPosts.length?`<div class="page-grid"><div class="stack">${savedPosts.map(postCard).join('')}</div><aside class="stack right-rail"><section class="card section-card"><h3 style="margin-top:0">Saved for later</h3><p class="muted">Your bookmarked posts, PDFs, voice notes and other useful learning materials live here.</p></section></aside></div>`:`<div class="card empty"><div class="channel-icon">${icon('bookmark')}</div><h3>No saved posts yet</h3><p>Bookmark useful discussions and study material to find them quickly later.</p><button class="primary" data-nav="home">Explore your feed</button></div>`}</div>`,'Saved');
}

function savedPage() {
  const savedPosts=posts.filter(p=>state.saved.has(p.id));
  return shell(savedPosts.length?`<div class="page-grid"><div class="stack">${savedPosts.map(postCard).join('')}</div><aside class="stack right-rail"><section class="card section-card"><h3 style="margin-top:0">Saved for later</h3><p class="muted">Your bookmarked posts, PDFs, voice notes and other useful learning materials live here.</p></section></aside></div>`:`<div class="card empty"><div class="channel-icon">${icon('bookmark')}</div><h3>No saved posts yet</h3><p>Bookmark useful discussions and study material to find them quickly later.</p><button class="primary" data-nav="home">Explore your feed</button></div>`,'Saved');
}

function profilePageLegacy2() {
  return shell(`<div class="stack"><section class="card profile-hero">${avatar({initials:'NS'})}<div><h2>Anonymous Student</h2><div class="muted">@naledi • Computer Science, 3rd Year</div><p>Learning in public, one study session at a time.</p></div><button class="secondary" style="margin-left:auto" data-action="edit-profile">Edit profile</button></section><div class="stat-row"><div class="stat"><strong>12</strong><span>Friends</span></div><div class="stat"><strong>4</strong><span>Channels</span></div><div class="stat"><strong>${state.saved.size}</strong><span>Saved</span></div></div><section class="card section-card"><div class="section-title"><h3>Account</h3></div>${[['user','Personal information'],['bell','Notifications'],['bookmark','Saved posts'],['users','Privacy & security']].map(r=>`<div class="settings-row">${icon(r[0])}<span>${r[1]}</span>${icon('chevron','i-right')}</div>`).join('')}</section><button class="secondary danger-action" data-action="logout">Log out</button></div>`,'Profile',false);
}

function profilePage() {
  const accountRows=[['user','Personal information'],['bell','Notifications'],['bookmark','Saved posts'],['grid','Plans & storage'],['users','Privacy & security']];
  const studyLine=[state.profileCourse,state.profileYear].filter(Boolean).join(' · ')||'Add your course and year level';
  return shell(`<div class="stack"><section class="card profile-hero">${currentUserAvatar()}<div><h2>${escapeHtml(state.profileName)}</h2><div class="muted">${escapeHtml(studyLine)}</div><p>${escapeHtml(state.profileBio||'Tell classmates a little about yourself.')}</p></div><button class="secondary" style="margin-left:auto" data-action="edit-profile">Edit profile</button></section><div class="stat-row"><div class="stat"><strong>${state.acceptedRequests.size}</strong><span>Friends</span></div><div class="stat"><strong>${state.joined.size}</strong><span>Channels</span></div><div class="stat"><strong>${state.saved.size}</strong><span>Saved</span></div></div><section class="card section-card"><div class="section-title"><h3>Account</h3></div>${accountRows.map(r=>`<button class="settings-row" data-setting="${escapeHtml(r[1])}">${icon(r[0])}<span>${escapeHtml(r[1])}</span>${icon('chevron','i-right')}</button>`).join('')}</section><button class="secondary danger-action" data-action="logout">Log out</button></div>`,'Profile',false);
}

function settingsPage() {
  const setting=state.activeSetting;
  const copy={
    'Personal information':'Update the details classmates see on your profile.',
    'Privacy & security':'Control who can find you and how your account stays secure.',
  }[setting]||'Manage this area of your account.';
  const securityActions=setting==='Privacy & security'?`<button class="secondary" data-action="password-reset">Send password reset email</button><button class="secondary danger-action" data-action="deactivate-account">Deactivate account</button>`:'';
  return shell(`<div class="stack"><button class="back-link" data-nav="profile">${icon('arrow')} Back to profile</button><section class="card section-card"><h2 style="margin:0">${escapeHtml(setting)}</h2><p class="muted">${escapeHtml(copy)}</p><div class="settings-row">${icon('check')}<span>${setting==='Privacy & security'?'Profile visible to university members':escapeHtml(state.profileName)}</span></div><div class="settings-row">${icon('bell')}<span>${setting==='Privacy & security'?'Login alerts enabled':escapeHtml(state.userEmail||'No email loaded')}</span></div>${securityActions}</section></div>`,setting,false);
}

// Updated feed view: channel attribution is intentionally prominent on every post.
function homePage() {
  const filtered=posts.filter(p=>state.feedFilter==='All'||p.course===state.feedFilter);
  const chips=['All',...channels.map(channel=>channel.name)];
  return shell(`<div class="page-grid"><div class="stack">
    <div class="chips">${chips.map(c=>`<button class="chip ${state.feedFilter===c?'active':''}" data-filter="${c}">${c}</button>`).join('')}</div>
    <div class="stack">${filtered.map(postCard).join('')}</div>
  </div><aside class="stack right-rail">
    <section class="card section-card"><div class="section-title"><h3>Your channels</h3><button class="link-btn" data-nav="channels">See all</button></div>${channels.slice(0,3).map(raw=>`<div class="mini-channel"><div class="channel-icon ${escapeHtml(raw.cls)}">${escapeHtml(raw.icon)}</div><div class="channel-body"><strong>${escapeHtml(raw.name)}</strong><span>${raw.members} members</span></div>${icon('chevron')}</div>`).join('')}</section>
    <section class="card section-card"><div class="section-title"><h3>Study circle</h3><span class="muted small">${people.length} friends</span></div>${people.slice(0,3).map((p,i)=>`<div class="mini-channel" data-profile="${i}">${avatar(p,['','green','purple'][i])}<div class="channel-body"><strong>${escapeHtml(p.name)}</strong><span>${escapeHtml(p.status)}</span></div><button class="action" data-nav="messages">${icon('chat')}</button></div>`).join('')}</section>
  </aside></div>`,'Home');
}

function channelsPage() {
  const list=channels.filter((c,i)=>(state.channelMode==='discover'||state.joined.has(i))&&c.name.toLowerCase().includes(state.channelSearch.toLowerCase()));
  return shell(`<div class="stack">
    <div style="display:flex;gap:12px"><div class="segment" style="flex:1"><button class="${state.channelMode==='joined'?'active':''}" data-channel-mode="joined">Joined</button><button class="${state.channelMode==='discover'?'active':''}" data-channel-mode="discover">Discover</button></div><button class="icon-btn" data-action="create-channel" aria-label="Create channel">${icon('plus')}</button></div>
    <label class="search-box">${icon('search')}<input id="channel-search" placeholder="Search channels" value="${state.channelSearch}" /></label>
    <div class="stack">${list.length?list.map((raw)=>{const c={...raw,name:escapeHtml(raw.name),sub:escapeHtml(raw.sub),access:escapeHtml(raw.access),desc:escapeHtml(raw.desc),icon:escapeHtml(raw.icon),cls:escapeHtml(raw.cls)};const idx=channels.indexOf(raw),joined=!state.isGuest&&state.joined.has(idx);return `<article class="card channel-card"><div class="channel-icon ${c.cls}">${c.icon}</div><div class="channel-copy"><h3 data-open-channel="${idx}" role="button" tabindex="0">${c.name}</h3><div class="muted">${c.sub}</div><div class="channel-tags"><span class="public">◉ ${c.access}</span><span>•</span><span>${raw.members} members</span></div><p>${c.desc}</p></div>${joined?`<div class="channel-actions"><button class="secondary" data-open-channel="${idx}">Open</button><button class="action leave" data-leave="${idx}">Leave</button></div>`:`<button class="primary" data-join="${idx}">Join</button>`}</article>`}).join(''):`<div class="card empty"><div class="channel-icon">?</div><h3>No channels found</h3><p>Try a different name or browse all available channels.</p></div>`}</div>
  </div>`,'Channels',false);
}

function forwardedPost(post) {
  return { type:'forwarded-post', side:'mine', time:'Now', post:{ course:post.course, author:post.author, text:post.text, file:post.file, audio:post.audio } };
}

function messageBubble(message) {
  if (!Array.isArray(message) && message.type==='forwarded-post') {
    let post=message.post||{};
    post={...post,course:escapeHtml(post.course),author:escapeHtml(post.author),text:escapeHtml(post.text),file:post.file?{...post.file,name:escapeHtml(post.file.name),meta:escapeHtml(post.file.meta)}:null};
    return `<div class="bubble ${message.side} forwarded-bubble"><div class="forwarded-label">${icon('share')} Forwarded post</div><div class="forwarded-post"><strong>From #${post.course}</strong><span class="muted small">${post.author}</span><p>${post.text}</p>${post.file?`<div class="forwarded-file"><span class="file-icon">PDF</span><span><b>${post.file.name}</b><small>${post.file.meta}</small></span></div>`:''}${post.audio?`<div class="forwarded-audio">${icon('paperclip')} Voice note</div>`:''}</div><span class="bubble-time">${message.time} ✓✓</span></div>`;
  }
  return `<div class="bubble ${escapeHtml(message[0])}">${escapeHtml(message[1])}<span class="bubble-time">${escapeHtml(message[2])} ${message[0]==='mine'?'✓✓':''}</span></div>`;
}

function messagesPage() {
  if (!chats.length) syncChats();
  const chat=chats[state.activeChat]||chats[0];
  return shell(`<div class="messages-layout ${state.chatOpen?'chat-open':''}">
    <section class="conversation-list"><div class="conversation-search"><label class="search-box">${icon('search')}<input placeholder="Search conversations" /></label></div>${chats.map((c,i)=>`<div class="conversation ${i===state.activeChat?'active':''}" data-chat="${i}">${avatar(c.person,c.saved?'green':['','green','purple','green'][i]||'')}${c.saved?`<span class="saved-pin">${icon('bookmark')}</span>`:''}<div class="conversation-copy"><div class="conversation-top"><strong>${c.person.name}</strong><span class="muted small">${c.time}</span></div><p>${c.preview}</p></div></div>`).join('')}</section>
    <section class="chat-pane"><header class="chat-head"><button class="icon-btn back-mobile" data-action="back-chats">${icon('arrow')}</button>${avatar(chat.person,chat.saved?'green':'')}<div><strong>${chat.person.name}</strong><div class="small" style="color:var(--green)">${chat.person.status}</div></div><button class="action push">${icon('search')}</button><button class="action">${icon('more')}</button></header>${chat.saved?`<div class="saved-note">${icon('bookmark')} Anything you send, upload, or share here is saved to your personal cloud.</div>`:''}<div class="chat-messages" id="chat-messages">${chat.messages.map(messageBubble).join('')}</div><form class="chat-compose" id="chat-form"><button type="button" class="action" data-action="upload-saved">${icon('paperclip')}</button>${chat.saved?`<button type="button" class="action" data-action="share-saved">${icon('share')}</button>`:''}<input id="message-input" autocomplete="off" placeholder="${chat.saved?'Save a message...':'Write a message...'}" /><button class="send-btn" aria-label="Send">${icon('send')}</button></form></section>
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
  return shell(`<div class="stack"><button class="back-link" data-nav="friends">${icon('arrow')} Back to friends</button><section class="card profile-hero">${avatar(user,state.profileUser===1?'green':'')}<div><h2>${user.name}</h2><div class="muted">${user.info}</div><p>${user.status} · StudyLoop member</p></div><button class="primary" data-person-chat="${state.profileUser}">Message</button></section><section class="card section-card"><div class="section-title"><h3>${user.name.split(' ')[0]}’s channels</h3><span class="muted small">${userChannels.length} channels</span></div>${userChannels.map(idx=>{const c=channels[idx],joined=state.joined.has(idx);return `<div class="mini-channel"><div class="channel-icon ${c.cls}">${c.icon}</div><div class="channel-body"><strong>${c.name}</strong><span>${c.sub} · ${c.members} members</span></div>${joined?`<button class="secondary" data-open-channel="${idx}">Open</button>`:`<button class="primary" data-join="${idx}">Join</button>`}</div>`}).join('')}</section><button class="secondary danger-action" data-action="logout">Log out</button></div>`,'Profile',false);
}

function channelDetailPage() {
  const channelRaw=channels[state.activeChannel]||channels[0];
  const channel={...channelRaw,name:escapeHtml(channelRaw.name),course:escapeHtml(channelRaw.course),sub:escapeHtml(channelRaw.sub),access:escapeHtml(channelRaw.access),desc:escapeHtml(channelRaw.desc),icon:escapeHtml(channelRaw.icon),cls:escapeHtml(channelRaw.cls)};
  const channelPosts=posts.filter(p=>p.course===channelRaw.name);
  const files=channelPosts.filter(p=>p.file);
  const members=people.filter((p,i)=>profileChannelsFor(i).includes(state.activeChannel));
  const joined=!state.isGuest&&state.joined.has(state.activeChannel);
  const body=state.channelTab==='files'
    ? (files.length?files.map(p=>`<div class="card file-row"><div class="file-icon">PDF</div><div class="file-info"><strong>${p.file.name}</strong><span>${p.file.meta} · From ${p.author}</span></div><button class="download" data-action="download">${icon('download')}</button></div>`).join(''):`<div class="card empty"><div class="channel-icon">${icon('paperclip')}</div><h3>No files yet</h3><p>Files shared in this channel will appear here.</p></div>`)
    : state.channelTab==='members'
      ? `<div class="people-grid">${members.length?members.map(p=>`<article class="card person-card" data-profile="${people.indexOf(p)}">${avatar(p)}<div class="person-info"><strong>${p.name}</strong><span>${p.info}</span></div>${icon('chevron')}</article>`).join(''):`<div class="card empty"><h3>No members yet</h3></div>`}</div>`
      : (channelPosts.length?channelPosts.map(postCard).join(''):`<div class="card empty"><div class="channel-icon ${channel.cls}">${channel.icon}</div><h3>No posts yet</h3><p>Start the conversation in this channel.</p><button class="primary" data-action="channel-post">New post</button></div>`);
  return shell(`<div class="stack"><button class="back-link" data-nav="channels">${icon('arrow')} Back to channels</button><section class="card channel-hero"><div class="channel-icon ${channel.cls}">${channel.icon}</div><div class="channel-hero-copy"><h2>${channel.name}</h2><p>${channel.desc}</p><div class="channel-tags"><span class="public">◉ ${channel.access}</span><span>•</span><span>${channel.members} members</span><span>•</span><span>${channel.sub}</span></div></div>${joined?`<button class="secondary" data-leave="${state.activeChannel}">Leave</button>`:`<button class="primary" data-join="${state.activeChannel}">Join</button>`}</section><div class="channel-tabs"><button class="${state.channelTab==='posts'?'active':''}" data-channel-tab="posts">Posts</button><button class="${state.channelTab==='files'?'active':''}" data-channel-tab="files">Files</button><button class="${state.channelTab==='members'?'active':''}" data-channel-tab="members">Members</button></div><div class="stack">${body}</div>${joined&&state.channelTab==='posts'?`<button class="new-post-bar" data-action="channel-post"><span class="channel-icon">${icon('plus')}</span> Start a new post in ${channel.name}…</button>`:''}</div>`,'Channel',false);
}

function friendsPageLegacy2() {
  return shell(`<div class="stack"><div class="segment" style="grid-template-columns:repeat(3,1fr)"><button class="active">Friends</button><button data-action="requests">Requests · 2</button><button data-action="discover">Discover</button></div><label class="search-box">${icon('search')}<input placeholder="Search people" /></label><div class="people-grid">${people.map((p,i)=>`<article class="card person-card" data-profile="${i}">${avatar(p,['','green','purple','green'][i])}<div class="person-info"><strong>${p.name}</strong><span>${p.info}</span><span>${p.status}</span></div><button class="icon-btn" data-person-chat="${i}" aria-label="Message">${icon('chat')}</button><button class="action">${icon('more')}</button></article>`).join('')}</div><section class="card section-card"><div class="section-title"><h3>People you may know</h3><button class="link-btn">See all</button></div>${['Karan Gupta','Neha Singh','Vikram Patel'].map((n,i)=>`<div class="mini-channel">${avatar({initials:n.split(' ').map(x=>x[0]).join('')},i===1?'green':'')}<div class="channel-body"><strong>${n}</strong><span>Computer Science · Dijkstra University</span></div><button class="secondary" data-action="add-friend">+ Add friend</button></div>`).join('')}</section></div>`,'Friends');
}

function friendsPage() {
  const tabs=[['friends','Friends'],['requests',`Requests · ${friendRequests.filter((_,i)=>!state.acceptedRequests.has(i)).length}`],['discover','Discover']];
  const tabBar=`<div class="segment friends-tabs" style="grid-template-columns:repeat(3,1fr)">${tabs.map(([id,label])=>`<button class="${state.friendTab===id?'active':''}" data-friend-tab="${id}">${label}</button>`).join('')}</div>`;
  const friendCards=people.map((raw,i)=>{const p={...raw,name:escapeHtml(raw.name),info:escapeHtml(raw.info),status:escapeHtml(raw.status)};return `<article class="card person-card" data-profile="${i}">${avatar(p,['','green','purple','green'][i])}<div class="person-info"><strong>${p.name}</strong><span>${p.info}</span><span>${p.status}</span></div><button class="icon-btn" data-person-chat="${i}" aria-label="Message">${icon('chat')}</button></article>`}).join('');
  const requestCards=friendRequests.filter((_,i)=>!state.acceptedRequests.has(i)).map((p,i)=>`<article class="card person-card"><div class="avatar ${i?'green':''}">${p.initials}</div><div class="person-info"><strong>${p.name}</strong><span>${p.info}</span><span>${p.status}</span></div><div class="friend-actions"><button class="secondary" data-request-action="decline" data-request-id="${i}">Decline</button><button class="primary" data-request-action="accept" data-request-id="${i}">Accept</button></div></article>`).join('')||`<div class="card empty"><div class="channel-icon green">${icon('check')}</div><h3>You're all caught up</h3><p>No pending friend requests.</p></div>`;
  const discoverCards=discoverPeople.map((p,i)=>`<article class="card person-card"><div class="avatar ${i===1?'green':'purple'}">${p.initials}</div><div class="person-info"><strong>${p.name}</strong><span>${p.info}</span><span>${p.status}</span></div><button class="${state.sentRequests.has(i)?'secondary':'primary'}" data-discover-add="${i}" ${state.sentRequests.has(i)?'disabled':''}>${state.sentRequests.has(i)?'Request sent':'Add friend'}</button></article>`).join('');
  const content=state.friendTab==='friends'?friendCards:state.friendTab==='requests'?requestCards:discoverCards;
  return shell(`<div class="stack">${tabBar}<label class="search-box">${icon('search')}<input placeholder="Search people" /></label><div class="people-grid">${content}</div></div>`,'Friends');
}

function postDetailPage() {
  const post=posts.find(p=>p.id===state.activePost)||posts[0];
  const comments=discussionComments[post.id]||[];
  return shell(`<div class="stack"><button class="back-link" data-nav="home">${icon('arrow')} Back to feed</button>${postCard(post)}<section class="card discussion-card"><div class="section-title"><h3>Discussion · ${comments.length} comments</h3><button class="link-btn">Newest</button></div><div class="comment-list">${comments.map(c=>`<article class="comment"><div class="avatar">${c.initials}</div><div class="comment-copy"><div><strong>${c.name}</strong><span>${c.ago}</span></div><p>${c.text}</p><button data-action="reply" class="link-btn">Reply</button></div></article>`).join('')}</div><form id="comment-form" class="comment-compose"><input name="comment" required autocomplete="off" placeholder="Write a comment…" /><button class="send-btn" aria-label="Post comment">${icon('send')}</button></form></section></div>`,'Discussion',false);
}

function notificationsPage() {
  const content=notifications.length?notifications.map(n=>`<article class="card notification-item ${state.readNotifications.has(n.id)?'read':''}"><div class="notification-icon">${icon(n.icon)}</div><div><strong>${n.title}</strong><p>${n.body}</p><span>${n.time}</span></div>${!state.readNotifications.has(n.id)?'<i></i>':''}</article>`).join(''):`<div class="card empty"><div class="notification-icon">${icon('bell')}</div><h3>No notifications</h3><p class="muted">You’re all caught up. New activity will appear here.</p></div>`;
  return shell(`<div class="stack"><div class="section-title"><div><h2 style="margin:0">Notifications</h2><p class="muted" style="margin:4px 0 0">Stay up to date with your learning circle.</p></div>${notifications.length?'<button class="secondary" data-action="mark-notifications-read">Mark all read</button>':''}</div>${content}</div>`,'Notifications',false);
}

function postComposerModal() {
  const channel=channels[state.activeChannel]||channels[0];
  const displayChannelName=escapeHtml(channel.name);
  const premium=state.subscriptionPlan!=='Free';
  return `<div class="modal-backdrop" data-action="close-modal"><form class="modal" id="post-form"><div class="modal-head"><div><h2>New post</h2><p class="muted" style="margin:4px 0 0">Posting in #${displayChannelName}</p></div><button type="button" class="icon-btn" data-action="close-modal">${icon('x')}</button></div><div class="field"><label>Text</label><textarea name="postText" maxlength="1000" placeholder="Ask a question, share a note, or start a discussion…"></textarea></div>${premium?`<div class="field"><label>Attachments</label><input type="file" name="assets" multiple accept="image/*,audio/*,application/pdf" /><span class="muted small">You can combine text, an image, a file, and a voice note.</span></div><div class="voice-recorder"><button type="button" class="secondary" data-action="record-voice">${icon('chat')} Record voice note</button><span class="muted small" id="voice-status">Not recording</span><audio id="voice-preview" controls hidden></audio></div>`:`<div class="card" style="padding:12px;background:var(--tg-blue-pale);color:var(--tg-blue-dark)">Free accounts can publish text posts. Upgrade to Student+ or Power to add pictures, files, and voice notes.</div>`}<div class="modal-actions"><button type="button" class="secondary" data-action="close-modal">Cancel</button><button class="primary">Publish post</button></div></form></div>`;
}

function profileEditorModal() {
  return `<div class="modal-backdrop" data-action="close-modal"><form class="modal" id="profile-form"><div class="modal-head"><h2>Edit profile</h2><button type="button" class="icon-btn" data-action="close-modal">${icon('x')}</button></div><div class="form-grid"><div class="field"><label>Profile picture</label><input type="file" name="profilePhoto" accept="image/*" /><span class="muted small">Choose a clear photo of yourself.</span></div><div class="field"><label>Display name</label><input name="displayName" required value="${escapeHtml(state.profileName)}" /></div><div class="field"><label>Course</label><input name="course" required value="${escapeHtml(state.profileCourse)}" placeholder="e.g. Computer Science" /></div><div class="field"><label>Year level</label><input name="yearLevel" required value="${escapeHtml(state.profileYear)}" placeholder="e.g. Year 3" /></div><div class="field"><label>Bio</label><textarea name="bio" maxlength="180" placeholder="Tell classmates about your learning interests.">${escapeHtml(state.profileBio)}</textarea></div></div><div class="modal-actions"><button type="button" class="secondary" data-action="close-modal">Cancel</button><button class="primary">Save changes</button></div></form></div>`;
}

function shareModal(postId) {
  const post=posts.find(p=>p.id===postId);
  return `<div class="modal-backdrop" data-action="close-modal"><div class="modal share-modal"><div class="modal-head"><h2>Share this post</h2><button type="button" class="icon-btn" data-action="close-modal">${icon('x')}</button></div><p class="muted">Choose a destination for “${post?.course||'this post'}”.</p><div class="share-targets"><button class="share-target" data-share-target="saved"><div class="channel-icon green">${icon('bookmark')}</div><span><strong>Saved Messages</strong><small>Keep it in your personal cloud</small></span>${icon('chevron')}</button>${people.map((p,i)=>`<button class="share-target" data-share-target="${i}">${avatar(p,i===1?'green':'')}<span><strong>${p.name}</strong><small>${p.info}</small></span>${icon('chevron')}</button>`).join('')}</div></div></div>`;
}

function createChannelModalLegacy() {
  return `<div class="modal-backdrop" data-action="close-modal"><form class="modal" id="channel-form"><div class="modal-head"><h2>Create channel</h2><button type="button" class="icon-btn" data-action="close-modal">${icon('x')}</button></div><div class="form-grid"><div class="field"><label>Channel name</label><input name="name" maxlength="50" required placeholder="e.g. SQL Queries & Joins" /></div><div class="field"><label>Description</label><textarea name="description" maxlength="250" placeholder="What is this channel about? Who is it for?"></textarea></div><div class="field"><label>Course</label><select name="course"><option>Computer Science</option><option>Database Systems</option><option>Mathematics</option></select></div><div class="field"><label>Module</label><input name="module" required placeholder="e.g. SQL Joins & Constraints" /></div><div class="field"><label>Visibility</label><div class="radio-row"><div class="radio-card selected" data-visibility="Public"><strong>Public</strong><div class="muted small">Anyone can discover and join.</div></div><div class="radio-card" data-visibility="Private"><strong>Private</strong><div class="muted small">Only invited members can join.</div></div></div></div></div><div class="modal-actions"><button type="button" class="secondary" data-action="close-modal">Cancel</button><button class="primary">Create channel</button></div></form></div>`;
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
  const pages={landing:landingPage,home:homePage,channels:channelsPage,messages:messagesPage,friends:friendsPage,saved:savedPage,pricing:pricingPage,profile:profilePage,settings:settingsPage,terms:()=>legalPage('terms'),privacy:()=>legalPage('privacy'),'user-profile':userProfilePage,'channel-detail':channelDetailPage,'post-detail':postDetailPage,notifications:notificationsPage};
  $('#app').innerHTML=(pages[state.page]||homePage)();
  if(state.page==='messages') requestAnimationFrame(()=>{const c=$('#chat-messages');if(c)c.scrollTop=c.scrollHeight;});
}

function usageSummaryHtml(){
  const limits={Free:{storage:100,downloads:500,saved:7},'Student+':{storage:5120,downloads:5120,saved:null},Power:{storage:20480,downloads:15360,saved:null}};
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
    state.page=nav.dataset.nav;state.chatOpen=false;render();return;
  }
  const shareTarget=e.target.closest('[data-share-target]'); if(shareTarget){
    if(guestNeedsSignIn('Sign in to share posts with classmates or save them.')) return;
    const postId=+(document.querySelector('.share-modal')?.dataset.postId||state.sharePostId||0); const post=posts.find(p=>p.id===postId)||posts[0];
    const target=shareTarget.dataset.shareTarget==='saved'?0:+shareTarget.dataset.shareTarget+1;
    state.activeChat=target; const participants=target===0?[state.userId]:[state.userId,people[target-1]?.id].filter(Boolean);
    saveCloudMessage({conversationId:conversationIdFor(target),participants,senderId:state.userId,type:'forwardedPost',text:post.text,post:{course:post.course,author:post.author,text:post.text,file:post.file||null,audioURL:post.audioURL||null}}).then(()=>subscribeActiveMessages()).catch(error=>notify(error.message||'Unable to forward this post.'));
    document.querySelector('.modal-backdrop')?.remove(); state.page='messages'; state.chatOpen=true; notify(target===0?'Saved to Saved Messages':`Shared with ${chats[target].person.name}`); render(); return;
  }
  const filter=e.target.closest('[data-filter]'); if(filter){state.feedFilter=filter.dataset.filterIndex&&+filter.dataset.filterIndex>=0?channels[+filter.dataset.filterIndex]?.name||'All':'All';render();return;}
  const mode=e.target.closest('[data-channel-mode]'); if(mode){state.channelMode=mode.dataset.channelMode;render();return;}
  const channelTab=e.target.closest('[data-channel-tab]'); if(channelTab){state.channelTab=channelTab.dataset.channelTab;render();return;}
  const authMode=e.target.closest('[data-auth-mode]'); if(authMode){state.authMode=authMode.dataset.authMode;document.querySelector('.auth-backdrop')?.remove();openAuthModal();return;}
  const selectPlan=e.target.closest('[data-select-plan]'); if(selectPlan){if(guestNeedsSignIn('Sign in to choose a StudyLoop plan.'))return;notify('Plan activation requires verified billing setup.');return;}
  const setting=e.target.closest('[data-setting]'); if(setting){const name=setting.dataset.setting;if(name==='Notifications'){state.page='notifications';}else if(name==='Saved posts'){state.page='saved';}else if(name==='Plans & storage'){state.page='pricing';}else{state.activeSetting=name;state.page='settings';}render();return;}
  const friendTab=e.target.closest('[data-friend-tab]'); if(friendTab){state.friendTab=friendTab.dataset.friendTab;render();return;}
  const requestAction=e.target.closest('[data-request-action]'); if(requestAction){const id=+requestAction.dataset.requestId;state.acceptedRequests.add(id);notify(requestAction.dataset.requestAction==='accept'?`${friendRequests[id].name} is now your friend`:'Friend request declined');render();return;}
  const discoverAdd=e.target.closest('[data-discover-add]'); if(discoverAdd){const id=+discoverAdd.dataset.discoverAdd;state.sentRequests.add(id);notify(`Friend request sent to ${discoverPeople[id].name}`);render();return;}
  const chat=e.target.closest('[data-chat]'); if(chat){if(guestNeedsSignIn('Sign in to read and send private messages.'))return;state.activeChat=+chat.dataset.chat;state.chatOpen=true;subscribeActiveMessages();render();return;}
  const savedChat=e.target.closest('[data-saved-chat]'); if(savedChat){if(guestNeedsSignIn('Sign in to access Saved Messages.'))return;state.activeChat=0;state.page='messages';state.chatOpen=true;subscribeActiveMessages();render();return;}
  const personChat=e.target.closest('[data-person-chat]'); if(personChat){if(guestNeedsSignIn('Sign in to message classmates.'))return;state.activeChat=+personChat.dataset.personChat+1;state.page='messages';state.chatOpen=true;subscribeActiveMessages();render();return;}
  const profile=e.target.closest('[data-profile]'); if(profile){state.profileUser=+profile.dataset.profile;state.page='user-profile';render();return;}
  const join=e.target.closest('[data-join]'); if(join){if(guestNeedsSignIn('Sign in to join this channel.'))return;const idx=+join.dataset.join;const channel=channels[idx];if(state.joined.has(idx)){state.activeChannel=idx;state.page='channel-detail';render();}else{setMembership(state.userId,channel.id,true).then(()=>notify(`Joined ${channel.name}`)).catch(error=>notify(error.message||'Unable to join this channel.'));}return;}
  const leave=e.target.closest('[data-leave]'); if(leave){if(guestNeedsSignIn('Sign in to manage your channel membership.'))return;const idx=+leave.dataset.leave;const channel=channels[idx];setMembership(state.userId,channel.id,false).then(()=>notify(`Left ${channel.name}`)).catch(error=>notify(error.message||'Unable to leave this channel.'));return;}
  const openChannel=e.target.closest('[data-open-channel]'); if(openChannel){state.activeChannel=+openChannel.dataset.openChannel;state.channelTab='posts';state.page='channel-detail';render();return;}
  const action=e.target.closest('[data-action]'); if(!action)return;
  const post=action.closest('[data-post]');
  if(action.dataset.action==='sign-in'){openAuthModal();return;}
  if(action.dataset.action==='password-reset'){sendPasswordReset(state.userEmail).then(()=>notify('Password reset email sent')).catch(error=>notify(error.message||'Unable to send reset email.'));return;}
  if(action.dataset.action==='deactivate-account'){if(!confirm('Deactivate your account? You will be signed out.'))return;deactivateUser(state.userId).then(()=>signOutUser()).then(()=>{state.isAuthenticated=false;state.userId='';state.userEmail='';state.page='landing';render();notify('Account deactivated');}).catch(error=>notify(error.message||'Unable to deactivate account.'));return;}
  if(action.dataset.action==='logout'){signOutUser().then(()=>{state.isAuthenticated=false;state.isGuest=false;state.userId='';state.userEmail='';state.profileName='';state.profilePhotoURL='';state.page='landing';render();notify('You have been logged out');}).catch(error=>notify(error.message||'Unable to log out.'));return;}
  if(action.dataset.action==='continue-guest'){document.querySelector('.auth-backdrop')?.remove();state.isGuest=true;state.page='home';state.chatOpen=false;notify('Browsing StudyLoop as a guest');render();return;}
  if(['save','share','create-channel','upload-saved','upload-file','share-saved','channel-post','add-friend','edit-profile','notifications'].includes(action.dataset.action)&&guestNeedsSignIn('Sign in to participate in StudyLoop.')) return;
  if(action.dataset.action==='report-post'&&post){report('post',String(post.id),'User report',state.userEmail||'guest').catch(()=>{});notify('Post reported');return;}
  if(action.dataset.action==='delete-post'&&post&&post.author===state.profileName){const index=posts.findIndex(item=>item.id===post.id);if(index>=0)posts.splice(index,1);deleteCloudPost(post.id).catch(()=>{});state.page='home';render();return;}
  if(action.dataset.action==='upload-saved'||action.dataset.action==='upload-file'){$('#file-upload').click();return;}
  if(action.dataset.action==='channel-post'){state.recordedAudio=null;document.body.insertAdjacentHTML('beforeend',postComposerModal());return;}
  if(action.dataset.action==='record-voice'){
    if(!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder){notify('Voice recording is not supported in this browser.');return;}
    const status=$('#voice-status'); const preview=$('#voice-preview');
    if(activeRecorder?.state==='recording'){activeRecorder.stop();clearInterval(recordingTimer);action.textContent='Record voice note';return;}
    navigator.mediaDevices.getUserMedia({ audio:true }).then(stream=>{
      activeRecordingStream=stream; const chunks=[]; activeRecorder=new MediaRecorder(stream);
      activeRecorder.ondataavailable=event=>{if(event.data.size)chunks.push(event.data);};
      activeRecorder.onstop=()=>{state.recordedAudio=new Blob(chunks,{type:activeRecorder.mimeType||'audio/webm'});stream.getTracks().forEach(track=>track.stop());if(preview){preview.src=URL.createObjectURL(state.recordedAudio);preview.hidden=false;}clearInterval(recordingTimer);const seconds=Math.max(1,Math.round((Date.now()-recordingStartedAt)/1000));state.recordedAudioDuration=seconds;if(status)status.textContent='Voice note ready · '+Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0');action.textContent='Record again';};
      activeRecorder.start(); recordingStartedAt=Date.now(); if(status)status.textContent='Recording 0:00 · tap to stop'; recordingTimer=setInterval(()=>{const seconds=Math.floor((Date.now()-recordingStartedAt)/1000);if(status)status.textContent='Recording '+Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0')+' · tap to stop';},250); action.textContent='Stop recording';
    }).catch(()=>notify('Microphone permission is needed to record a voice note.'));
    return;
  }
  if(action.dataset.action==='share-saved'){state.sharePostId=state.activePost;document.body.insertAdjacentHTML('beforeend',shareModal(state.sharePostId));return;}
  if(action.dataset.action==='edit-profile'){document.body.insertAdjacentHTML('beforeend',profileEditorModal());return;}
  if(action.dataset.action==='mark-notifications-read'){notifications.forEach(n=>state.readNotifications.add(n.id));render();return;}
  if(action.dataset.action==='save'&&post){const id=String(post.dataset.post);const willSave=!state.saved.has(id);setSavedPost(state.userId,id,willSave).then(()=>notify(willSave?'Post saved':'Removed from saved')).catch(error=>notify(error.message||'Unable to update saved posts.'));}
  else if(action.dataset.action==='share'&&post){state.sharePostId=+post.dataset.post;document.body.insertAdjacentHTML('beforeend',shareModal(state.sharePostId));}
  else if(action.dataset.action==='download') notify('Download started');
  else if(action.dataset.action==='play'){action.textContent=action.textContent==='❚❚'?'▶':'❚❚';notify(action.textContent==='❚❚'?'Playing voice note':'Voice note paused');}
  else if(action.dataset.action==='comments'&&post){state.activePost=+post.dataset.post;state.page='post-detail';render();}
  else if(action.dataset.action==='create-channel') document.body.insertAdjacentHTML('beforeend',createChannelModal());
  else if(action.dataset.action==='close-modal') {
    const isBackdrop = action.classList.contains('modal-backdrop');
    if (!isBackdrop || e.target === action) action.closest('.modal-backdrop').remove();
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
});

document.addEventListener('submit',async e=>{
  if(e.target.id==='auth-form'){e.preventDefault();const data=new FormData(e.target);if(state.authMode==='signup'&&!data.get('terms')){notify('Accept the Terms & Conditions to create your account.');return;}try{const user=state.authMode==='signup'?await signUp(data.get('username'),data.get('email'),data.get('password')):await signIn(data.get('email'),data.get('password'));state.userEmail=user.email;applyTestEntitlement(user.email);state.profileName=state.authMode==='signup'?data.get('username'):state.profileName;state.isGuest=false;state.isAuthenticated=true;$('.auth-backdrop')?.remove();state.page='home';state.chatOpen=false;notify('Signed in successfully');render();}catch(error){notify(userFacingError(error,'Unable to sign in.'));}}
  if(e.target.id==='chat-form'){e.preventDefault();if(guestNeedsSignIn('Sign in to send messages.'))return;const input=$('#message-input');const value=input.value.trim();if(!value)return;const participants=state.activeChat===0?[state.userId]:[state.userId,people[state.activeChat-1]?.id].filter(Boolean);saveCloudMessage({conversationId:conversationIdFor(),participants,senderId:state.userId,type:'text',text:value}).catch(error=>notify(userFacingError(error,'Unable to send message.')));input.value='';}
  if(e.target.id==='channel-form'){e.preventDefault();if(guestNeedsSignIn('Sign in to create a channel.'))return;const data=new FormData(e.target);const submit=e.target.querySelector('button.primary');submit.disabled=true;try{const id=await createCloudChannel({name:data.get('name').trim(),course:data.get('course').trim(),sub:data.get('module').trim(),access:'Public',desc:data.get('description').trim(),icon:data.get('name').trim().slice(0,2).toUpperCase(),cls:'',members:1,ownerId:state.userId});await setMembership(state.userId,id,true);$('.modal-backdrop').remove();state.page='channels';notify('Channel created');render();}catch(error){notify(error.message||'Unable to create this channel.');submit.disabled=false;}}
  if(e.target.id==='post-form'){e.preventDefault();if(guestNeedsSignIn('Sign in to publish a post.'))return;const data=new FormData(e.target);const text=data.get('postText').trim();const assets=data.getAll('assets').filter(file=>file instanceof File&&file.size);if(!text&&!assets.length&&!state.recordedAudio){notify('Add text, an attachment, or a voice note before publishing.');return;}const submit=e.target.querySelector('button.primary');submit.disabled=true;submit.textContent='Publishing…';document.querySelector('.modal-backdrop')?.remove();notify('Publishing post…');try{const channel=channels[state.activeChannel]||channels[0];const id=String(Date.now());const image=assets.find(file=>file.type.startsWith('image/'));const audio=state.recordedAudio||assets.find(file=>file.type.startsWith('audio/'));const documentFile=assets.find(file=>file.type==='application/pdf');const [imageURL,audioURL,fileURL]=await Promise.all([image?uploadAsset(image,`users/${state.userId}/posts/${id}/${safeStorageName(image)}`):null,audio?uploadAsset(audio,`users/${state.userId}/posts/${id}/voice-note.${audio.type.includes('ogg')?'ogg':'webm'}`):null,documentFile?uploadAsset(documentFile,`users/${state.userId}/posts/${id}/${safeStorageName(documentFile)}`):null]);const post={id,initials:initials(state.profileName),author:state.profileName,authorId:state.userId,authorPhotoURL:state.profilePhotoURL,ago:'now',course:channel.name,channelId:channel.id,icon:channel.icon,text,comments:0,imageURL,audioURL,file:documentFile?{name:documentFile.name,meta:`${Math.max(1,Math.round(documentFile.size/1024))} KB`,url:fileURL}:undefined};posts.unshift(post);await saveCloudPost(post,state.userId);state.recordedAudio=null;$('.modal-backdrop').remove();state.page='channel-detail';state.channelTab='posts';render();notify('Post published');}catch(error){notify(error.message||'Unable to publish your post.');submit.disabled=false;submit.textContent='Publish post';}}
  if(e.target.id==='comment-form'){e.preventDefault();if(guestNeedsSignIn('Sign in to comment on this discussion.'))return;const data=new FormData(e.target);if(!discussionComments[state.activePost])discussionComments[state.activePost]=[];discussionComments[state.activePost].push({initials:'NS',name:'Anonymous student',ago:'now',text:data.get('comment')});render();}
  if(e.target.id==='profile-form'){e.preventDefault();const data=new FormData(e.target);const save=e.target.querySelector('button.primary');save.disabled=true;save.textContent='Saving…';try{const photo=data.get('profilePhoto');const profile={username:data.get('displayName').trim(),bio:data.get('bio').trim(),course:data.get('course').trim(),yearLevel:data.get('yearLevel').trim(),photoURL:state.profilePhotoURL};if(photo instanceof File&&photo.size)profile.photoURL=await uploadAsset(photo,`users/${state.userId}/profile/${safeStorageName(photo)}`);await updateUserProfile(state.userId,profile);applyProfile(profile);$('.modal-backdrop')?.remove();render();notify('Profile updated');}catch(error){notify(error.message||'Unable to save your profile.');save.disabled=false;save.textContent='Save changes';}}
});

document.addEventListener('change',async e=>{
  if(e.target.matches('#auth-form input[name="terms"]')){
    const submit=e.target.form.querySelector('.auth-submit');
    submit.disabled=!e.target.checked;
    submit.setAttribute('aria-disabled',String(!e.target.checked));
    return;
  }
  if(e.target.id==='file-upload'){
    const file=e.target.files?.[0]; if(!file)return;
    const size=file.size<1024*1024?`${Math.max(1,Math.round(file.size/1024))} KB`:`${(file.size/(1024*1024)).toFixed(1)} MB`;
    const chat=chats[state.activeChat]||chats[0];
    try { const url=await uploadAsset(file,`users/${state.userId}/saved/${safeStorageName(file)}`); chat.messages.push(['mine',`File uploaded: ${file.name} · ${size} (${url})`,'Now']); chat.preview=`Uploaded ${file.name}`; notify('File saved'); } catch(error) { notify(error.message||'Unable to upload your file.'); } finally { e.target.value=''; render(); }
  }
});

document.addEventListener('click',e=>{
  const radio=e.target.closest('[data-visibility]');if(radio){$$('.radio-card').forEach(x=>x.classList.remove('selected'));radio.classList.add('selected');}
});

let stopCloudPosts, stopCloudChannels, stopCloudUsers, stopCloudMemberships, stopCloudSaved, stopActiveMessages;
function syncJoinedChannels() { state.joined=new Set(channels.map((channel,index)=>state.memberChannelIds.has(channel.id)?index:-1).filter(index=>index>=0)); }
async function subscribeActiveMessages() {
  stopActiveMessages?.();
  const conversationId=conversationIdFor();
  if(!conversationId)return;
  try { stopActiveMessages=await observeMessages(conversationId, messages=>{const chat=chats[state.activeChat];if(!chat)return;chat.messages=messages.map(message=>message.type==='forwardedPost'?{type:'forwarded-post',side:message.senderId===state.userId?'mine':'theirs',time:message.createdAt?.toDate?message.createdAt.toDate().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}):'Now',post:message.post}:{side:message.senderId===state.userId?'mine':'theirs',text:message.text||'',time:message.createdAt?.toDate?message.createdAt.toDate().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}):'Now'}).map(message=>message.type==='forwarded-post'?message:[message.side,message.text,message.time]);chat.preview=messages.at(-1)?.text||'Forwarded post';render();},error=>console.warn('Unable to load messages',error)); } catch(error) { console.warn('Unable to subscribe to messages',error); }
}
async function connectFirebase() {
  try {
    stopCloudPosts=await observePosts(cloudPosts => { posts.splice(0,posts.length,...cloudPosts.map(post => ({ ...post, id:String(post.id), ago:post.ago||'just now', comments:post.comments||0 }))); render(); }, error => console.warn('Unable to load posts', error));
    stopCloudChannels=await observeChannels(cloudChannels => { channels.splice(0,channels.length,...cloudChannels.map(channel=>({ icon:channel.icon||'SL', cls:channel.cls||'', access:channel.access||'Public', members:channel.members||0, desc:channel.desc||'', sub:channel.sub||'', ...channel }))); syncJoinedChannels(); render(); }, error => console.warn('Unable to load channels', error));
    await observeAuth(async user => {
      if (!user) {
        if (!state.isGuest) { state.isAuthenticated=false; state.userId=''; state.userEmail=''; }
        return;
      }
      state.isAuthenticated=true; state.isGuest=false; state.userId=user.uid; state.userEmail=user.email||''; applyTestEntitlement(state.userEmail);
      try { applyProfile(await getUserProfile(user.uid)); } catch (error) { console.warn('Unable to load profile', error); }
      if (!stopCloudUsers) stopCloudUsers=await observeUsers(users => { people.splice(0,people.length,...users.filter(profile=>profile.id!==state.userId).map(profile=>({ id:profile.id, initials:initials(profile.username||'Student'), name:profile.username||'Student', info:[profile.course,profile.yearLevel].filter(Boolean).join(' · '), status:profile.bio||'', photoURL:profile.photoURL||'' }))); friendRequests.splice(0);discoverPeople.splice(0);notifications.splice(0);syncChats(); render(); }, error=>console.warn('Unable to load users',error));
      if (!stopCloudMemberships) stopCloudMemberships=await observeMemberships(user.uid, ids=>{state.memberChannelIds=new Set(ids);syncJoinedChannels();render();}, error=>console.warn('Unable to load memberships',error));
      if (!stopCloudSaved) stopCloudSaved=await observeSaved(user.uid, ids=>{state.saved=new Set(ids);render();}, error=>console.warn('Unable to load saved posts',error));
      if (state.page==='landing') state.page='home';
      render();
    });
  } catch (error) { console.warn('Firebase is unavailable', error); }
}

render();
connectFirebase();
