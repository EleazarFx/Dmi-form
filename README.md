# DMI Application Form — Frontend + Backend

The original HTML/CSS application form is now served by a Node.js/Express server.
Submissions are validated **on the server**, stored in a **SQLite** database, and
the passport photo is saved to disk.

## Requirements

- Node.js 22.5 or newer (the project uses the built-in `node:sqlite` module, so no
  native SQLite package needs to be compiled).
- npm

## Run it

```bash
npm install
npm start
```

Open <http://localhost:3000>. For automatic restarts while developing, use
`npm run dev`.

The port can be changed with `PORT=4000 npm start` and the database location with
`DB_PATH`.

## What changed

- `index.html` now posts to `/api/applications` as `multipart/form-data`, loads
  `js/app.js`, and gives explicit `value`s to radio buttons (mode, campus,
  qualification type). The 60 subject inputs now have names so their data is
  submitted.
- `js/app.js` sends the form with `fetch`, displays the server's field errors next
  to each control, and shows the generated application number on success. The
  server remains the source of truth: browser checks are only feedback.
- `css/style.css` has styles for status messages and validation errors.

## API

| Method | Endpoint                   | Purpose                                              |
| ------ | -------------------------- | ---------------------------------------------------- |
| GET    | `/`                        | The application form                                 |
| GET    | `/api/health`              | Simple health check                                  |
| POST   | `/api/applications`        | Validate and save an application (multipart form)     |
| GET    | `/api/applications`        | List submitted applications (summary)                |
| GET    | `/api/applications/:number`| Full details for one application                     |

Success response (201):

```json
{ "ok": true, "applicationNumber": "DMI-2026-00001", "message": "Your application has been received." }
```

Validation failure (400):

```json
{
  "ok": false,
  "message": "Please correct the highlighted fields and submit again.",
  "errors": { "surname": "Surname is required.", "kin-email": "Enter a valid email address." }
}
```

## Server-side validation

`server/validation.js` checks, among other things:

- programme level, title, gender, marital status, mode, campus, programme name,
  qualification type, special needs and checklist values against allowed lists;
- required personal, next-of-kin, programme, financial, declaration and checklist
  fields, including all three checklist confirmations;
- real ISO dates, no future dates of birth or declaration dates, and an age that
  agrees with the date of birth;
- email format, phone format, and duplicate programme choices;
- conditional requirements — "Yes" in the previous-university section requires
  its details, "Other" qualification and "Other" disability need an explanation,
  extra special-needs options cannot be combined with "No Disability";
- at least one complete examination attempt for the selected qualification level;
- a JPG/PNG/WebP passport photo no larger than 5 MB.

The client-supplied application number is ignored; the server generates a unique
number such as `DMI-2026-00001`.

## Database

The database is created automatically at `data/applications.db`. Tables:

`applications`, `applicants`, `next_of_kin`, `programme_choices`,
`previous_education`, `qualifications`, `subjects`, `special_needs`,
`checklist_items`.

All inserts for one application happen in a single transaction, and foreign keys
are enabled. Photos are stored in `uploads/` and referenced by URL in the
`applications.passport_photo` column. Both `data/` and `uploads/` are ignored by
Git.

> The read endpoints have no authentication. That is fine for a classroom demo,
> but an authentication layer should be added before using real student data.
