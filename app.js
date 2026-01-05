/**
 * MedChain Indonesia - Healthcare DID PoC
 * Frontend Implementation with Real Backend API
 */

const API_BASE = '/api';

// ========================================
// API HELPER
// ========================================

async function api(endpoint, method = 'GET', data = null) {
    const options = {
        method,
        headers: { 'Content-Type': 'application/json' }
    };
    if (data) options.body = JSON.stringify(data);

    const response = await fetch(API_BASE + endpoint, options);
    const json = await response.json();

    if (!response.ok) {
        throw new Error(json.error || 'API Error');
    }
    return json;
}

// ========================================
// SIMULATED DATA (Fallback when API unavailable)
// ========================================

const Database = {
    patients: [],
    consents: [],
    accessLogs: [],
    medicalRecords: {},

    addPatient(patient) {
        this.patients.push(patient);
        this.medicalRecords[patient.did] = {
            riwayat: [
                { date: '2024-06-15', diagnosis: 'Demam Berdarah', rs: 'RS Cipto Mangunkusumo' },
                { date: '2024-01-10', diagnosis: 'Infeksi Saluran Pernapasan', rs: 'Klinik Sehat' }
            ],
            lab: [
                { date: '2024-11-20', test: 'Darah Lengkap', result: 'Normal', rs: 'RS Medika' },
                { date: '2024-08-05', test: 'Gula Darah', result: '95 mg/dL (Normal)', rs: 'Lab Prodia' }
            ],
            obat: [{ name: 'Metformin 500mg', dose: '2x sehari', since: '2024-01-01' }],
            vaksin: [
                { name: 'COVID-19 Booster', date: '2024-03-15', rs: 'Puskesmas Kecamatan' },
                { name: 'Influenza', date: '2023-10-20', rs: 'RS Medika' }
            ]
        };
        return patient;
    },

    findByNik(nik) {
        return this.patients.find(p => p.nik === nik);
    },

    addConsent(consent) {
        this.consents.push(consent);
        return consent;
    },

    getPatientConsents(did) {
        return this.consents.filter(c => c.patientDid === did);
    },

    addAccessLog(log) {
        this.accessLogs.unshift(log);
        return log;
    }
};

const BlockchainSimulator = {
    transactions: [],
    blockHeight: 0,

    generateHash() {
        return '0x' + Array.from({ length: 64 }, () =>
            Math.floor(Math.random() * 16).toString(16)).join('');
    },

    generateDID(nik) {
        return `did:medchain:${this.generateHash().slice(0, 42)}`;
    },

    addTransaction(type, data) {
        const tx = {
            hash: this.generateHash(),
            type: type,
            data: data,
            timestamp: new Date().toISOString(),
            blockHeight: ++this.blockHeight
        };
        this.transactions.unshift(tx);
        return tx;
    },

    getStats() {
        return {
            totalDids: Database.patients.length,
            totalConsents: Database.consents.length,
            totalAccess: this.transactions.filter(t => t.type === 'ACCESS' || t.type === 'EMERGENCY_ACCESS').length,
            blockHeight: this.blockHeight
        };
    }
};

// ========================================
// APPLICATION STATE
// ========================================

let currentPatient = null;
let currentSearchedPatient = null;
let useRealAPI = false; // Will be set to true if backend is available

// Check if backend is available
(async function checkBackend() {
    try {
        const stats = await api('/blockchain/stats');
        useRealAPI = true;
        console.log('✓ Backend tersedia - menggunakan Real API');
        console.log('  Blocks:', stats.totalBlocks, '| Valid:', stats.valid);
    } catch (e) {
        useRealAPI = false;
        console.log('⚠ Backend tidak tersedia - menggunakan Simulated Mode');
        console.log('  Jalankan: node server.js');
    }
})();

// ========================================
// NAVIGATION
// ========================================

document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        const viewId = btn.dataset.view;
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        document.getElementById(viewId).classList.add('active');

        if (viewId === 'blockchain') {
            updateBlockchainView();
        }
    });
});

// ========================================
// PATIENT REGISTRATION
// ========================================

