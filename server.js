/**
 * MedChain Indonesia - Healthcare DID PoC Server
 * 
 * File-based blockchain implementation (like mini Ethereum node)
 * Ready for production upgrade to: ETH L2 (Polygon/Arbitrum) or Hyperledger Fabric
 */

const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

// ============================================
// FILE-BASED BLOCKCHAIN
// ============================================

class FileBasedBlockchain {
    constructor(dataDir = './blockchain-data') {
        this.dataDir = dataDir;
        this.blocksDir = path.join(dataDir, 'blocks');
        this.stateFile = path.join(dataDir, 'state.json');
        this.txDir = path.join(dataDir, 'transactions');

        // Create directories
        [this.dataDir, this.blocksDir, this.txDir].forEach(dir => {
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        });

        // Load or init state
        if (fs.existsSync(this.stateFile)) {
            this.state = JSON.parse(fs.readFileSync(this.stateFile, 'utf8'));
            console.log(`✓ Loaded blockchain: ${this.state.blockHeight + 1} blocks`);
        } else {
            this.state = {
                blockHeight: -1,
                latestHash: '0'.repeat(64),
                totalTx: 0,
                chainId: 'medchain-local-001',
                genesis: new Date().toISOString()
            };
            this.createGenesisBlock();
        }
    }

    saveState() {
        fs.writeFileSync(this.stateFile, JSON.stringify(this.state, null, 2));
    }

    sha256(data) {
        return crypto.createHash('sha256').update(data).digest('hex');
    }

    calculateBlockHash(block) {
        return this.sha256(`${block.number}|${block.timestamp}|${block.prevHash}|${block.merkleRoot}|${block.nonce}`);
    }

    calculateMerkleRoot(txs) {
        if (!txs || txs.length === 0) return this.sha256('empty');
        let hashes = txs.map(tx => this.sha256(JSON.stringify(tx)));
        while (hashes.length > 1) {
            const next = [];
            for (let i = 0; i < hashes.length; i += 2) {
                next.push(this.sha256(hashes[i] + (hashes[i + 1] || hashes[i])));
            }
            hashes = next;
        }
        return hashes[0];
    }

    createGenesisBlock() {
        const tx = {
            type: 'GENESIS',
            data: { message: 'MedChain Indonesia Genesis', version: '1.0.0' },
            timestamp: this.state.genesis,
            hash: this.sha256('genesis-' + Date.now())
        };

        const block = {
            number: 0,
            timestamp: this.state.genesis,
            prevHash: '0'.repeat(64),
            transactions: [tx],
            nonce: 0
        };
        block.merkleRoot = this.calculateMerkleRoot(block.transactions);
        block.hash = this.calculateBlockHash(block);

        this.saveBlock(block);
        this.state.blockHeight = 0;
        this.state.latestHash = block.hash;
        this.state.totalTx = 1;
        this.saveState();
        console.log('✓ Genesis block created:', block.hash.substring(0, 16) + '...');
    }

    getBlockPath(num) {
        return path.join(this.blocksDir, `block-${num.toString().padStart(8, '0')}.json`);
    }

    saveBlock(block) {
        fs.writeFileSync(this.getBlockPath(block.number), JSON.stringify(block, null, 2));
        block.transactions.forEach(tx => {
            fs.writeFileSync(path.join(this.txDir, `${tx.hash}.json`), JSON.stringify({ ...tx, block: block.number }, null, 2));
        });
    }

    getBlock(num) {
        const p = this.getBlockPath(num);
        return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null;
    }

    getLatestBlock() {
        return this.getBlock(this.state.blockHeight);
    }

    addTransaction(type, data) {
        const timestamp = new Date().toISOString();
        const tx = {
            type,
            data,
            timestamp,
            nonce: Date.now(),
            hash: this.sha256(JSON.stringify({ type, data, timestamp, nonce: Date.now() }))
        };

        const prev = this.getLatestBlock();
        const block = {
            number: prev.number + 1,
            timestamp,
            prevHash: prev.hash,
            transactions: [tx],
            nonce: 0
        };
        block.merkleRoot = this.calculateMerkleRoot(block.transactions);
        block.hash = this.calculateBlockHash(block);

        this.saveBlock(block);
        this.state.blockHeight = block.number;
        this.state.latestHash = block.hash;
        this.state.totalTx++;
        this.saveState();

        console.log(`⛓️ Block #${block.number}: ${tx.type} → ${block.hash.substring(0, 12)}...`);
        return { txHash: tx.hash, blockNumber: block.number, blockHash: block.hash, timestamp };
    }

