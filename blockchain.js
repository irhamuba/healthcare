/**
 * Healthcare DID - File-Based Blockchain
 * 
 * Local blockchain simulation yang menyimpan blocks ke file JSON
 * seperti mini Ethereum node. Siap untuk upgrade ke ETH L2 atau Hyperledger.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

class FileBasedBlockchain {
    constructor(dataDir = './blockchain-data') {
        this.dataDir = dataDir;
        this.blocksDir = path.join(dataDir, 'blocks');
        this.stateFile = path.join(dataDir, 'state.json');
        this.transactionsDir = path.join(dataDir, 'transactions');

        this.initialize();
    }

    initialize() {
        // Create directories
        [this.dataDir, this.blocksDir, this.transactionsDir].forEach(dir => {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
        });

        // Load or create state
        if (fs.existsSync(this.stateFile)) {
            this.state = JSON.parse(fs.readFileSync(this.stateFile, 'utf8'));
            console.log(`✓ Loaded blockchain state: ${this.state.blockHeight} blocks`);
        } else {
            this.state = {
                blockHeight: 0,
                latestBlockHash: '0'.repeat(64),
                totalTransactions: 0,
                genesisTimestamp: new Date().toISOString(),
                chainId: 'medchain-local-001'
            };
            this.createGenesisBlock();
        }
    }

    saveState() {
        fs.writeFileSync(this.stateFile, JSON.stringify(this.state, null, 2));
    }

    // ============================================
    // HASHING FUNCTIONS (Real SHA-256)
    // ============================================

    sha256(data) {
        return crypto.createHash('sha256').update(data).digest('hex');
    }

    calculateBlockHash(block) {
        const data = `${block.number}|${block.timestamp}|${block.previousHash}|${block.merkleRoot}|${block.nonce}`;
        return this.sha256(data);
    }

    calculateMerkleRoot(transactions) {
        if (!transactions || transactions.length === 0) {
            return this.sha256('empty-block');
        }

        let hashes = transactions.map(tx => this.sha256(JSON.stringify(tx)));

        while (hashes.length > 1) {
            const newHashes = [];
            for (let i = 0; i < hashes.length; i += 2) {
                const left = hashes[i];
                const right = hashes[i + 1] || left;
                newHashes.push(this.sha256(left + right));
            }
            hashes = newHashes;
        }

        return hashes[0];
    }

    calculateTransactionHash(tx) {
        return this.sha256(JSON.stringify({
            type: tx.type,
            data: tx.data,
            timestamp: tx.timestamp,
            nonce: tx.nonce || 0
        }));
    }

    // ============================================
    // GENESIS BLOCK
    // ============================================

    createGenesisBlock() {
        const genesisTransactions = [{
            type: 'GENESIS',
            data: {
                message: 'Healthcare DID Genesis Block',
                network: 'medchain-local',
                version: '1.0.0',
                creator: 'Healthcare DID Research',
                purpose: 'Healthcare DID Proof of Concept'
            },
            timestamp: this.state.genesisTimestamp,
            nonce: 0
        }];

        genesisTransactions[0].hash = this.calculateTransactionHash(genesisTransactions[0]);

        const genesisBlock = {
            number: 0,
            timestamp: this.state.genesisTimestamp,
            previousHash: '0'.repeat(64),
            merkleRoot: this.calculateMerkleRoot(genesisTransactions),
            transactions: genesisTransactions,
            nonce: 0,
            difficulty: 1,
            miner: 'genesis'
        };

        genesisBlock.hash = this.calculateBlockHash(genesisBlock);

        this.saveBlock(genesisBlock);
        this.state.latestBlockHash = genesisBlock.hash;
        this.state.blockHeight = 0;
        this.state.totalTransactions = 1;
        this.saveState();

        console.log('✓ Genesis block created:', genesisBlock.hash.substring(0, 16) + '...');
        return genesisBlock;
    }

    // ============================================
    // BLOCK OPERATIONS
    // ============================================

    getBlockPath(blockNumber) {
        return path.join(this.blocksDir, `block-${blockNumber.toString().padStart(10, '0')}.json`);
    }

    saveBlock(block) {
        const blockPath = this.getBlockPath(block.number);
        fs.writeFileSync(blockPath, JSON.stringify(block, null, 2));

        // Also save individual transactions
        block.transactions.forEach(tx => {
            const txPath = path.join(this.transactionsDir, `${tx.hash}.json`);
            fs.writeFileSync(txPath, JSON.stringify({
                ...tx,
                blockNumber: block.number,
                blockHash: block.hash
            }, null, 2));
        });
    }

    getBlock(blockNumber) {
        const blockPath = this.getBlockPath(blockNumber);
        if (fs.existsSync(blockPath)) {
            return JSON.parse(fs.readFileSync(blockPath, 'utf8'));
        }
        return null;
    }

    getLatestBlock() {
        return this.getBlock(this.state.blockHeight);
    }

    getTransaction(txHash) {
        const txPath = path.join(this.transactionsDir, `${txHash}.json`);
        if (fs.existsSync(txPath)) {
            return JSON.parse(fs.readFileSync(txPath, 'utf8'));
        }
        return null;
    }

    // ============================================
    // ADD TRANSACTION & CREATE BLOCK
    // ============================================

    addTransaction(type, data) {
        const timestamp = new Date().toISOString();
        const nonce = Date.now();

        const transaction = {
            type,
            data,
            timestamp,
            nonce
        };
        transaction.hash = this.calculateTransactionHash(transaction);

        // Create new block with this transaction
        const latestBlock = this.getLatestBlock();

        const newBlock = {
            number: latestBlock.number + 1,
            timestamp,
            previousHash: latestBlock.hash,
            transactions: [transaction],
            nonce: 0,
            difficulty: 1,
            miner: 'local-node'
        };

        newBlock.merkleRoot = this.calculateMerkleRoot(newBlock.transactions);
        newBlock.hash = this.calculateBlockHash(newBlock);

        // Save block
        this.saveBlock(newBlock);

        // Update state
        this.state.blockHeight = newBlock.number;
        this.state.latestBlockHash = newBlock.hash;
        this.state.totalTransactions++;
        this.saveState();

        console.log(`⛓️ Block #${newBlock.number} created: ${newBlock.hash.substring(0, 16)}...`);

        return {
            txHash: transaction.hash,
            blockNumber: newBlock.number,
            blockHash: newBlock.hash,
            timestamp
        };
    }

    // ============================================
    // CHAIN VALIDATION
    // ============================================

    validateChain() {
        const errors = [];

        for (let i = 0; i <= this.state.blockHeight; i++) {
            const block = this.getBlock(i);

            if (!block) {
                errors.push({ block: i, error: 'Block file missing' });
                continue;
            }

            // Verify block hash
            const calculatedHash = this.calculateBlockHash(block);
            if (calculatedHash !== block.hash) {
                errors.push({
                    block: i,
                    error: 'Hash mismatch - block may be tampered',
                    expected: calculatedHash,
                    actual: block.hash
                });
            }

            // Verify merkle root
            const calculatedMerkle = this.calculateMerkleRoot(block.transactions);
            if (calculatedMerkle !== block.merkleRoot) {
                errors.push({
                    block: i,
                    error: 'Merkle root mismatch - transactions may be tampered'
                });
            }

            // Verify chain link (except genesis)
            if (i > 0) {
                const prevBlock = this.getBlock(i - 1);
                if (prevBlock && block.previousHash !== prevBlock.hash) {
                    errors.push({
                        block: i,
                        error: 'Chain broken - previousHash does not match'
                    });
                }
            }
        }

        return {
            valid: errors.length === 0,
            blocksVerified: this.state.blockHeight + 1,
            errors
        };
    }

    // ============================================
    // EXPLORER / QUERY FUNCTIONS
    // ============================================

    getStats() {
        return {
            chainId: this.state.chainId,
            blockHeight: this.state.blockHeight,
            totalBlocks: this.state.blockHeight + 1,
            totalTransactions: this.state.totalTransactions,
            latestBlockHash: this.state.latestBlockHash,
            genesisTimestamp: this.state.genesisTimestamp,
            dataDirectory: this.dataDir
        };
    }

    getRecentBlocks(limit = 10) {
        const blocks = [];
        const start = Math.max(0, this.state.blockHeight - limit + 1);

        for (let i = this.state.blockHeight; i >= start; i--) {
            const block = this.getBlock(i);
            if (block) {
                blocks.push({
                    number: block.number,
                    hash: block.hash,
                    timestamp: block.timestamp,
                    transactionCount: block.transactions.length,
                    previousHash: block.previousHash.substring(0, 16) + '...'
                });
            }
        }

        return blocks;
    }

    getRecentTransactions(limit = 20) {
        const transactions = [];

        for (let i = this.state.blockHeight; i >= 0 && transactions.length < limit; i--) {
            const block = this.getBlock(i);
            if (block) {
                for (const tx of block.transactions) {
                    transactions.push({
                        hash: tx.hash,
                        type: tx.type,
                        timestamp: tx.timestamp,
                        blockNumber: block.number,
                        blockHash: block.hash,
                        data: tx.data
                    });
                    if (transactions.length >= limit) break;
                }
            }
        }

        return transactions;
    }

    // ============================================
    // EXPORT FOR PRODUCTION MIGRATION
    // ============================================

    exportForEthereumL2() {
        // Export all transactions in format ready for Polygon/Arbitrum contract
        const allTx = [];

        for (let i = 0; i <= this.state.blockHeight; i++) {
            const block = this.getBlock(i);
            if (block) {
                block.transactions.forEach(tx => {
                    allTx.push({
                        originalHash: tx.hash,
                        type: tx.type,
                        data: JSON.stringify(tx.data),
                        timestamp: tx.timestamp,
                        localBlockNumber: block.number
                    });
                });
            }
        }

        const exportPath = path.join(this.dataDir, 'export-ethereum-l2.json');
        fs.writeFileSync(exportPath, JSON.stringify({
            exportedAt: new Date().toISOString(),
            sourceChain: this.state.chainId,
            targetChain: 'ethereum-l2',
            totalTransactions: allTx.length,
            transactions: allTx
        }, null, 2));

        console.log(`✓ Exported ${allTx.length} transactions to ${exportPath}`);
        return exportPath;
    }

    exportForHyperledger() {
        // Export in format compatible with Hyperledger Fabric chaincode
        const assets = [];

        for (let i = 0; i <= this.state.blockHeight; i++) {
            const block = this.getBlock(i);
            if (block) {
                block.transactions.forEach(tx => {
                    assets.push({
                        docType: tx.type.toLowerCase(),
                        id: tx.hash,
                        payload: tx.data,
                        createdAt: tx.timestamp,
                        creator: 'medchain-poc'
                    });
                });
            }
        }

        const exportPath = path.join(this.dataDir, 'export-hyperledger.json');
        fs.writeFileSync(exportPath, JSON.stringify({
            exportedAt: new Date().toISOString(),
            sourceChain: this.state.chainId,
            targetNetwork: 'hyperledger-fabric',
            channel: 'medchain-channel',
            chaincode: 'medchain-cc',
            assets
        }, null, 2));

        console.log(`✓ Exported ${assets.length} assets to ${exportPath}`);
        return exportPath;
    }
}

module.exports = FileBasedBlockchain;
