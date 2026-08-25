# StudyLoop production security operations

Last reviewed: 2026-08-25

## Current enforced controls

- Firestore delete protection is enabled on `studyloop-01/(default)`.
- Firestore transactions and Rules enforce per-user limits: 20 messages/minute, 5 posts/minute, 15 comments/minute, 10 friend requests/hour, and 5 reports/hour.
- App Check is initialized when `VITE_FIREBASE_APPCHECK_SITE_KEY` is configured. Register the production domain with reCAPTCHA Enterprise, monitor metrics, then enable enforcement for Firestore and Storage in Firebase Console.
- Storage accepts JPEG, PNG, WebP, voice-note audio, PDF, Word, PowerPoint, Excel, and plain text. Video, SVG, HTML, and executable content are rejected.
- Android grants microphone capture only to `https://study-loop-one.vercel.app`, uses the system document picker, and routes downloads through Android DownloadManager.

## Required billable production controls

The project currently reports `freeTier: true`. Attach a Cloud Billing account before running these commands.

Enable seven-day point-in-time recovery:

```powershell
gcloud firestore databases update --database='(default)' --enable-pitr --project=studyloop-01
```

Create daily backups retained for 14 days:

```powershell
gcloud firestore backups schedules create --database='(default)' --retention=14d --recurrence=daily --project=studyloop-01
```

Verify both settings:

```powershell
gcloud firestore databases describe --database='(default)' --project=studyloop-01
gcloud firestore backups schedules list --database='(default)' --project=studyloop-01
```

## Malware scanning

MIME checks are not malware scanning. Before treating uploads as production-safe, deploy Google's Cloud Storage malware-scanning reference architecture using authenticated Cloud Run, Eventarc, separate unscanned/clean/quarantined buckets, and ClamAV. Configure the application bucket as the unscanned source and expose only objects moved to the clean bucket. Fail closed when scanning errors or times out. Alert on infected, ignored, and scan-failure metrics. Test with the harmless EICAR signature before launch.

Reference: https://cloud.google.com/architecture/automate-malware-scanning-for-documents-uploaded-to-cloud-storage/deployment

## IP limiting and abuse monitoring

Firestore Rules cannot see a caller's IP address. The per-user limits in Rules are active, but IP limits require routing content-creation calls through an App Check-protected HTTPS callable function or Cloud Run service. Put Cloud Armor in front of any public HTTP endpoint, hash IP addresses with a rotating secret, and retain only the minimum abuse window. Do not store raw IP addresses in user-facing collections.

Create Monitoring alerts for:

- spikes in denied Firestore/Storage requests;
- authentication failures and account-creation spikes;
- message, post, report, and upload volume anomalies;
- function or Cloud Run 429/5xx responses;
- malware detections and scan failures;
- Firestore, Storage, Functions, and Cloud Run spend.

Create a billing budget with email thresholds at 50%, 80%, 90%, and 100%, plus a Pub/Sub notification topic. A budget alerts on spend; it does not automatically cap charges.

## Incident response

1. Disable the affected account in Firebase Authentication and set `users/{uid}.deactivated=true`.
2. Preserve audit logs, message/post IDs, object paths, timestamps, and relevant rule-denial logs. Never copy passwords or ID tokens into tickets.
3. Block the compromised operation with Rules, App Check enforcement, or the server gateway.
4. Quarantine suspicious objects and revoke download tokens by deleting or replacing the object.
5. Determine affected users and data, rotate service credentials, and notify users where required.
6. Restore data into a separate database from PITR or a scheduled backup, validate it, then selectively recover documents.
7. Record root cause, detection gap, response timeline, and preventive actions.

## Account recovery

- Require verified email before enabling uploads, messaging, or paid features.
- Use Firebase password-reset links; never manually set or transmit passwords.
- Require MFA for administrators and keep admin authorization in custom claims.
- For ownership disputes, verify control of the registered email and review immutable audit evidence. Support staff must not change an account email based only on a username.

## Android signed-release checklist

1. Generate and securely back up a release keystore outside the repository.
2. Copy `android/keystore.properties.example` to `android/keystore.properties` and enter the real local values.
3. Build `gradle assembleRelease` from `android/` and verify the APK with `apksigner verify --verbose`.
4. Test on physical Android 8, 11, 13, and 15 devices: microphone allow/deny/retry, image and document selection, multi-select, downloads, external links, authentication after process restart, offline recovery, and back navigation.
5. Upload the release to Play Console internal testing and review Play Protect and pre-launch reports before distributing it.

Release keystores and passwords must never be committed or shared through chat.