    validateChain() {
        for (let i = 1; i <= this.state.blockHeight; i++) {
            const curr = this.getBlock(i);
            const prev = this.getBlock(i - 1);
            if (!curr || !prev) return { valid: false, error: `Missing block ${i}` };
            if (curr.prevHash !== prev.hash) return { valid: false, error: `Chain broken at ${i}` };
            if (this.calculateBlockHash(curr) !== curr.hash) return { valid: false, error: `Tampered block ${i}` };
        }
        return { valid: true, blocksVerified: this.state.blockHeight + 1 };
    }

    getStats() {
        const validation = this.validateChain();
        return {
            chainId: this.state.chainId,
            totalBlocks: this.state.blockHeight + 1,
            totalTransactions: this.state.totalTx,
            latestBlockHash: this.state.latestHash,
            ...validation
        };
    }

    getRecentTransactions(limit = 20) {
        const txs = [];
        for (let i = this.state.blockHeight; i >= 0 && txs.length < limit; i--) {
            const block = this.getBlock(i);
            if (block) block.transactions.forEach(tx => txs.push({ ...tx, blockNumber: block.number }));
        }
        return txs.slice(0, limit);
    }
}

// ============================================
// DATABASE (JSON-based)
// ============================================

class JSONDatabase {
    constructor(dataDir = './db-data') {
        this.dataDir = dataDir;
        this.files = {
            patients: path.join(dataDir, 'patients.json'),
            hospitals: path.join(dataDir, 'hospitals.json'),
            staff: path.join(dataDir, 'staff.json'),
            consents: path.join(dataDir, 'consents.json'),
            accessLogs: path.join(dataDir, 'access-logs.json'),
            tempPatients: path.join(dataDir, 'temp-patients.json'),
            otpCodes: path.join(dataDir, 'otp-codes.json')
        };

        if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
        this.load();
    }

    load() {
        this.data = {};
        Object.entries(this.files).forEach(([key, file]) => {
            this.data[key] = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : [];
        });

        if (this.data.hospitals.length === 0) this.seedData();
    }

    save(key) {
        fs.writeFileSync(this.files[key], JSON.stringify(this.data[key], null, 2));
    }

    saveAll() {
        Object.keys(this.files).forEach(key => this.save(key));
    }

    seedData() {
        this.data.hospitals = [
            { id: 1, code: 'RS001', name: 'RSUP Dr. Cipto Mangunkusumo', type: 'Tipe A' },
            { id: 2, code: 'RS002', name: 'RS Pondok Indah', type: 'Tipe B' },
            { id: 3, code: 'PKM001', name: 'Puskesmas Menteng', type: 'Puskesmas' }
        ];
        this.data.staff = [
            { id: 1, hospitalId: 1, staffId: 'DR001', name: 'Dr. Ahmad Wijaya', role: 'Dokter' },
            { id: 2, hospitalId: 1, staffId: 'DR002', name: 'Dr. Siti Rahayu', role: 'Dokter' },
            { id: 3, hospitalId: 1, staffId: 'NS001', name: 'Ns. Budi Santoso', role: 'Perawat' }
        ];
        this.data.patients = [
            { id: 1, nik: '3201234567890001', name: 'Budi Santoso', birthDate: '1985-05-15', bloodType: 'O+', allergies: 'Penisilin', phone: '081234567890' },
            { id: 2, nik: '3201234567890002', name: 'Siti Aminah', birthDate: '1990-08-22', bloodType: 'A+', allergies: '', phone: '081234567891' }
        ];
        this.saveAll();
        console.log('✓ Demo data seeded');
    }

    findPatientByNIK(nik) {
        return this.data.patients.find(p => p.nik === nik);
    }

    findPatientById(id) {
        return this.data.patients.find(p => p.id === id);
    }

    registerPatient(data) {
        const id = this.data.patients.length + 1;
        const patient = { id, ...data, createdAt: new Date().toISOString() };
        this.data.patients.push(patient);
        this.save('patients');
        return patient;
    }

    updatePatientDID(nik, did) {
        const p = this.findPatientByNIK(nik);
        if (p) { p.did = did; this.save('patients'); }
    }