document.getElementById('registerForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const nik = document.getElementById('nik').value.trim();
    const nama = document.getElementById('nama').value.trim();
    const tglLahir = document.getElementById('tglLahir').value;
    const noHp = document.getElementById('noHp').value.trim();
    const golDarah = document.getElementById('golDarah').value;
    const alergi = document.getElementById('alergi').value.trim();

    if (!nik || nik.length !== 16) {
        alert('NIK harus 16 digit');
        return;
    }

    if (!nama || !tglLahir || !noHp || !golDarah) {
        alert('Semua field wajib diisi');
        return;
    }

    let result;

    if (useRealAPI) {
        try {
            result = await api('/patients/register', 'POST', {
                nik, name: nama, birthDate: tglLahir, phone: noHp,
                bloodType: golDarah, allergies: alergi
            });

            currentPatient = {
                id: result.patient.id,
                did: result.patient.did,
                nik: result.patient.nik,
                nama: result.patient.name,
                noHp: noHp,
                golDarah: golDarah,
                alergi: alergi ? alergi.split(',').map(a => a.trim()) : []
            };

            showRegistrationResult(result.patient.did, result.transaction.txHash, result.transaction.blockNumber);
        } catch (error) {
            alert('Error: ' + error.message);
            return;
        }
    } else {
        // Simulated mode
        if (Database.findByNik(nik)) {
            alert('NIK sudah terdaftar');
            return;
        }

        const did = BlockchainSimulator.generateDID(nik);
        const patient = {
            did, nik, nama, noHp, golDarah,
            tglLahir: tglLahir,
            alergi: alergi ? alergi.split(',').map(a => a.trim()) : [],
            createdAt: new Date().toISOString()
        };

        Database.addPatient(patient);
        const tx = BlockchainSimulator.addTransaction('DID_CREATED', { did, nikHash: BlockchainSimulator.generateHash().slice(0, 20) });

        currentPatient = patient;
        showRegistrationResult(did, tx.hash, tx.blockHeight);
    }
});

function showRegistrationResult(did, txHash, blockNumber) {
    const resultDiv = document.getElementById('registerResult');
    resultDiv.classList.remove('hidden');
    resultDiv.innerHTML = `
        <h4>✅ DID Berhasil Dibuat!</h4>
        <div class="info-row">
            <span class="label">DID:</span>
            <span class="value">${did}</span>
        </div>
        <div class="info-row">
            <span class="label">TX Hash:</span>
            <span class="value">${txHash}</span>
        </div>
        <div class="info-row">
            <span class="label">Block:</span>
            <span class="value">#${blockNumber}</span>
        </div>
        <div class="info-row" style="background:${useRealAPI ? '#d4edda' : '#fff3cd'};padding:10px;margin-top:10px;">
            <span class="value">${useRealAPI ? '✓ Data tersimpan di SQLite (medchain.db)' : '⚠ Mode Simulasi - data tidak permanen'}</span>
        </div>
    `;

    setTimeout(() => {
        showPatientDashboard(currentPatient);
    }, 1000);
}

function showPatientDashboard(patient) {
    document.getElementById('patientDashboard').style.display = 'block';
    document.getElementById('displayDid').textContent = patient.did;
    document.getElementById('displayNama').textContent = patient.nama;

    updateConsentList(patient);
    updateAccessHistory(patient);
}

async function updateConsentList(patient) {
    const listDiv = document.getElementById('consentList');

    let consents = [];
    if (useRealAPI && patient.id) {
        try {
            consents = await api(`/patients/${patient.id}/consents`);
        } catch (e) {
            consents = [];
        }
    } else {
        consents = Database.getPatientConsents(patient.did);
    }

    if (consents.length === 0) {
        listDiv.innerHTML = '<p style="padding:20px;text-align:center;color:#666;">Belum ada consent aktif</p>';
        return;
    }

    listDiv.innerHTML = consents.map(c => `
        <div class="consent-item">
            <div class="consent-info">
                <div class="consent-hospital">${c.hospital_name || c.hospitalName}</div>
                <div class="consent-data">Data: ${typeof c.data_types === 'string' ? JSON.parse(c.data_types).join(', ') : c.dataTypes.join(', ')}</div>
                <div class="consent-data">Berlaku sampai: ${new Date(c.expires_at || c.expiresAt).toLocaleDateString('id-ID')}</div>
            </div>
            <div class="consent-actions">
                <button class="btn btn-small" onclick="revokeConsent('${c.consent_id || c.id}')">❌ Revoke</button>
            </div>
        </div>
    `).join('');
}

