/**
 * Healthcare DID PoC - Database Models
 * 
 * SQLite database schema for persistent storage of patients, consents, and access logs.
 */

class Database {
    constructor(db) {
        this.db = db;
        this.initializeTables();
        this.seedDemoData();
    }

    initializeTables() {
        this.db.exec(`
            -- Patients table
            CREATE TABLE IF NOT EXISTS patients (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                nik TEXT UNIQUE NOT NULL,
                did TEXT UNIQUE,
                name TEXT NOT NULL,
                birth_date TEXT,
                blood_type TEXT,
                allergies TEXT,
                phone TEXT,
                address TEXT,
                emergency_data TEXT,
                status TEXT DEFAULT 'active',
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            );
            
            -- Hospitals/Healthcare facilities table
            CREATE TABLE IF NOT EXISTS hospitals (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                code TEXT UNIQUE NOT NULL,
                name TEXT NOT NULL,
                type TEXT,
                address TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            );
            
            -- Staff/Medical personnel table
            CREATE TABLE IF NOT EXISTS staff (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                hospital_id INTEGER,
                staff_id TEXT UNIQUE NOT NULL,
                name TEXT NOT NULL,
                role TEXT,
                department TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (hospital_id) REFERENCES hospitals(id)
            );
            
            -- Consents table
            CREATE TABLE IF NOT EXISTS consents (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                consent_id TEXT UNIQUE NOT NULL,
                patient_id INTEGER NOT NULL,
                hospital_id INTEGER NOT NULL,
                staff_id INTEGER,
                data_types TEXT NOT NULL,
                purpose TEXT,
                granted_at TEXT NOT NULL,
                expires_at TEXT,
                status TEXT DEFAULT 'active',
                revoked_at TEXT,
                tx_hash TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (patient_id) REFERENCES patients(id),
                FOREIGN KEY (hospital_id) REFERENCES hospitals(id),
                FOREIGN KEY (staff_id) REFERENCES staff(id)
            );
            
            -- Access logs (immutable audit trail)
            CREATE TABLE IF NOT EXISTS access_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                log_id TEXT UNIQUE NOT NULL,
                patient_id INTEGER,
                patient_identifier TEXT,
                hospital_id INTEGER,
                staff_id INTEGER,
                access_type TEXT NOT NULL,
                data_accessed TEXT,
                reason TEXT,
                is_emergency INTEGER DEFAULT 0,
                consent_id TEXT,
                tx_hash TEXT,
                ip_address TEXT,
                user_agent TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (patient_id) REFERENCES patients(id),
                FOREIGN KEY (hospital_id) REFERENCES hospitals(id),
                FOREIGN KEY (staff_id) REFERENCES staff(id)
            );
            
            -- Temporary IDs for unknown patients
            CREATE TABLE IF NOT EXISTS temp_patients (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                temp_id TEXT UNIQUE NOT NULL,
                physical_description TEXT,
                found_location TEXT,
                found_condition TEXT,
                estimated_age TEXT,
                gender TEXT,
                linked_patient_id INTEGER,
                linked_at TEXT,
                linked_by TEXT,
                status TEXT DEFAULT 'unidentified',
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (linked_patient_id) REFERENCES patients(id)
            );
            
            -- OTP verification codes
            CREATE TABLE IF NOT EXISTS otp_codes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                patient_id INTEGER NOT NULL,
                code TEXT NOT NULL,
                purpose TEXT,
                request_id TEXT,
                expires_at TEXT NOT NULL,
                verified INTEGER DEFAULT 0,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (patient_id) REFERENCES patients(id)
            );
            
            -- Create indexes
            CREATE INDEX IF NOT EXISTS idx_patients_nik ON patients(nik);
            CREATE INDEX IF NOT EXISTS idx_patients_did ON patients(did);
            CREATE INDEX IF NOT EXISTS idx_consents_patient ON consents(patient_id);
            CREATE INDEX IF NOT EXISTS idx_consents_status ON consents(status);
            CREATE INDEX IF NOT EXISTS idx_access_logs_patient ON access_logs(patient_id);
            CREATE INDEX IF NOT EXISTS idx_temp_patients_status ON temp_patients(status);
        `);

        console.log('✓ Database tables initialized');
    }