    createConsent(data) {
        this.data.consents.push(data);
        this.save('consents');
    }

    getPatientConsents(patientId) {
        return this.data.consents.filter(c => c.patientId === patientId && c.status === 'active');
    }

    revokeConsent(consentId) {
        const c = this.data.consents.find(c => c.consentId === consentId);
        if (c) { c.status = 'revoked'; c.revokedAt = new Date().toISOString(); this.save('consents'); }
    }

    logAccess(data) {
        this.data.accessLogs.push(data);
        this.save('accessLogs');
    }

    getPatientAccessLogs(patientId) {
        return this.data.accessLogs.filter(l => l.patientId === patientId);
    }

    createTempPatient(data) {
        this.data.tempPatients.push(data);
        this.save('tempPatients');
    }

    createOTP(patientId, code, requestId, expiresAt) {
        this.data.otpCodes.push({ patientId, code, requestId, expiresAt, verified: false });
        this.save('otpCodes');
    }

    verifyOTP(requestId, code) {
        const otp = this.data.otpCodes.find(o => o.requestId === requestId && o.code === code && !o.verified && new Date(o.expiresAt) > new Date());
        if (otp) { otp.verified = true; this.save('otpCodes'); return true; }
        return false;
    }

    findStaffById(staffId) {
        return this.data.staff.find(s => s.staffId === staffId);
    }
}

// ============================================
// UTILITY
// ============================================

function generateDID(nik) {
    return `did:medchain:${crypto.createHash('sha256').update(nik + Date.now()).digest('hex').substring(0, 40)}`;
}

function generateId(prefix = '') {
    return prefix + Date.now().toString(36).toUpperCase() + '-' + crypto.randomBytes(4).toString('hex').toUpperCase();
}

function generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

// ============================================
// START SERVER
// ============================================

const blockchain = new FileBasedBlockchain('./blockchain-data');
const database = new JSONDatabase('./db-data');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// ============================================
// PATIENT ENDPOINTS
// ============================================

