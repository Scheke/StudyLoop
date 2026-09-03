# StudyLoop v2 architecture

## Non-negotiable boundaries

- Firestore is the canonical application state.
- Cloud Storage contains immutable binary objects only.
- Cloud Functions authorize and perform every security-sensitive mutation.
- The browser performs authenticated realtime reads, requests trusted mutations,
  and uploads only to server-issued paths.
- Security Rules use the same canonical documents as Cloud Functions.
- Existing flat v1 collections remain read-only during migration and are removed
  only after their data has been verified in v2.

## Canonical Firestore schema

```text
users/{uid}
publicProfiles/{uid}

channels/{channelId}
channels/{channelId}/members/{uid}
channels/{channelId}/posts/{postId}
channels/{channelId}/posts/{postId}/comments/{commentId}

conversations/{conversationId}
conversations/{conversationId}/messages/{messageId}
conversations/{conversationId}/members/{uid}

users/{uid}/savedPosts/{postId}
users/{uid}/notifications/{notificationId}
users/{uid}/blocks/{blockedUid}
users/{uid}/usage/{periodId}
users/{uid}/subscription/current

uploadSessions/{uploadId}
downloadGrants/{grantId}
adminAudit/{auditId}
```

The only source of channel authorization is
`channels/{channelId}/members/{uid}`. The only source of conversation
authorization is `conversations/{conversationId}/members/{uid}`.

## Canonical Storage schema

```text
profiles/{uid}/avatar/{attachmentId}
channels/{channelId}/avatar/{attachmentId}
channels/{channelId}/posts/{postId}/{attachmentId}
channels/{channelId}/comments/{commentId}/{attachmentId}
conversations/{conversationId}/messages/{messageId}/{attachmentId}
```

Firestore stores `storagePath`, never a local Blob URL or device file path.

## Attachment lifecycle

```text
created -> uploading -> uploaded -> validating -> ready -> published
                         |              |
                         +--> failed <--+
```

1. The client requests a draft and declares attachment names, sizes and MIME
   types.
2. A callable Function validates authentication, membership, count, plan and
   quota, then returns server-generated IDs and Storage paths.
3. The client uploads bytes with resumable progress.
4. Storage processing verifies the object and records its actual properties.
5. A finalize Function publishes the post/message/comment only when every
   attachment is ready.
6. A scheduled cleanup removes abandoned or rejected sessions.

## Trusted mutations

- create/update/delete channel
- join/leave channel
- create/finalize/edit/delete post
- create/finalize/delete comment
- create conversation and send/edit/delete/mark-read message
- block/unblock user
- save/unsave post
- request a download
- update subscription or account status
- create notifications and update usage counters

## Direct client operations

- authenticated realtime reads permitted by Rules
- upload bytes to a path issued by an active upload session
- update non-sensitive profile presentation fields through a narrowly validated
  Function

## Messaging model

- There are no friend requests.
- A deterministic direct-message ID is derived from the two sorted UIDs.
- People previously contacted are derived from conversation membership.
- Either participant may block the other.
- Private direct messages support text, pictures and documents; voice notes are
  not supported.
- Unread counts and last-read timestamps are persisted per conversation member.

## Compatibility and migration

The current production schema uses flat `posts`, `messages`, `memberships`,
`blocks`, `entitlements`, `usage`, and `voiceUsage` collections. Migration runs
in three explicit phases:

1. Copy v1 data into v2 with deterministic IDs and verification reports.
2. Release the v2 frontend and Functions while retaining read-only v1 fallback.
3. After a rollback window, remove fallback reads and archive legacy data.

No production collection or Storage object is deleted automatically by the
migration.

