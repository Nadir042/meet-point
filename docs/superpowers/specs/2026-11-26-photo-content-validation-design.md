# Photo content validation design

## Problem

The photo upload endpoint currently accepts a file when its first bytes match the declared PNG, JPEG, or WebP MIME type. A truncated file containing only a valid signature is therefore stored as a photo, appears in the activity journal, and consumes one of the twelve photo slots.

## Scope

- Keep the existing Node.js and SQLite architecture.
- Add no runtime dependency.
- Reject structurally incomplete PNG, JPEG, and WebP payloads before starting the database transaction.
- Preserve the existing Base64, MIME allowlist, and 8 MB size checks.
- Do not change the upload request or response schema.

## Validation rules

The server will validate the decoded bytes according to the declared MIME type:

- PNG: require the PNG signature, a valid first `IHDR` chunk, at least one `IDAT` chunk, and a zero-length `IEND` chunk that ends the file. Every chunk length must stay within the buffer.
- JPEG: require the SOI marker, at least one standard start-of-frame marker (`C0`–`C3`, `C5`–`C7`, `C9`–`CB`, or `CD`–`CF`), a start-of-scan marker whose segment fits in the buffer, and an EOI marker after scan data. Marker segments must not extend beyond the buffer.
- WebP: require the `RIFF` and `WEBP` identifiers, require the RIFF size to match the complete payload, and require a bounded `VP8 ` or `VP8L` image chunk, or an extended `VP8X` container with a bounded animation frame.

These checks establish structural completeness for the reported format without adding a full image decoder. They are intended to reject truncated uploads and MIME disguises, not to verify every pixel or metadata field.

## Failure behavior

Invalid content returns HTTP 400 with the existing photo-format error response. Validation runs before `M.act`, the photo insert, and the activity update, so a rejected upload cannot add journal metadata, occupy a photo slot, or leave a blob in SQLite.

## Tests

- Replace the existing eight-byte PNG signature success fixture with a complete minimal image.
- Verify complete PNG, JPEG, and WebP fixtures are accepted.
- Verify signature-only and otherwise truncated payloads are rejected for all three formats.
- Verify content declared with the wrong MIME type is rejected.
- Verify a rejected upload leaves the photo list and database unchanged.
- Run `npm run check` and `npm test`.

## GitHub workflow

Create a defect issue describing the reproduction and acceptance criteria. Push the implementation branch and open a pull request against `main` whose body uses GitHub's `Fixes` keyword with that issue number.
