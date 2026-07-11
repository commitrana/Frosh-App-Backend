const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
require('dotenv').config();

// Import Student model - from src/models/
const Student = require('../src/models/Student');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/society_management';

async function importStudents() {
  try {
    console.log('🔄 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    const students = [];
    // Try multiple possible paths for the CSV file
    let csvFilePath = path.join(__dirname, '..', 'data', 'students_data.csv');
    
    // If not found, try alternative locations
    if (!fs.existsSync(csvFilePath)) {
      csvFilePath = path.join(__dirname, '..', 'students_data.csv');
    }
    if (!fs.existsSync(csvFilePath)) {
      csvFilePath = path.join(__dirname, '..', '..', 'students_data.csv');
    }

    if (!fs.existsSync(csvFilePath)) {
      console.error(`❌ CSV file not found!`);
      console.error(`   Tried paths:`);
      console.error(`   - ${path.join(__dirname, '..', 'data', 'students_data.csv')}`);
      console.error(`   - ${path.join(__dirname, '..', 'students_data.csv')}`);
      console.error(`   - ${path.join(__dirname, '..', '..', 'students_data.csv')}`);
      console.error(`\n📁 Please place students_data.csv in one of these locations:`);
      console.error(`   - backend/data/students_data.csv`);
      console.error(`   - backend/students_data.csv`);
      process.exit(1);
    }

    console.log(`📖 Reading CSV file: ${csvFilePath}`);

    await new Promise((resolve, reject) => {
      fs.createReadStream(csvFilePath)
        .pipe(csv())
        .on('data', (row) => {
          const student = {
            name: row.name?.trim() || '',
            email: row.email?.trim() || '',
            branch: row.branch?.trim() || '',
            phoneNo: row.phoneNo?.trim() || '',
            dob: new Date(row.dob),
            fatherName: row.fatherName?.trim() || '',
            motherName: row.motherName?.trim() || '',
            rollNo: row.rollNo?.trim() || '',
            slotNumber: parseInt(row.slotNumber) || 1
          };
          
          if (student.name && student.email && student.rollNo) {
            students.push(student);
          }
        })
        .on('end', () => {
          console.log(`📊 Read ${students.length} valid students from CSV`);
          resolve();
        })
        .on('error', (error) => {
          reject(error);
        });
    });

    if (students.length === 0) {
      console.error('❌ No valid students found in CSV');
      console.error('   Make sure your CSV has these columns:');
      console.error('   name, email, branch, phoneNo, dob, fatherName, motherName, rollNo, slotNumber');
      process.exit(1);
    }

    // Clear existing students (optional - comment out if you want to keep existing data)
    const deleted = await Student.deleteMany({});
    console.log(`🗑️ Cleared ${deleted.deletedCount} existing students`);

    // Insert in batches
    const batchSize = 100;
    let imported = 0;

    for (let i = 0; i < students.length; i += batchSize) {
      const batch = students.slice(i, i + batchSize);
      try {
        const result = await Student.insertMany(batch, { ordered: false });
        imported += result.length;
        console.log(`✅ Imported ${imported}/${students.length} students`);
      } catch (error) {
        console.warn(`⚠️ Some entries failed in batch ${i/batchSize + 1}`);
        if (error.message) {
          console.warn(`   Error: ${error.message}`);
        }
      }
    }

    console.log(`\n🎉 Successfully imported ${imported} students!`);
    await mongoose.connection.close();
    console.log('👋 Disconnected from MongoDB');
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Error importing students:', error);
    if (mongoose.connection) {
      await mongoose.connection.close();
    }
    process.exit(1);
  }
}

importStudents();