# Healthcare DID PoC - Blockchain Medical Records

## 🚀 Quick Start
```bash
cd healthcare
node server.js
```
Open: http://localhost:8085

## 📁 Structure
```
healthcare/
├── server.js           # Backend + Blockchain Engine
├── index.html          # Frontend UI
├── app.js              # Client JavaScript
├── styles.css          # B&W Styling
├── blockchain-data/    # Blockchain (JSON files)
│   ├── blocks/         # block-00000000.json...
│   └── state.json      # Chain state
└── db-data/            # Application Data
    ├── patients.json
    ├── consents.json
    └── access-logs.json
```

## ⛓️ Blockchain Features
- **Real SHA-256** hashing (not simulated)
- **File-based storage** (like mini Ethereum node)
- **Merkle root** for transaction integrity  
- **Chain validation** with link verification
- **Ready for production** migration

## 🎯 Production Options
| Option | Ethereum L2 | Hyperledger Fabric |
|--------|-------------|-------------------|
| Type | Public Permissioned | Private Consortium |
| Cost | ~$0.001/tx | Internal |
| TPS | ~7,000 | ~3,000 |
| Recommendation | **Default choice** | If regulation requires |

## 📡 API Endpoints
- `POST /api/patients/register` - Register + DID
- `GET /api/patients/nik/:nik` - Find patient
- `POST /api/consent/request` - Request + OTP
- `POST /api/consent/verify` - Verify + Grant
- `POST /api/emergency/access` - Emergency access
- `GET /api/blockchain/stats` - Chain stats
- `GET /api/blockchain/validate` - Validate chain

## 📖 Research Paper
See: `/research/research-paper.html`