async function updateAccessHistory(patient) {
    const historyDiv = document.getElementById('accessHistory');

    let logs = [];
    if (useRealAPI && patient.id) {
        try {
            logs = await api(`/patients/${patient.id}/access-logs`);
        } catch (e) {
            logs = [];
        }
    } else {
        logs = Database.accessLogs.filter(l => l.patientDid === patient.did);
    }

    if (logs.length === 0) {
        historyDiv.innerHTML = '<p style="padding:20px;text-align:center;color:#666;">Belum ada riwayat akses</p>';
        return;
    }

    historyDiv.innerHTML = logs.map(l => `
        <div class="access-item">
            <strong>${l.hospital_name || l.hospitalName}</strong> - ${l.access_type || 'DATA_ACCESS'}
            <br><span class="access-time">${new Date(l.created_at || l.timestamp).toLocaleString('id-ID')}</span>
            ${l.is_emergency || l.isEmergency ? '<br><span style="color:red;">⚠️ EMERGENCY ACCESS</span>' : ''}
        </div>
    `).join('');
}

async function revokeConsent(consentId) {
    if (useRealAPI) {
        try {
            await api(`/consent/${consentId}/revoke`, 'POST');
            alert('Consent berhasil dicabut');
        } catch (error) {
            alert('Error: ' + error.message);
            return;
        }
    } else {
        const index = Database.consents.findIndex(c => c.id === consentId);
        if (index > -1) {
            const consent = Database.consents[index];
            Database.consents.splice(index, 1);
            BlockchainSimulator.addTransaction('CONSENT_REVOKED', { consentId, patientDid: consent.patientDid });
            alert('Consent berhasil dicabut');
        }
    }
    updateConsentList(currentPatient);
}

// ========================================
// HOSPITAL - SEARCH PATIENT
// ========================================

document.getElementById('searchPatientForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const nik = document.getElementById('searchNik').value.trim();

    let patient;
    if (useRealAPI) {
        try {
            patient = await api(`/patients/nik/${nik}`);
            currentSearchedPatient = patient;
        } catch (error) {
            alert('Pasien tidak ditemukan. Pastikan NIK benar atau pasien sudah terdaftar.');
            return;
        }
    } else {
        patient = Database.findByNik(nik);
        if (!patient) {
            alert('Pasien tidak ditemukan. Pastikan NIK benar atau pasien sudah terdaftar.');
            return;
        }
        currentSearchedPatient = patient;
    }

    document.getElementById('patientFound').style.display = 'block';
    document.getElementById('foundDid').textContent = patient.did || 'Belum terdaftar DID';
    document.getElementById('foundNama').textContent = patient.name || patient.nama;

    document.getElementById('otpVerification').style.display = 'none';
    document.getElementById('accessGranted').style.display = 'none';
});

