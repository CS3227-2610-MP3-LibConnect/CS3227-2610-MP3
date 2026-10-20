# Developer Guide

## Manager librarian-account management

This feature adapts the MP2 librarian-account vocabulary, active/inactive
account behavior, manager-facing status wording, and relevant edge cases. The
MP2 Java domain and service behavior were rewritten as TypeScript Express
routes and Firestore-backed account operations. The MP2 file repository was not
copied: status changes use a Firestore transaction, and authorization uses the
server-loaded authenticated actor.

The React manager view replaces the MP2 JavaFX confirmation flow. MP3-specific
behavior includes server-controlled `isManager`, concurrent last-active-manager
protection, session revocation after deactivation, Origin validation, and safe
responses that omit password hashes and session data.

The deployment bootstrap and emergency recovery procedure for the first manager
must be documented before production deployment; no public route grants manager
privileges or bypasses the last-manager invariant.
