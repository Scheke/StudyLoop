# StudyLoop v2 authorization invariants

Every invariant must have at least one allow test and one deny test before v2 is
deployed.

## Accounts

- The caller must be authenticated, active and email verified for normal app
  operations.
- A user cannot alter plan, quota, role, verification, deactivation or usage
  fields.
- Administrative mutations require a server-verified `admin` custom claim.

## Channels

- A member document is the sole proof of channel membership.
- Only an owner can edit channel metadata.
- A member can modify only their own mute preference through a Function.
- Only a member can read posts, comments and non-public attachments.
- Only a member can create a post or comment.
- An owner can delete a channel only when no other members remain.

## Conversations

- Direct-message IDs are deterministic and contain exactly two participants.
- Only conversation members can read conversation state and messages.
- A sender identity is always taken from the verified Auth token.
- A blocked relationship prevents new messages in either direction.
- Users cannot add participants to an existing direct conversation.
- A message can be edited only by its sender within 30 minutes.
- A message can be deleted only by its sender before the recipient has read it.
- Private direct-message attachments cannot be audio or video.

## Content and attachments

- Post and comment authors are taken from the verified Auth token.
- Reply depth is limited to one.
- Attachments are immutable and must belong to an active server-issued upload
  session.
- Video, executable HTML and SVG are rejected.
- Declared size/type is checked before upload; actual size/signature is checked
  after upload.
- A record is not published until all attachments are marked ready.

## Plans and abuse controls

- Free: 100 MB stored, 30 successful document downloads per 24 hours, 7 saved
  posts and 10 voice notes per UTC day.
- Student+: 2 GB storage/download allowance per subscription period.
- Power: 4 GB storage/download allowance per subscription period.
- Maximum individual file size is 200 MB.
- Uploads may contain at most 10 images plus the configured document limit.
- Rate and quota counters are modified only by trusted Functions.
- Failed and cached downloads do not consume allowance.