// Request Access
document.getElementById('requestAccessBtn').addEventListener('click', async () => {
    const dataTypes = [];
    if (document.getElementById('reqRiwayat').checked) dataTypes.push('Riwayat Penyakit');
    if (document.getElementById('reqAlergi').checked) dataTypes.push('Alergi');
    if (document.getElementById('reqLab').checked) dataTypes.push('Hasil Lab');
    if (document.getElementById('reqObat').checked) dataTypes.push('Obat');
    if (document.getElementById('reqVaksin').checked) dataTypes.push('Vaksin');

    if (dataTypes.length === 0) {
        alert('Pilih minimal satu jenis data');
        return;
    }

    if (useRealAPI) {
        try {
            const result = await api('/consent/request', 'POST', {
                nik: currentSearchedPatient.nik,
                hospitalId: 1,
                staffId: 'DR001',
                dataTypes,
                purpose: 'Medical treatment'
            });

            window.pendingRequest = {
                requestId: result.requestId,
                dataTypes,
                patient: currentSearchedPatient,
                demoOTP: result._demoOTP
            };

            document.getElementById('otpVerification').style.display = 'block';
            document.getElementById('maskedPhone').textContent = result.patientPhone;

            alert(`OTP Demo: ${result._demoOTP}\n\n(Di production, OTP dikirim via SMS ke pasien)`);
        } catch (error) {
            alert('Error: ' + error.message);
            return;
        }
    } else {
        window.pendingRequest = { dataTypes, patient: currentSearchedPatient };
        document.getElementById('otpVerification').style.display = 'block';
        const phone = currentSearchedPatient.noHp || '081234567890';
        document.getElementById('maskedPhone').textContent = phone.replace(/(\d{4})(\d+)(\d{4})/, '$1-xxxx-$3');
        BlockchainSimulator.addTransaction('ACCESS_REQUESTED', {
            patientDid: currentSearchedPatient.did,
            hospitalId: 'RS-001',
            dataTypes
        });
    }
});

// Verify OTP
document.getElementById('verifyOtpBtn').addEventListener('click', async () => {
    const otp = document.getElementById('otpInput').value.trim();

    if (otp.length !== 6) {
        alert('OTP harus 6 digit');
        return;
    }

    if (useRealAPI) {
        try {
            const result = await api('/consent/verify', 'POST', {
                requestId: window.pendingRequest.requestId,
                otp,
                nik: window.pendingRequest.patient.nik,
                hospitalId: 1,
                staffId: 'DR001',
                dataTypes: window.pendingRequest.dataTypes,
                purpose: 'Medical treatment',
                durationHours: 24
            });

            document.getElementById('otpVerification').style.display = 'none';
            showAccessGranted(window.pendingRequest.patient, window.pendingRequest.dataTypes, result.transaction.txHash);
        } catch (error) {
            alert('OTP salah atau expired');
            return;
        }
    } else {
        // Simulated mode - accept any 6 digit OTP
        const consent = {
            id: 'consent-' + Date.now(),
            patientDid: window.pendingRequest.patient.did,
            hospitalId: 'RS-001',
            hospitalName: 'RS Cipto Mangunkusumo',
            dataTypes: window.pendingRequest.dataTypes,
            createdAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
        };
        Database.addConsent(consent);

        const tx = BlockchainSimulator.addTransaction('CONSENT_GRANTED', {
            consentId: consent.id,
            patientDid: consent.patientDid,
            dataTypes: consent.dataTypes
        });

        Database.addAccessLog({
            id: 'access-' + Date.now(),
            patientDid: consent.patientDid,
            hospitalName: consent.hospitalName,
            dataTypes: consent.dataTypes,
            timestamp: new Date().toISOString(),
            isEmergency: false,
            txHash: tx.hash
        });

        document.getElementById('otpVerification').style.display = 'none';
        showAccessGranted(window.pendingRequest.patient, window.pendingRequest.dataTypes, tx.hash);
    }

    if (currentPatient && (currentPatient.nik === window.pendingRequest.patient.nik)) {
        updateConsentList(currentPatient);
        updateAccessHistory(currentPatient);
    }
});