    seedDemoData() {
        // Check if already seeded
        const existing = this.db.prepare('SELECT COUNT(*) as count FROM hospitals').get();
        if (existing.count > 0) return;

        // Seed hospitals
        const hospitals = [
            { code: 'RS001', name: 'RSUP Dr. Cipto Mangunkusumo', type: 'Tipe A', address: 'Jakarta Pusat' },
            { code: 'RS002', name: 'RS Pondok Indah', type: 'Tipe B', address: 'Jakarta Selatan' },
            { code: 'RS003', name: 'RSUD Tangerang', type: 'Tipe B', address: 'Tangerang' },
            { code: 'PKM001', name: 'Puskesmas Menteng', type: 'Puskesmas', address: 'Jakarta Pusat' }
        ];

        const insertHospital = this.db.prepare(`
            INSERT INTO hospitals (code, name, type, address) 
            VALUES (@code, @name, @type, @address)
        `);

        for (const h of hospitals) {
            insertHospital.run(h);
        }

        // Seed staff
        const staffMembers = [
            { hospital_id: 1, staff_id: 'DR001', name: 'Dr. Ahmad Wijaya', role: 'Dokter', department: 'IGD' },
            { hospital_id: 1, staff_id: 'DR002', name: 'Dr. Siti Rahayu', role: 'Dokter', department: 'Penyakit Dalam' },
            { hospital_id: 1, staff_id: 'NS001', name: 'Ns. Budi Santoso', role: 'Perawat', department: 'IGD' },
            { hospital_id: 2, staff_id: 'DR003', name: 'Dr. Andi Pratama', role: 'Dokter', department: 'Bedah' }
        ];

        const insertStaff = this.db.prepare(`
            INSERT INTO staff (hospital_id, staff_id, name, role, department) 
            VALUES (@hospital_id, @staff_id, @name, @role, @department)
        `);

        for (const s of staffMembers) {
            insertStaff.run(s);
        }

        // Seed demo patients
        const patients = [
            {
                nik: '3201234567890001',
                name: 'Budi Santoso',
                birth_date: '1985-05-15',
                blood_type: 'O+',
                allergies: 'Penisilin',
                phone: '081234567890',
                address: 'Jl. Sudirman No. 123, Jakarta'
            },
            {
                nik: '3201234567890002',
                name: 'Siti Aminah',
                birth_date: '1990-08-22',
                blood_type: 'A+',
                allergies: 'Tidak ada',
                phone: '081234567891',
                address: 'Jl. Gatot Subroto No. 45, Jakarta'
            },
            {
                nik: '3201234567890003',
                name: 'Ahmad Hidayat',
                birth_date: '1978-12-03',
                blood_type: 'B+',
                allergies: 'Sulfa, Seafood',
                phone: '081234567892',
                address: 'Jl. Thamrin No. 88, Jakarta'
            }
        ];

        const insertPatient = this.db.prepare(`
            INSERT INTO patients (nik, name, birth_date, blood_type, allergies, phone, address) 
            VALUES (@nik, @name, @birth_date, @blood_type, @allergies, @phone, @address)
        `);

        for (const p of patients) {
            insertPatient.run(p);
        }

        console.log('✓ Demo data seeded');
    }

    // Patient methods
    findPatientByNIK(nik) {
        return this.db.prepare('SELECT * FROM patients WHERE nik = ?').get(nik);
    }

    findPatientByDID(did) {
        return this.db.prepare('SELECT * FROM patients WHERE did = ?').get(did);
    }

    registerPatient(data) {
        const stmt = this.db.prepare(`
            INSERT INTO patients (nik, did, name, birth_date, blood_type, allergies, phone, address)
            VALUES (@nik, @did, @name, @birth_date, @blood_type, @allergies, @phone, @address)
        `);
        return stmt.run(data);
    }

    updatePatientDID(nik, did) {
        return this.db.prepare('UPDATE patients SET did = ?, updated_at = CURRENT_TIMESTAMP WHERE nik = ?').run(did, nik);
    }