app.post('/api/patients/register', (req, res) => {
    try {
        const { nik, name, birthDate, bloodType, allergies, phone } = req.body;
        let patient = database.findPatientByNIK(nik);

        if (patient && patient.did) {
            return res.status(400).json({ error: 'Already registered with DID' });
        }

        const did = generateDID(nik);

        if (patient) {
            database.updatePatientDID(nik, did);
            patient.did = did;
        } else {
            patient = database.registerPatient({ nik, did, name, birthDate, bloodType, allergies, phone });
        }

        const tx = blockchain.addTransaction('DID_REGISTRATION', {
            nikHash: crypto.createHash('sha256').update(nik).digest('hex').substring(0, 16),
            did,
            timestamp: new Date().toISOString()
        });

        res.json({ success: true, patient: { id: patient.id, nik, did, name }, transaction: tx });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/patients/nik/:nik', (req, res) => {
    const patient = database.findPatientByNIK(req.params.nik);
    if (!patient) return res.status(404).json({ error: 'Not found' });
    res.json(patient);
});

app.get('/api/patients/:id/consents', (req, res) => {
    res.json(database.getPatientConsents(parseInt(req.params.id)));
});

app.get('/api/patients/:id/access-logs', (req, res) => {
    res.json(database.getPatientAccessLogs(parseInt(req.params.id)));
});

// ============================================
// CONSENT ENDPOINTS
// ============================================

app.post('/api/consent/request', (req, res) => {
    try {
        const { nik } = req.body;
        const patient = database.findPatientByNIK(nik);
        if (!patient) return res.status(404).json({ error: 'Patient not found' });

        const otp = generateOTP();
        const requestId = generateId('REQ-');
        const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

        database.createOTP(patient.id, otp, requestId, expiresAt);

        res.json({
            success: true,
            requestId,
            patientPhone: patient.phone ? patient.phone.replace(/(\d{4})(\d+)(\d{2})/, '$1****$3') : '****',
            _demoOTP: otp
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/consent/verify', (req, res) => {
    try {
        const { requestId, otp, nik, hospitalId, dataTypes, purpose, durationHours = 24 } = req.body;

        if (!database.verifyOTP(requestId, otp)) {
            return res.status(400).json({ error: 'Invalid or expired OTP' });
        }

        const patient = database.findPatientByNIK(nik);
        const consentId = generateId('CONSENT-');
        const grantedAt = new Date().toISOString();
        const expiresAt = new Date(Date.now() + durationHours * 60 * 60 * 1000).toISOString();

        const tx = blockchain.addTransaction('CONSENT_GRANTED', { consentId, patientDid: patient.did, hospitalId, dataTypes, purpose });

        database.createConsent({ consentId, patientId: patient.id, hospitalId, dataTypes, purpose, grantedAt, expiresAt, status: 'active', txHash: tx.txHash });

        res.json({ success: true, consentId, expiresAt, transaction: tx });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/consent/:id/revoke', (req, res) => {
    try {
        database.revokeConsent(req.params.id);
        const tx = blockchain.addTransaction('CONSENT_REVOKED', { consentId: req.params.id });
        res.json({ success: true, transaction: tx });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// EMERGENCY ENDPOINTS
// ============================================

app.post('/api/emergency/access', (req, res) => {
    try {
        const { identificationMethod, nik, staffId, reason, foundLocation, foundCondition, estimatedAge, gender } = req.body;

        let patient = null;
        let tempId = null;

        if (identificationMethod === 'nik' && nik) {
            patient = database.findPatientByNIK(nik);
        }

        if (!patient) {
            tempId = generateId('TEMP-');
            database.createTempPatient({ tempId, foundLocation, foundCondition, estimatedAge, gender, createdAt: new Date().toISOString() });
        }

        const logId = generateId('EMRG-');
        const tx = blockchain.addTransaction('EMERGENCY_ACCESS', {
            logId,
            patientId: patient ? patient.id : null,
            tempId,
            staffId,
            reason,
            identificationMethod,
            accessedAt: new Date().toISOString()
        });

        database.logAccess({
            logId,
            patientId: patient ? patient.id : null,
            patientIdentifier: patient ? patient.nik : tempId,
            staffId,
            accessType: 'EMERGENCY',
            reason,
            isEmergency: true,
            txHash: tx.txHash,
            createdAt: new Date().toISOString()
        });

        if (patient) {
            res.json({
                success: true,
                found: true,
                patient: { name: patient.name, bloodType: patient.bloodType, allergies: patient.allergies, birthDate: patient.birthDate },
                transaction: tx
            });
        } else {
            res.json({
                success: true,
                found: false,
                tempId,
                message: 'Unknown patient - TEMP ID generated',
                transaction: tx
            });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// BLOCKCHAIN ENDPOINTS
// ============================================

app.get('/api/blockchain/stats', (req, res) => {
    res.json(blockchain.getStats());
});

app.get('/api/blockchain/transactions', (req, res) => {
    res.json(blockchain.getRecentTransactions(parseInt(req.query.limit) || 20));
});

app.get('/api/blockchain/blocks/:number', (req, res) => {
    const block = blockchain.getBlock(parseInt(req.params.number));
    if (!block) return res.status(404).json({ error: 'Block not found' });
    res.json(block);
});

app.get('/api/blockchain/validate', (req, res) => {
    res.json(blockchain.validateChain());
});

// ============================================
// HOSPITAL & STAFF
// ============================================

app.get('/api/hospitals', (req, res) => {
    res.json(database.data.hospitals);
});

app.get('/api/hospitals/:id/staff', (req, res) => {
    res.json(database.data.staff.filter(s => s.hospitalId === parseInt(req.params.id)));
});

// ============================================
// START
// ============================================

const PORT = 8085;
app.listen(PORT, () => {
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('          MedChain Indonesia - Healthcare DID PoC');
    console.log('          File-Based Blockchain (Like Mini Ethereum Node)');
    console.log('═══════════════════════════════════════════════════════════════\n');
    console.log(`  🚀 Server: http://localhost:${PORT}`);
    console.log(`  📂 Blockchain: ./blockchain-data/`);
    console.log(`  📂 Database: ./db-data/`);
    console.log(`\n  Stats: ${blockchain.getStats().totalBlocks} blocks | Chain Valid: ${blockchain.validateChain().valid}`);
    console.log('\n  Production Options:');
    console.log('    • Ethereum L2 (Polygon/Arbitrum)');
    console.log('    • Hyperledger Fabric');
    console.log('    • Custom Chain (Cosmos SDK / Substrate)');
    console.log('\n═══════════════════════════════════════════════════════════════\n');
});