function showAccessGranted(patient, dataTypes, txHash) {
    const accessDiv = document.getElementById('accessGranted');
    accessDiv.style.display = 'block';

    const patientName = patient.name || patient.nama;
    const birthDate = patient.birth_date || patient.tglLahir;
    const bloodType = patient.blood_type || patient.golDarah;
    const allergies = patient.allergies || (patient.alergi ? patient.alergi.join(', ') : 'Tidak ada');

    document.getElementById('basicInfo').innerHTML = `
        <div class="info-row">
            <span class="label">Nama:</span>
            <span class="value">${patientName}</span>
        </div>
        <div class="info-row">
            <span class="label">Tanggal Lahir:</span>
            <span class="value">${new Date(birthDate).toLocaleDateString('id-ID')}</span>
        </div>
        <div class="info-row">
            <span class="label">Golongan Darah:</span>
            <span class="value">${bloodType}</span>
        </div>
    `;

    // Show sections based on data types
    document.getElementById('riwayatSection').style.display = 'none';
    document.getElementById('alergiSection').style.display = 'none';
    document.getElementById('labSection').style.display = 'none';

    if (dataTypes.includes('Riwayat Penyakit')) {
        document.getElementById('riwayatSection').style.display = 'block';
        const records = Database.medicalRecords[patient.did];
        if (records) {
            document.getElementById('riwayatData').innerHTML = records.riwayat.map(r => `
                <div style="padding:10px 0;border-bottom:1px solid #ddd;">
                    <strong>${r.diagnosis}</strong><br>
                    <small>${r.date} - ${r.rs}</small>
                </div>
            `).join('');
        } else {
            document.getElementById('riwayatData').innerHTML = '<p>Data dari database rumah sakit</p>';
        }
    }

    if (dataTypes.includes('Alergi')) {
        document.getElementById('alergiSection').style.display = 'block';
        document.getElementById('alergiData').innerHTML = allergies
            ? `<span style="display:inline-block;padding:5px 10px;background:#f5f5f5;border:1px solid #000;">${allergies}</span>`
            : '<p>Tidak ada alergi tercatat</p>';
    }

    if (dataTypes.includes('Hasil Lab')) {
        document.getElementById('labSection').style.display = 'block';
        const records = Database.medicalRecords[patient.did];
        if (records) {
            document.getElementById('labData').innerHTML = records.lab.map(l => `
                <div style="padding:10px 0;border-bottom:1px solid #ddd;">
                    <strong>${l.test}</strong>: ${l.result}<br>
                    <small>${l.date} - ${l.rs}</small>
                </div>
            `).join('');
        } else {
            document.getElementById('labData').innerHTML = '<p>Data dari database rumah sakit</p>';
        }
    }

    document.getElementById('txHash').textContent = txHash;
}

// ========================================
// EMERGENCY ACCESS
// ========================================

document.getElementById('identMethod').addEventListener('change', (e) => {
    const method = e.target.value;

    document.querySelectorAll('.ident-section').forEach(s => s.style.display = 'none');

    switch (method) {
        case 'nik':
            document.getElementById('nikSection').style.display = 'block';
            break;
        case 'biometric':
            document.getElementById('biometricSection').style.display = 'block';
            break;
        case 'physical':
            document.getElementById('physicalSection').style.display = 'block';
            break;
        case 'unknown':
            document.getElementById('unknownSection').style.display = 'block';
            document.getElementById('foundTime').value = new Date().toISOString().slice(0, 16);
            break;
    }
});

// Biometric simulation
document.getElementById('scannerBox')?.addEventListener('click', () => {
    const scannerBox = document.getElementById('scannerBox');
    const statusDiv = document.getElementById('scannerStatus');

    scannerBox.classList.add('scanning');
    statusDiv.textContent = 'Scanning...';
    statusDiv.className = 'scanner-status';

    setTimeout(() => {
        scannerBox.classList.remove('scanning');
        if (Math.random() > 0.3) {
            scannerBox.classList.add('matched');
            scannerBox.innerHTML = '<span class="scanner-icon">✅</span><p>Match Found!</p>';
            statusDiv.textContent = 'Pasien ditemukan: Budi Santoso (NIK: 3201234567890001)';
            statusDiv.classList.add('success');
            window.biometricNik = '3201234567890001';
        } else {
            statusDiv.textContent = 'Tidak ada kecocokan dalam database.';
            statusDiv.classList.add('error');
        }
    }, 2000);
});

document.getElementById('faceRecogBtn')?.addEventListener('click', () => {
    const btn = document.getElementById('faceRecogBtn');
    const statusDiv = document.getElementById('scannerStatus');

    btn.textContent = '📷 Scanning...';
    btn.disabled = true;

    setTimeout(() => {
        btn.textContent = '📷 Scan Wajah';
        btn.disabled = false;

        if (Math.random() > 0.3) {
            statusDiv.textContent = 'Face match: Budi Santoso (Confidence: 94%)';
            statusDiv.classList.add('success');
            window.biometricNik = '3201234567890001';
        } else {
            statusDiv.textContent = 'Wajah tidak dikenali. Coba lagi atau gunakan metode lain.';
            statusDiv.classList.add('error');
        }
    }, 2500);
});

