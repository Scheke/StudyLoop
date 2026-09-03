# StudyLoop v1 to v2 migration plan

## Safety rules

- The migration is additive and idempotent.
- It never deletes v1 documents or Storage objects.
- Every copied document records `legacySource` and `migratedAt`.
- A dry run reports conflicts and invalid records without writing.
- A live run uses deterministic destination IDs so it can be safely resumed.

## Mappings

| v1 source | v2 destination |
| --- | --- |
| `memberships/{uid}_{channelId}` | `channels/{channelId}/members/{uid}` |
| `posts/{postId}` | `channels/{channelId}/posts/{postId}` |
| `posts/{postId}/comments/{commentId}` | `channels/{channelId}/posts/{postId}/comments/{commentId}` |
| `messages/{messageId}` | `conversations/{conversationId}/messages/{messageId}` |
| `blocks/{blocker}_{blocked}` | `users/{blocker}/blocks/{blocked}` |
| `users/{uid}/saved/{postId}` | `users/{uid}/savedPosts/{postId}` |
| `entitlements/{uid}` | `users/{uid}/subscription/current` |

Legacy attachment URLs and paths are copied into attachment metadata first.
Objects are moved to canonical v2 paths only through a separate, resumable media
migration after document counts and access have been verified.

## Release gates

- Document counts match by entity and channel.
- Every migrated post/comment references an existing channel and author.
- Every direct conversation has exactly two unique members.
- Every attachment references an existing Storage object or is marked missing.
- Emulator authorization tests pass.
- Two-account testing confirms realtime visibility on separate devices.
- A rollback build and legacy read path remain available during the rollout.

