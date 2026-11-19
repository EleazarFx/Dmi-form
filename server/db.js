'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, 'applications.db');

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA foreign_keys = ON;');

db.exec(`
  CREATE TABLE IF NOT EXISTS applications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    application_number TEXT NOT NULL UNIQUE,
    programme_level TEXT NOT NULL,
    qualification_type TEXT,
    qualification_other TEXT,
    payment_plan TEXT,
    sponsor TEXT,
    additional_support TEXT,
    declaration_name TEXT NOT NULL,
    signature TEXT NOT NULL,
    declaration_date TEXT NOT NULL,
    passport_photo TEXT,
    status TEXT NOT NULL DEFAULT 'submitted',
    submitted_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS applicants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    application_id INTEGER NOT NULL UNIQUE REFERENCES applications(id) ON DELETE CASCADE,
    title TEXT,
    surname TEXT NOT NULL,
    first_name TEXT NOT NULL,
    initial TEXT,
    gender TEXT,
    date_of_birth TEXT,
    age INTEGER,
    marital_status TEXT,
    nationality TEXT,
    religion TEXT,
    home_district TEXT,
    traditional_authority TEXT,
    village TEXT,
    tribe TEXT,
    passport_nrc_number TEXT
  );

  CREATE TABLE IF NOT EXISTS next_of_kin (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    application_id INTEGER NOT NULL UNIQUE REFERENCES applications(id) ON DELETE CASCADE,
    title TEXT,
    surname TEXT NOT NULL,
    first_name TEXT NOT NULL,
    initial TEXT,
    address TEXT,
    email TEXT,
    mobile TEXT,
    occupation TEXT,
    organization TEXT,
    relationship TEXT
  );

  CREATE TABLE IF NOT EXISTS programme_choices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    application_id INTEGER NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
    choice_number INTEGER NOT NULL,
    programme TEXT,
    mode TEXT,
    campus TEXT,
    UNIQUE (application_id, choice_number)
  );

  CREATE TABLE IF NOT EXISTS previous_education (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    application_id INTEGER NOT NULL UNIQUE REFERENCES applications(id) ON DELETE CASCADE,
    attended_public_university TEXT,
    when_date TEXT,
    programme TEXT,
    institution TEXT,
    reason_for_leaving TEXT
  );

  CREATE TABLE IF NOT EXISTS qualifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    application_id INTEGER NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
    level TEXT NOT NULL,
    attempt INTEGER NOT NULL,
    year TEXT,
    qualification TEXT,
    certificate_number TEXT,
    school TEXT,
    centre_number TEXT,
    candidate_number TEXT,
    from_period TEXT,
    to_period TEXT,
    country TEXT,
    UNIQUE (application_id, level, attempt)
  );

  CREATE TABLE IF NOT EXISTS subjects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    application_id INTEGER NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
    level TEXT NOT NULL,
    attempt INTEGER NOT NULL,
    position INTEGER NOT NULL,
    subject TEXT NOT NULL,
    UNIQUE (application_id, level, attempt, position)
  );

  CREATE TABLE IF NOT EXISTS special_needs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    application_id INTEGER NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
    need TEXT NOT NULL,
    UNIQUE (application_id, need)
  );

  CREATE TABLE IF NOT EXISTS checklist_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    application_id INTEGER NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
    item TEXT NOT NULL,
    UNIQUE (application_id, item)
  );

  CREATE INDEX IF NOT EXISTS idx_applications_number ON applications(application_number);
  CREATE INDEX IF NOT EXISTS idx_applicants_name ON applicants(surname, first_name);
`);

/** Convert empty client values to SQL NULL. */
function nv(value) {
  return value === '' || value === undefined || value === null ? null : value;
}

function nextApplicationNumber() {
  const year = new Date().getFullYear();
  const { next } = db.prepare('SELECT COALESCE(MAX(id), 0) + 1 AS next FROM applications').get();
  return `DMI-${year}-${String(next).padStart(5, '0')}`;
}