document.getElementById('emergencyReason').addEventListener('change', (e) => {
    document.getElementById('otherReasonGroup').style.display = e.target.value === 'other' ? 'block' : 'none';
});

document.getElementById('confirmEmergency').addEventListener('change', (e) => {
    document.getElementById('emergencyBtn').disabled = !e.target.checked;
});

document.getElementById('emergencyForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const staffId = document.getElementById('staffId').value.trim();
    const staffName = document.getElementById('staffName').value.trim();
    const identMethod = document.getElementById('identMethod').value;
    const reason = document.getElementById('emergencyReason').value;
    const otherReason = document.getElementById('otherReason').value.trim();

    if (!staffId || !staffName || !reason) {
        alert('Staff ID, Nama, dan Alasan wajib diisi');
        return;
    }

    let requestData = {
        staffId,
        staffName,
        identificationMethod: identMethod,
        reason: reason === 'other' ? otherReason : reason,
        emergencyType: reason
    };

    switch (identMethod) {
        case 'nik':
            requestData.nik = document.getElementById('emergencyNik').value.trim();
            break;
        case 'biometric':
            if (window.biometricNik) {
                requestData.nik = window.biometricNik;
            } else {
                alert('Lakukan scan biometrik terlebih dahulu');
                return;
            }
            break;
        case 'physical':
            requestData.physicalDescription = document.getElementById('physMarks').value;
            requestData.gender = document.getElementById('physGender').value;
            requestData.estimatedAge = document.getElementById('physAge').value;
            break;
        case 'unknown':
            requestData.foundLocation = document.getElementById('foundLocation').value;
            requestData.foundCondition = document.getElementById('foundCondition').value;
            requestData.gender = document.getElementById('unknownGender').value;
            requestData.estimatedAge = document.getElementById('unknownAge').value;
            break;
    }

    if (useRealAPI) {
        try {
            const result = await api('/emergency/access', 'POST', requestData);
            showEmergencyResult(result, requestData);
        } catch (error) {
            alert('Error: ' + error.message);
        }
    } else {
        // Simulated mode
        let patient = null;
        if (requestData.nik) {
            patient = Database.findByNik(requestData.nik);
        }

        let tempId = null;
        if (!patient) {
            tempId = 'TEMP-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).substring(2, 6).toUpperCase();
        }

        const tx = BlockchainSimulator.addTransaction('EMERGENCY_ACCESS', {
            patientDid: patient ? patient.did : tempId,
            patientType: patient ? 'known' : 'unknown',
            staffId: requestData.staffId,
            reason: requestData.reason
        });

        const result = {
            found: !!patient,
            patient: patient ? {
                name: patient.nama,
                birthDate: patient.tglLahir,
                bloodType: patient.golDarah,
                allergies: patient.alergi ? patient.alergi.join(', ') : null
            } : null,
            tempId: tempId,
            transaction: { txHash: tx.hash, blockNumber: tx.blockHeight, timestamp: tx.timestamp }
        };

        showEmergencyResult(result, requestData);
    }
});

