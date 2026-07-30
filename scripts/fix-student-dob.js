// One-time repair for students imported before the DD-MM-YYYY parsing fix.
//
// Background: the CSV import route used to do `new Date(dobString)` on a
// "DD-MM-YYYY" value. For any row where the day was <= 12, JS silently
// swapped day and month instead of erroring (e.g. "07-05-2007", meant as
// 7 May 2007, got stored as 5 July 2007) — no error, no warning.
//
// This script re-reads the original CSV, matches each row to its student
// by email (falling back to rollNo), recomputes the correct DD-MM-YYYY
// date, and updates the DB only where the stored dob doesn't match.
//
// Usage:
//   node scripts/fix-student-dob.js /path/to/students_data.csv
//   node scripts/fix-student-dob.js /path/to/students_data.csv --dry-run   (preview only, no writes)

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config();

function parseDDMMYYYY(value) {
  if (!value) return null;
  const match = String(value).trim().match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (!match) return null;
  const [, day, month, year] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (date.getUTCMonth() !== Number(month) - 1) return null; // e.g. Feb 31 rolling over
  return date;
}

// Minimal CSV line parser — same approach as the frontend's, handles quoted fields.
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

function sameDate(a, b) {
  if (!a || !b) return false;
  return new Date(a).toISOString().slice(0, 10) === new Date(b).toISOString().slice(0, 10);
}

async function run() {
  const csvPath = process.argv[2];
  const dryRun = process.argv.includes('--dry-run');

  if (!csvPath) {
    console.error('Usage: node scripts/fix-student-dob.js /path/to/students_data.csv [--dry-run]');
    process.exit(1);
  }

  const text = fs.readFileSync(path.resolve(csvPath), 'utf8');
  const lines = text.split('\n').filter(l => l.trim());
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase());

  const rows = lines.slice(1).map(line => {
    const values = parseCSVLine(line);
    const row = {};
    headers.forEach((h, i) => { row[h] = values[i]; });
    return row;
  });

  await mongoose.connect(process.env.MONGODB_URI);
  const Student = require('../src/models/Student');

  let checked = 0, fixed = 0, notFound = 0, alreadyCorrect = 0, badCsvDate = 0;

  for (const row of rows) {
    const email = row.email?.trim().toLowerCase();
    const rollNo = row.rollno?.trim();
    const correctDob = parseDDMMYYYY(row.dob);
    checked++;

    if (!correctDob) {
      badCsvDate++;
      console.log(`⚠️  Skipping — unparseable dob "${row.dob}" for ${email || rollNo}`);
      continue;
    }

    const student = await Student.findOne({
      $or: [...(email ? [{ email }] : []), ...(rollNo ? [{ rollNo }] : [])]
    });

    if (!student) { notFound++; continue; }

    if (sameDate(student.dob, correctDob)) {
      alreadyCorrect++;
      continue;
    }

    console.log(
      `🔧 ${student.email}: ${student.dob?.toISOString().slice(0, 10)} -> ${correctDob.toISOString().slice(0, 10)}`
    );
    fixed++;
    if (!dryRun) {
      student.dob = correctDob;
      await student.save();
    }
  }

  console.log('\n--- Summary ---');
  console.log(`Rows checked:      ${checked}`);
  console.log(`Already correct:   ${alreadyCorrect}`);
  console.log(`Fixed:             ${fixed}${dryRun ? ' (dry run — no writes made)' : ''}`);
  console.log(`Not found in DB:   ${notFound}`);
  console.log(`Bad dob in CSV:    ${badCsvDate}`);

  await mongoose.disconnect();
}

run().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