    // Consent methods
    createConsent(data) {
        const stmt = this.db.prepare(`
            INSERT INTO consents (consent_id, patient_id, hospital_id, staff_id, data_types, purpose, granted_at, expires_at, tx_hash)
            VALUES (@consent_id, @patient_id, @hospital_id, @staff_id, @data_types, @purpose, @granted_at, @expires_at, @tx_hash)
        `);
        return stmt.run(data);
    }

    getPatientConsents(patientId) {
        return this.db.prepare(`
            SELECT c.*, h.name as hospital_name 
            FROM consents c 
            JOIN hospitals h ON c.hospital_id = h.id 
            WHERE c.patient_id = ? AND c.status = 'active'
            ORDER BY c.granted_at DESC
        `).all(patientId);
    }

    revokeConsent(consentId) {
        return this.db.prepare(`
            UPDATE consents SET status = 'revoked', revoked_at = CURRENT_TIMESTAMP 
            WHERE consent_id = ?
        `).run(consentId);
    }

    // Access log methods
    logAccess(data) {
        const stmt = this.db.prepare(`
            INSERT INTO access_logs (log_id, patient_id, patient_identifier, hospital_id, staff_id, access_type, data_accessed, reason, is_emergency, consent_id, tx_hash)
            VALUES (@log_id, @patient_id, @patient_identifier, @hospital_id, @staff_id, @access_type, @data_accessed, @reason, @is_emergency, @consent_id, @tx_hash)
        `);
        return stmt.run(data);
    }

    getPatientAccessLogs(patientId) {
        return this.db.prepare(`
            SELECT al.*, h.name as hospital_name, s.name as staff_name
            FROM access_logs al
            LEFT JOIN hospitals h ON al.hospital_id = h.id
            LEFT JOIN staff s ON al.staff_id = s.id
            WHERE al.patient_id = ?
            ORDER BY al.created_at DESC
        `).all(patientId);
    }

    // Temp patient methods
    createTempPatient(data) {
        const stmt = this.db.prepare(`
            INSERT INTO temp_patients (temp_id, physical_description, found_location, found_condition, estimated_age, gender)
            VALUES (@temp_id, @physical_description, @found_location, @found_condition, @estimated_age, @gender)
        `);
        return stmt.run(data);
    }

    linkTempToPatient(tempId, patientId, linkedBy) {
        return this.db.prepare(`
            UPDATE temp_patients 
            SET linked_patient_id = ?, linked_at = CURRENT_TIMESTAMP, linked_by = ?, status = 'identified'
            WHERE temp_id = ?
        `).run(patientId, linkedBy, tempId);
    }

    getUnidentifiedPatients() {
        return this.db.prepare(`
            SELECT * FROM temp_patients WHERE status = 'unidentified' ORDER BY created_at DESC
        `).all();
    }

    // OTP methods
    createOTP(patientId, code, purpose, requestId, expiresAt) {
        return this.db.prepare(`
            INSERT INTO otp_codes (patient_id, code, purpose, request_id, expires_at)
            VALUES (?, ?, ?, ?, ?)
        `).run(patientId, code, purpose, requestId, expiresAt);
    }

    verifyOTP(requestId, code) {
        const otp = this.db.prepare(`
            SELECT * FROM otp_codes 
            WHERE request_id = ? AND code = ? AND verified = 0 AND expires_at > datetime('now')
            ORDER BY created_at DESC LIMIT 1
        `).get(requestId, code);

        if (otp) {
            this.db.prepare('UPDATE otp_codes SET verified = 1 WHERE id = ?').run(otp.id);
            return true;
        }
        return false;
    }

    // Hospital/Staff methods
    getHospitals() {
        return this.db.prepare('SELECT * FROM hospitals').all();
    }

    getStaffByHospital(hospitalId) {
        return this.db.prepare('SELECT * FROM staff WHERE hospital_id = ?').all(hospitalId);
    }

    findStaffById(staffId) {
        return this.db.prepare('SELECT * FROM staff WHERE staff_id = ?').get(staffId);
    }
}

module.exports = Database;