function showEmergencyResult(result, requestData) {
    document.getElementById('emergencyResult').style.display = 'block';

    if (result.found) {
        document.getElementById('emergencyBasic').innerHTML = `
            <div class="info-row">
                <span class="label">Nama:</span>
                <span class="value">${result.patient.name}</span>
            </div>
            <div class="info-row">
                <span class="label">Tanggal Lahir:</span>
                <span class="value">${new Date(result.patient.birthDate).toLocaleDateString('id-ID')}</span>
            </div>
            <div class="info-row" style="background:#000;color:#fff;padding:10px;">
                <span class="label">GOLONGAN DARAH:</span>
                <span class="value" style="font-size:24px;font-weight:bold;">${result.patient.bloodType}</span>
            </div>
            <div class="info-row" style="background:#333;color:#fff;padding:10px;">
                <span class="label">⚠️ ALERGI:</span>
                <span class="value" style="font-weight:bold;">${result.patient.allergies || 'Tidak ada'}</span>
            </div>
        `;

        document.getElementById('emergencyFull').innerHTML = `
            <div style="padding:20px;background:#d4edda;border:2px solid #28a745;">
                <h4>✓ Pasien Teridentifikasi</h4>
                <p>Data medis lengkap tersedia dari database.</p>
            </div>
        `;
    } else {
        document.getElementById('emergencyBasic').innerHTML = `
            <div class="unknown-warning">
                ⚠️ PASIEN TIDAK TERIDENTIFIKASI - DATA MEDIS TIDAK TERSEDIA ⚠️
            </div>
            <div class="temp-id-display">
                <p>ID Sementara:</p>
                <span class="temp-id">${result.tempId}</span>
            </div>
            <div class="info-row" style="background:#000;color:#fff;padding:10px;">
                <span class="label">GOLONGAN DARAH:</span>
                <span class="value" style="font-size:24px;font-weight:bold;">❓ TIDAK DIKETAHUI</span>
            </div>
            <div class="info-row" style="background:#333;color:#fff;padding:10px;">
                <span class="label">⚠️ ALERGI:</span>
                <span class="value" style="font-weight:bold;">❓ TIDAK DIKETAHUI - HATI-HATI!</span>
            </div>
        `;

        document.getElementById('emergencyFull').innerHTML = `
            <div style="padding:20px;background:#f5f5f5;border:2px dashed #999;text-align:center;">
                <h4>⚠️ PROTOKOL PASIEN TIDAK DIKENAL</h4>
                <ul style="text-align:left;margin:15px 0;padding-left:30px;">
                    <li>Asumsikan alergi obat tertentu mungkin ada</li>
                    <li>Lakukan tes golongan darah sebelum transfusi</li>
                    <li>Hubungi polisi untuk identifikasi</li>
                </ul>
                <p><strong>TEMP ID: ${result.tempId}</strong></p>
            </div>
        `;
    }

    document.getElementById('emergencyLog').innerHTML = `
        <p><strong>TX Hash:</strong> ${result.transaction.txHash}</p>
        <p><strong>Block:</strong> #${result.transaction.blockNumber}</p>
        <p><strong>Timestamp:</strong> ${new Date(result.transaction.timestamp).toLocaleString('id-ID')}</p>
        <p><strong>Staff ID:</strong> ${requestData.staffId}</p>
        <p><strong>Identifikasi:</strong> ${requestData.identificationMethod}</p>
        <p style="margin-top:15px;padding:10px;background:${useRealAPI ? '#d4edda' : '#fff3cd'};color:#000;">
            ${useRealAPI ? '✓ Tercatat permanen di SQLite (medchain.db)' : '⚠ Mode Simulasi - data tidak permanen'}
        </p>
    `;
}

// ========================================
// BLOCKCHAIN EXPLORER
// ========================================

async function updateBlockchainView() {
    if (useRealAPI) {
        try {
            const stats = await api('/blockchain/stats');

            document.getElementById('totalDids').textContent = stats.totalBlocks || 0;
            document.getElementById('totalConsents').textContent = stats.totalTransactions || 0;
            document.getElementById('totalAccess').textContent = stats.totalTransactions || 0;
            document.getElementById('blockHeight').textContent = `${stats.totalBlocks} (${stats.valid ? '✓ Valid' : '✗ Invalid'})`;

            const transactions = await api('/blockchain/transactions?limit=10');
            const txList = document.getElementById('recentTx');

            if (transactions.length === 0) {
                txList.innerHTML = '<p style="padding:20px;text-align:center;color:#666;">Belum ada transaksi</p>';
                return;
            }

            txList.innerHTML = transactions.map(tx => `
                <div class="tx-item">
                    <span class="tx-type">${tx.type}</span>
                    Block #${tx.blockNumber}
                    <br><span class="tx-hash">${tx.hash}</span>
                    <br><small>${new Date(tx.timestamp).toLocaleString('id-ID')}</small>
                </div>
            `).join('');
        } catch (error) {
            console.error('Blockchain error:', error);
        }
    } else {
        // Simulated mode
        const stats = BlockchainSimulator.getStats();

        document.getElementById('totalDids').textContent = stats.totalDids;
        document.getElementById('totalConsents').textContent = stats.totalConsents;
        document.getElementById('totalAccess').textContent = stats.totalAccess;
        document.getElementById('blockHeight').textContent = stats.blockHeight + ' (Simulated)';

        const txList = document.getElementById('recentTx');
        if (BlockchainSimulator.transactions.length === 0) {
            txList.innerHTML = '<p style="padding:20px;text-align:center;color:#666;">Belum ada transaksi</p>';
            return;
        }

        txList.innerHTML = BlockchainSimulator.transactions.slice(0, 10).map(tx => `
            <div class="tx-item">
                <span class="tx-type">${tx.type}</span>
                Block #${tx.blockHeight}
                <br><span class="tx-hash">${tx.hash}</span>
                <br><small>${new Date(tx.timestamp).toLocaleString('id-ID')}</small>
            </div>
        `).join('');
    }
}

