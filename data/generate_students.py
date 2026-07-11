import csv
import random
from datetime import datetime, timedelta
import names  # pip install names
import os

# Install required packages:
# pip install names

def generate_students_csv(num_students=1000, output_file='students_data.csv'):
    """Generate a CSV file with student data"""
    
    # Branch options
    branches = ['CSE', 'ECE', 'ME', 'EE', 'CE', 'IT', 'AE', 'CH']
    
    # Phone number prefixes
    phone_prefixes = ['987', '986', '985', '984', '981', '982', '983', '980', '979', '978']
    
    # Email domains
    email_domains = ['gmail.com', 'yahoo.com', 'outlook.com', 'student.edu', 'mail.com']
    
    # Generate dates for DOB (18-25 years old)
    def random_dob():
        start_date = datetime(2000, 1, 1)
        end_date = datetime(2008, 12, 31)
        days_between = (end_date - start_date).days
        random_days = random.randint(0, days_between)
        return start_date + timedelta(days=random_days)
    
    def random_phone():
        prefix = random.choice(phone_prefixes)
        suffix = ''.join(str(random.randint(0, 9)) for _ in range(7))
        return f"{prefix}{suffix}"
    
    def random_email(first_name, last_name):
        domain = random.choice(email_domains)
        return f"{first_name.lower()}.{last_name.lower()}@{domain}"
    
    def generate_roll_no(index):
        year = random.choice(['2020', '2021', '2022', '2023', '2024'])
        dept = random.choice(['CSE', 'ECE', 'ME', 'EE', 'CE'])
        return f"{year}{dept}{str(index + 1000).zfill(4)}"
    
    # Create headers
    headers = [
        'name', 
        'email', 
        'branch', 
        'phoneNo', 
        'dob', 
        'fatherName', 
        'motherName',
        'rollNo',
        'slotNumber'
    ]
    
    # Generate data
    students = []
    for i in range(num_students):
        first_name = names.get_first_name()
        last_name = names.get_last_name()
        full_name = f"{first_name} {last_name}"
        
        # Generate random gender for parent names
        gender = random.choice(['male', 'female'])
        father_name = names.get_first_name(gender='male') + ' ' + last_name
        mother_name = names.get_first_name(gender='female') + ' ' + last_name
        
        student = {
            'name': full_name,
            'email': random_email(first_name, last_name),
            'branch': random.choice(branches),
            'phoneNo': random_phone(),
            'dob': random_dob().strftime('%Y-%m-%d'),
            'fatherName': father_name,
            'motherName': mother_name,
            'rollNo': generate_roll_no(i),
            'slotNumber': random.choice([1, 2])
        }
        students.append(student)
    
    # Write to CSV
    with open(output_file, 'w', newline='', encoding='utf-8') as csvfile:
        writer = csv.DictWriter(csvfile, fieldnames=headers)
        writer.writeheader()
        writer.writerows(students)
    
    print(f"✅ Successfully generated {num_students} students in '{output_file}'")
    return output_file

if __name__ == "__main__":
    generate_students_csv(1000, 'students_data.csv')