/** Store a complete, already validated application in one transaction. */
function saveApplication(value, photoUrl) {
  const applicationNumber = nextApplicationNumber();

  db.exec('BEGIN');
  try {
    const insert = (sql, ...params) => db.prepare(sql).run(...params.map(nv));

    const result = insert(
      `INSERT INTO applications
        (application_number, programme_level, qualification_type, qualification_other,
         payment_plan, sponsor, additional_support, declaration_name, signature,
         declaration_date, passport_photo)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      applicationNumber,
      value.programmeLevel,
      value.qualificationType,
      value.qualificationOther,
      value.paymentPlan,
      value.sponsor,
      value.additionalSupport,
      value.declarationName,
      value.signature,
      value.declarationDate,
      photoUrl
    );
    const applicationId = Number(result.lastInsertRowid);

    const a = value.applicant;
    insert(
      `INSERT INTO applicants
        (application_id, title, surname, first_name, initial, gender, date_of_birth, age,
         marital_status, nationality, religion, home_district, traditional_authority,
         village, tribe, passport_nrc_number)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      applicationId, a.title, a.surname, a.firstName, a.initial, a.gender, a.dateOfBirth,
      a.age ? Number(a.age) : null, a.maritalStatus, a.nationality, a.religion,
      a.homeDistrict, a.traditionalAuthority, a.village, a.tribe, a.passportNrcNumber
    );

    const k = value.kin;
    insert(
      `INSERT INTO next_of_kin
        (application_id, title, surname, first_name, initial, address, email, mobile,
         occupation, organization, relationship)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      applicationId, k.title, k.surname, k.firstName, k.initial, k.address, k.email,
      k.mobile, k.occupation, k.organization, k.relationship
    );

    for (const choice of value.choices) {
      if (!choice.programme && !choice.mode && !choice.campus) continue;
      insert(
        `INSERT INTO programme_choices (application_id, choice_number, programme, mode, campus)
         VALUES (?, ?, ?, ?, ?)`,
        applicationId, choice.choiceNumber, choice.programme, choice.mode, choice.campus
      );
    }

    const p = value.previousEducation;
    insert(
      `INSERT INTO previous_education
        (application_id, attended_public_university, when_date, programme, institution, reason_for_leaving)
       VALUES (?, ?, ?, ?, ?, ?)`,
      applicationId, p.attendedPublicUniversity, p.whenDate, p.programme, p.institution, p.reasonForLeaving
    );

    for (const q of value.qualifications) {
      insert(
        `INSERT INTO qualifications
          (application_id, level, attempt, year, qualification, certificate_number, school,
           centre_number, candidate_number, from_period, to_period, country)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        applicationId, q.level, q.attempt, q.year, q.qualification, q.certificateNumber,
        q.school, q.centreNumber, q.candidateNumber, q.fromPeriod, q.toPeriod, q.country
      );
    }

    for (const s of value.subjects) {
      insert(
        `INSERT INTO subjects (application_id, level, attempt, position, subject)
         VALUES (?, ?, ?, ?, ?)`,
        applicationId, s.level, s.attempt, s.position, s.subject
      );
    }

    for (const need of value.specialNeeds) {
      insert('INSERT INTO special_needs (application_id, need) VALUES (?, ?)', applicationId, need);
    }

    for (const item of value.checklist) {
      insert('INSERT INTO checklist_items (application_id, item) VALUES (?, ?)', applicationId, item);
    }

    db.exec('COMMIT');
    return applicationNumber;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

function listApplications() {
  return db.prepare(
    `SELECT a.application_number AS applicationNumber, a.programme_level AS programmeLevel,
            a.submitted_at AS submittedAt, a.status,
            ap.surname, ap.first_name AS firstName
     FROM applications a
     JOIN applicants ap ON ap.application_id = a.id
     ORDER BY a.id DESC`
  ).all();
}

function getApplication(applicationNumber) {
  const application = db.prepare(
    `SELECT application_number AS applicationNumber, programme_level AS programmeLevel,
            qualification_type AS qualificationType, qualification_other AS qualificationOther,
            payment_plan AS paymentPlan, sponsor, additional_support AS additionalSupport,
            declaration_name AS declarationName, signature, declaration_date AS declarationDate,
            passport_photo AS passportPhoto, status, submitted_at AS submittedAt
     FROM applications WHERE application_number = ?`
  ).get(applicationNumber);

  if (!application) return null;

  const rows = (sql) => db.prepare(sql).all(applicationNumber);
  application.applicant = db.prepare('SELECT * FROM applicants WHERE application_id = (SELECT id FROM applications WHERE application_number = ?)').get(applicationNumber);
  application.nextOfKin = db.prepare('SELECT * FROM next_of_kin WHERE application_id = (SELECT id FROM applications WHERE application_number = ?)').get(applicationNumber);
  application.previousEducation = db.prepare('SELECT * FROM previous_education WHERE application_id = (SELECT id FROM applications WHERE application_number = ?)').get(applicationNumber);
  application.programmeChoices = rows('SELECT choice_number AS choiceNumber, programme, mode, campus FROM programme_choices WHERE application_id = (SELECT id FROM applications WHERE application_number = ?) ORDER BY choice_number');
  application.qualifications = rows('SELECT * FROM qualifications WHERE application_id = (SELECT id FROM applications WHERE application_number = ?) ORDER BY level, attempt');
  application.subjects = rows('SELECT level, attempt, position, subject FROM subjects WHERE application_id = (SELECT id FROM applications WHERE application_number = ?) ORDER BY level, attempt, position');
  application.specialNeeds = rows('SELECT need FROM special_needs WHERE application_id = (SELECT id FROM applications WHERE application_number = ?) ORDER BY need');
  application.checklist = rows('SELECT item FROM checklist_items WHERE application_id = (SELECT id FROM applications WHERE application_number = ?) ORDER BY item');
  return application;
}

module.exports = { saveApplication, listApplications, getApplication, DB_PATH };