// ========================================
// TEMP ID TO DID LINKING
// ========================================

document.getElementById('linkTempForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const tempId = document.getElementById('linkTempId').value.trim();
    const nik = document.getElementById('linkNik').value.trim();
    const method = document.getElementById('linkMethod').value;
    const notes = document.getElementById('linkNotes').value.trim();

    if (!tempId || !nik) {
        alert('TEMP ID dan NIK wajib diisi');
        return;
    }

    if (nik.length !== 16) {
        alert('NIK harus 16 digit');
        return;
    }

    const resultDiv = document.getElementById('linkResult');

    if (useRealAPI) {
        try {
            const result = await api('/emergency/link-temp-id', 'POST', {
                tempId,
                nik,
                identificationMethod: method,
                notes
            });

            resultDiv.classList.remove('hidden');
            resultDiv.innerHTML = `
                <h4>✅ TEMP ID Berhasil Di-link!</h4>
                <div class="info-row">
                    <span class="label">TEMP ID:</span>
                    <span class="value">${tempId}</span>
                </div>
                <div class="info-row">
                    <span class="label">Linked to DID:</span>
                    <span class="value">${result.patient?.did || result.did}</span>
                </div>
                <div class="info-row">
                    <span class="label">Pasien:</span>
                    <span class="value">${result.patient?.name || 'N/A'}</span>
                </div>
                <div class="info-row">
                    <span class="label">TX Hash:</span>
                    <span class="value">${result.transaction?.txHash || 'N/A'}</span>
                </div>
            `;
        } catch (error) {
            resultDiv.classList.remove('hidden');
            resultDiv.innerHTML = `
                <h4 style="color:red;">❌ Gagal</h4>
                <p>${error.message}</p>
            `;
        }
    } else {
        // Simulated mode
        const patient = Database.findByNik(nik);

        if (!patient) {
            resultDiv.classList.remove('hidden');
            resultDiv.innerHTML = `
                <h4 style="color:red;">❌ Gagal</h4>
                <p>NIK tidak ditemukan. Pastikan pasien sudah terdaftar.</p>
            `;
            return;
        }

        // Record the linking
        const tx = BlockchainSimulator.addTransaction('TEMP_ID_LINKED', {
            tempId,
            linkedDid: patient.did,
            method,
            notes
        });

        resultDiv.classList.remove('hidden');
        resultDiv.innerHTML = `
            <h4>✅ TEMP ID Berhasil Di-link!</h4>
            <div class="info-row">
                <span class="label">TEMP ID:</span>
                <span class="value">${tempId}</span>
            </div>
            <div class="info-row">
                <span class="label">Linked to DID:</span>
                <span class="value">${patient.did}</span>
            </div>
            <div class="info-row">
                <span class="label">Pasien:</span>
                <span class="value">${patient.nama}</span>
            </div>
            <div class="info-row">
                <span class="label">TX Hash:</span>
                <span class="value">${tx.hash}</span>
            </div>
            <div class="info-row">
                <span class="label">Block:</span>
                <span class="value">#${tx.blockHeight}</span>
            </div>
        `;
    }
});

// ========================================
// INITIALIZE
// ========================================

console.log('MedChain Indonesia - Healthcare DID PoC');
console.log('Checking backend status...');
