// pool-server.js (ECCPoW 통합 최종 완성 버전)
// WorldLand Pool 메인 서버 - ECCPoW 알고리즘 완전 지원

// 환경변수를 가장 먼저 로드
require('dotenv').config();

const express = require('express');
const http = require('http');
const https = require('https');
const socketIo = require('socket.io');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const mysql = require('mysql2');
const { testConnection } = require('./config/database');
const dbManager = require('./lib/database');
const WorldLandStratumServer = require('./lib/stratum'); // ECCPoW 지원 Stratum 서버
const ECCPoWValidator = require('./lib/eccpow'); // ECCPoW 검증기

let ACTIVATE_LOG = true;
function logIfLocal(...args) {
  if (ACTIVATE_LOG) {
    console.log(...args);
  }
}

class WorldLandPoolServer {
    constructor() {
        this.isRunning = false;
        this.app = express();
        this.server = null;
        this.io = null;
        this.db = null;
        this.dbPromise = null;
        
        // ECCPoW 모듈들
        this.eccpowValidator = new ECCPoWValidator();
        this.stratumServer = null;
        
        // 기존 모듈들
        this.modules = {
            stratum: null,
            api: null,
            stats: null,
            payout: null
        };
        
        // 연결된 클라이언트 관리
        this.connectedClients = new Set();
        
        // Synology NAS 환경 설정
        this.LOCAL_MODE = process.env.LOCAL_MODE !== 'false';
        logIfLocal(`LOCAL_MODE: ${this.LOCAL_MODE ? 'HTTP' : 'HTTPS'}`);
        
        console.log('🚀 WorldLand Pool Server 초기화 (ECCPoW 완전 지원)');
        console.log('⚡ ECCPoW 알고리즘 통합 완료');
    }

    // Express 앱 설정
    setupExpress() {
        // CORS 설정
        this.app.use(cors({
            origin: [
                "http://localhost:3000",
                "https://pool.worldlandcafe.com",
                "https://worldlandcafe.com", 
                "https://www.worldlandcafe.com"
            ],
            credentials: true,
            methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
            allowedHeaders: ['Content-Type', 'Authorization', 'user-info']
        }));

        this.app.use(express.json());
        this.setupRoutes();
    }

    // HTTP/HTTPS 서버 생성
    createServer() {
        if (this.LOCAL_MODE) {
            this.server = http.createServer(this.app);
            logIfLocal('HTTP 서버로 실행합니다.');
        } else {
            try {
                const possiblePaths = [
                    {
                        key: '/usr/syno/etc/certificate/system/default/RSA-privkey.pem',
                        cert: '/usr/syno/etc/certificate/system/default/RSA-cert.pem'
                    },
                    {
                        key: '/usr/syno/etc/certificate/system/default/privkey.pem',
                        cert: '/usr/syno/etc/certificate/system/default/cert.pem'
                    }
                ];

                let sslOptions = null;
                for (const paths of possiblePaths) {
                    if (fs.existsSync(paths.key) && fs.existsSync(paths.cert)) {
                        sslOptions = {
                            key: fs.readFileSync(paths.key),
                            cert: fs.readFileSync(paths.cert)
                        };
                        logIfLocal(`✅ SSL 인증서 발견: ${paths.key}`);
                        break;
                    }
                }

                if (sslOptions) {
                    this.server = https.createServer(sslOptions, this.app);
                    logIfLocal('✅ HTTPS 서버로 실행');
                } else {
                    throw new Error('SSL 인증서를 찾을 수 없습니다.');
                }
            } catch (error) {
                console.error('❌ SSL 설정 실패:', error.message);
                logIfLocal('HTTP 모드로 폴백합니다.');
                this.server = http.createServer(this.app);
                this.LOCAL_MODE = true;
            }
        }
    }

    // Socket.IO 설정
    setupSocketIO() {
        this.io = socketIo(this.server, {
            cors: {
                origin: [
                    "http://localhost:3000",
                    "https://pool.worldlandcafe.com",
                    "https://worldlandcafe.com", 
                    "https://www.worldlandcafe.com"
                ],
                methods: ["GET", "POST"],
                credentials: true
            }
        });

        this.io.on('connection', (socket) => {
            this.connectedClients.add(socket.id);
            console.log(`🔌 새 클라이언트 연결: ${socket.id} (총 ${this.connectedClients.size}명)`);

            this.sendInitialData(socket);

            socket.on('disconnect', () => {
                this.connectedClients.delete(socket.id);
                console.log(`❌ 클라이언트 연결 해제: ${socket.id} (남은 ${this.connectedClients.size}명)`);
            });

            socket.on('requestUpdate', () => {
                this.sendRealtimeUpdate(socket);
            });

            socket.on('requestECCPoWStats', () => {
                this.sendECCPoWStats(socket);
            });
        });

        console.log('✅ Socket.IO 서버 설정 완료');
    }

    // 데이터베이스 연결 설정
    async setupDatabase() {
        logIfLocal(`📊 데이터베이스 연결 시도: ${process.env.DB_HOST}:${process.env.DB_PORT}/worldlandpool`);
        
        this.db = mysql.createConnection({
            host: process.env.DB_HOST || 'www.doldari.com',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '#Ghwns3962',
            database: 'worldlandpool',
            port: process.env.DB_PORT || 3003,
            charset: 'utf8mb4',
            supportBigNumbers: true,
            bigNumberStrings: true
        });

        this.handleDisconnect();
        this.dbPromise = this.db.promise();
    }

    // DB 재연결 처리
    handleDisconnect() {
        this.db.connect((err) => {
            if (err) {
                console.error('Database connection failed:', err);
                setTimeout(() => this.handleDisconnect(), 5000);
            } else {
                logIfLocal('✅ MariaDB 연결 성공 (worldlandpool DB)');
            }
        });

        this.db.on('error', (err) => {
            console.error('Database error:', err);
            if (err.code === 'PROTOCOL_CONNECTION_LOST') {
                this.handleDisconnect();
            } else {
                throw err;
            }
        });
    }

    // ECCPoW Stratum 서버 설정
    async setupStratum() {
        try {
            const config = await dbManager.getPoolConfig();
            
            // ECCPoW 지원 Stratum 서버 생성
            this.stratumServer = new WorldLandStratumServer({
                port: parseInt(config.stratum_port) || 3333,
                host: '0.0.0.0',
                difficulty: parseInt(config.difficulty_target) || 1000,
                
                // WorldLand 노드 RPC 설정
                rpcHost: process.env.WORLDLAND_RPC_HOST || 'localhost',
                rpcPort: parseInt(process.env.WORLDLAND_RPC_PORT) || 8545,
                rpcUser: process.env.WORLDLAND_RPC_USER || '',
                rpcPassword: process.env.WORLDLAND_RPC_PASSWORD || ''
            });

            // 데이터베이스 연결 전달 (이 줄 추가)
            this.stratumServer.setDatabaseConnection(this.dbPromise);

            // ECCPoW 블록 발견 이벤트 처리
            this.stratumServer.on('blockFound', async (blockInfo) => {
                console.log(`🎉 ECCPoW 블록 발견!`, {
                    miner: blockInfo.miner,
                    height: blockInfo.blockHeight,
                    algorithm: blockInfo.algorithm,
                    networkType: blockInfo.networkType,
                    searchLevel: blockInfo.searchLevel,
                    weight: blockInfo.weight
                });
                
                // 풀 통계 업데이트
                await this.updatePoolStatsOnBlock(blockInfo);
                
                // 데이터베이스에 블록 기록
                await this.recordBlockFound(blockInfo);
                
                // WebSocket으로 실시간 알림
                this.broadcastBlockFound(blockInfo);
            });

            // Stratum 서버 시작
            await this.stratumServer.start();
            
            this.modules.stratum = this.stratumServer; // 기존 모듈 참조와 호환성
            
            console.log('✅ ECCPoW Stratum 서버 시작 완료');
            
        } catch (error) {
            console.error('❌ ECCPoW Stratum 서버 설정 실패:', error);
            throw error;
        }
    }

    // 블록 발견 기록 - 상세 정보 출력 강화
    async recordBlockFound(blockInfo) {
        try {
            // ===============================
            // 🏆 블록 발견 상세 정보 출력
            // ===============================
            console.log('\n' + '🎉'.repeat(80));
            console.log('🎉' + ' '.repeat(25) + '블록 발견 상세 정보' + ' '.repeat(25) + '🎉');
            console.log('🎉'.repeat(80));
            
            console.log(`📅 발견 시간: ${new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}`);
            console.log(`📅 UTC 시간: ${new Date().toISOString()}`);
            console.log(`⏰ Unix 타임스탬프: ${blockInfo.timestamp || Date.now()}`);
            
            console.log('\n🏗️  블록 기본 정보:');
            console.log(`   📏 블록 높이: #${blockInfo.blockHeight}`);
            console.log(`   🔗 블록 해시: ${blockInfo.blockHash}`);
            console.log(`   🔗 이전 블록 해시: ${blockInfo.prevBlockHash || 'N/A'}`);
            console.log(`   📊 네트워크 난이도: ${blockInfo.networkDifficulty?.toLocaleString() || 'N/A'}`);
            console.log(`   📊 풀 난이도: ${blockInfo.poolDifficulty?.toLocaleString() || 'N/A'}`);
            console.log(`   🌐 네트워크 타입: ${blockInfo.networkType || 'seoul'}`);
            console.log(`   ⚡ 알고리즘: ${blockInfo.algorithm || 'ECCPoW'}`);
            
            console.log('\n👷 채굴자 정보:');
            const minerAddress = blockInfo.miner.split('.')[0];
            const workerName = blockInfo.miner.split('.').slice(1).join('.') || 'default';
            console.log(`   🏷️  전체 식별자: ${blockInfo.miner}`);
            console.log(`   💼 채굴자 주소: ${minerAddress}`);
            console.log(`   🔧 워커 이름: ${workerName}`);
            console.log(`   💰 블록 보상: ${blockInfo.reward || 4.0} WLC`);
            
            console.log('\n⚡ ECCPoW 상세 정보:');
            console.log(`   🎲 Nonce: ${blockInfo.nonce ? '0x' + blockInfo.nonce.toString(16).padStart(16, '0') : 'N/A'}`);
            console.log(`   ⚖️  해밍 가중치: ${blockInfo.weight}`);
            console.log(`   🔍 검색 레벨: ${blockInfo.searchLevel}`);
            console.log(`   🎯 Job ID: ${blockInfo.jobId || 'N/A'}`);
            
            if (blockInfo.eccpowData) {
                console.log(`   📦 ECCPoW Codeword: ${blockInfo.eccpowData.codeword || 'N/A'}`);
                console.log(`   🔐 ECCPoW MixDigest: ${blockInfo.eccpowData.mixDigest || 'N/A'}`);
                console.log(`   📏 ECCPoW CodeLength: ${blockInfo.eccpowData.codeLength || 'N/A'}`);
            }
            
            console.log('\n🌐 네트워크 제출 정보:');
            console.log(`   📤 네트워크 제출 여부: ${blockInfo.networkSubmitted ? '✅ 성공' : '❌ 실패/미제출'}`);
            if (blockInfo.txHash) {
                console.log(`   🔗 트랜잭션 해시: ${blockInfo.txHash}`);
            }
            if (blockInfo.submitError) {
                console.log(`   ❌ 제출 오류: ${blockInfo.submitError}`);
            }
            
            console.log('\n🔍 블록 헤더 정보:');
            if (blockInfo.blockHeader) {
                console.log(`   📋 완전한 블록 헤더: ${blockInfo.blockHeader}`);
                console.log(`   📏 헤더 길이: ${blockInfo.blockHeader.length / 2} bytes`);
                
                // 블록 헤더 파싱
                try {
                    const headerBuffer = Buffer.from(blockInfo.blockHeader, 'hex');
                    console.log(`   🔧 Version: 0x${headerBuffer.slice(0, 4).toString('hex')}`);
                    console.log(`   📎 Parent Hash: 0x${headerBuffer.slice(4, 36).toString('hex')}`);
                    console.log(`   🌳 Merkle Root: 0x${headerBuffer.slice(36, 68).toString('hex')}`);
                    console.log(`   ⏰ Timestamp: ${headerBuffer.readUInt32LE(68)} (${new Date(headerBuffer.readUInt32LE(68) * 1000).toLocaleString()})`);
                    console.log(`   🎯 Difficulty Bits: 0x${headerBuffer.slice(72, 76).toString('hex')}`);
                    if (headerBuffer.length >= 80) {
                        console.log(`   🎲 Nonce 헤더: 0x${headerBuffer.slice(76, 80).toString('hex')}`);
                    }
                } catch (error) {
                    console.log(`   ❌ 헤더 파싱 오류: ${error.message}`);
                }
            }
            
            console.log('\n📊 검증 정보:');
            console.log(`   ✅ ECCPoW 검증 통과: ${blockInfo.eccpowValid !== false ? '예' : '아니오'}`);
            console.log(`   🎯 블록 기준 충족: ${blockInfo.blockValid !== false ? '예' : '아니오'}`);
            console.log(`   🔄 시뮬레이션 모드: ${blockInfo.simulated ? '예' : '아니오'}`);
            
            console.log('\n🔗 scan.worldland.foundation 비교용 정보:');
            console.log(`   📊 블록 번호: ${blockInfo.blockHeight}`);
            console.log(`   🔗 블록 해시 (확인용): ${blockInfo.blockHash}`);
            console.log(`   👷 채굴자 주소 (확인용): ${minerAddress}`);
            console.log(`   ⏰ 타임스탬프 (확인용): ${blockInfo.timestamp || Date.now()}`);
            console.log(`   🌐 네트워크 (확인용): ${blockInfo.networkType || 'seoul'}`);
            
            console.log('\n📋 풀 통계:');
            try {
                const poolStats = await dbManager.getPoolStats();
                console.log(`   🏆 총 발견 블록: ${(poolStats?.blocks_found_today || 0) + 1}개`);
                console.log(`   👥 활성 채굴자: ${poolStats?.miners_count || 0}명`);
                console.log(`   📈 풀 해시레이트: ${(poolStats?.total_hashrate || 0).toLocaleString()} H/s`);
            } catch (error) {
                console.log(`   ❌ 풀 통계 조회 오류: ${error.message}`);
                console.log(`   🏆 현재 발견 블록: 이 블록이 최신 발견 블록입니다`);
            }
            
            console.log('🎉'.repeat(80));
            console.log('\n');

            // 기존 데이터베이스 기록 로직
            const miner = await dbManager.getOrCreateMiner(minerAddress);
            
            const [result] = await this.dbPromise.execute(`
                INSERT INTO blocks (
                    miner_id, block_number, block_hash, difficulty, 
                    reward, found_at, confirmations, status, job_id,
                    algorithm, network_type, search_level, weight,
                    eccpow_codeword, eccpow_mixdigest, eccpow_codelength,
                    nonce, block_header, network_submitted, tx_hash
                ) VALUES (?, ?, ?, ?, ?, NOW(), 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                miner.id,
                blockInfo.blockHeight,
                blockInfo.blockHash || 'unknown',
                blockInfo.networkDifficulty || blockInfo.difficulty || 1000000,
                blockInfo.reward || 4.0,
                blockInfo.networkSubmitted ? 'confirmed' : 'pending',
                blockInfo.jobId || null,
                blockInfo.algorithm || 'ECCPoW',
                blockInfo.networkType || 'seoul',
                blockInfo.searchLevel || 0,
                blockInfo.weight || 0,
                blockInfo.eccpowData?.codeword || null,
                blockInfo.eccpowData?.mixDigest || null,
                blockInfo.eccpowData?.codeLength || null,
                blockInfo.nonce || null,
                blockInfo.blockHeader || null,
                blockInfo.networkSubmitted || false,
                blockInfo.txHash || null
            ]);

            // 채굴자 통계 업데이트
            await this.dbPromise.execute(`
                UPDATE miners 
                SET total_blocks_found = total_blocks_found + 1,
                    total_earned = total_earned + ?,
                    last_seen = NOW(),
                    last_block_time = NOW()
                WHERE id = ?
            `, [blockInfo.reward || 4.0, miner.id]);

            console.log(`📝 블록 데이터베이스 기록 완료 (DB ID: ${result.insertId})`);
            
        } catch (error) {
            console.error('❌ 블록 기록 오류:', error);
            console.error('스택 트레이스:', error.stack);
        }
    }

    // 초기 데이터 전송
    async sendInitialData(socket) {
        try {
            const [stats, miners, blocks] = await Promise.all([
                dbManager.getPoolStats(),
                dbManager.getActiveMiners(),
                this.getRecentBlocks()
            ]);

            const stratumStats = this.stratumServer?.getStats() || {};
            const eccpowStats = await this.eccpowValidator.healthCheck();

            socket.emit('initialData', {
                poolStats: stats || {},
                activeMiners: miners || [],
                recentBlocks: blocks || [],
                stratumStats,
                eccpowStats,
                algorithm: 'ECCPoW',
                timestamp: Date.now()
            });

        } catch (error) {
            console.error('❌ 초기 데이터 전송 오류:', error);
        }
    }

    // ECCPoW 통계 전송
    async sendECCPoWStats(socket) {
        try {
            const eccpowHealth = await this.eccpowValidator.healthCheck();
            const eccpowInfo = this.eccpowValidator.getStats();
            const networkInfo = await this.stratumServer?.getNetworkInfo?.() || {};

            socket.emit('eccpowStats', {
                health: eccpowHealth,
                info: eccpowInfo,
                network: networkInfo,
                timestamp: Date.now()
            });

        } catch (error) {
            console.error('❌ ECCPoW 통계 전송 오류:', error);
        }
    }

    // 실시간 업데이트 전송
    async sendRealtimeUpdate(socket = null) {
        try {
            const [stats, miners] = await Promise.all([
                dbManager.getPoolStats(),
                dbManager.getActiveMiners()
            ]);

            const stratumStats = this.stratumServer?.getStats() || {};
            const connectedMiners = this.stratumServer?.getConnectedMiners() || [];
            const eccpowHealth = await this.eccpowValidator.healthCheck();

            // 최근 ECCPoW 활동 조회
            const [recentECCPoWActivity] = await this.dbPromise.execute(`
                SELECT 
                    COUNT(*) as recent_shares,
                    AVG(weight) as avg_weight,
                    COUNT(CASE WHEN eccpow_codeword IS NOT NULL THEN 1 END) as client_shares
                FROM shares 
                WHERE algorithm = 'ECCPoW' 
                AND submitted_at > DATE_SUB(NOW(), INTERVAL 1 HOUR)
            `);

            const updateData = {
                type: 'statsUpdate',
                payload: {
                    poolStats: stats || {},
                    activeMiners: miners || [],
                    connectedMiners: connectedMiners,
                    stratumStats,
                    eccpowHealth,
                    algorithm: 'ECCPoW',
                    timestamp: Date.now(),
                    eccpowActivity: recentECCPoWActivity[0] || {}
                }
            };

            if (socket) {
                socket.emit('realtimeUpdate', updateData);
            } else {
                this.io.emit('realtimeUpdate', updateData);
            }

        } catch (error) {
            console.error('❌ 실시간 업데이트 전송 오류:', error);
        }
    }

    // ECCPoW 블록 발견 알림
    broadcastBlockFound(blockInfo) {
        const announcement = {
            type: 'blockFound',
            payload: {
                blockNumber: blockInfo.blockHeight,
                blockHash: blockInfo.blockHash,  
                miner: blockInfo.miner,
                algorithm: 'ECCPoW',
                networkType: blockInfo.networkType,
                searchLevel: blockInfo.searchLevel,
                weight: blockInfo.weight,
                reward: 4.0,
                timestamp: blockInfo.timestamp,
                simulated: blockInfo.simulated || false
            }
        };

        this.io.emit('realtimeUpdate', announcement);
        console.log(`📢 ECCPoW 블록 발견 알림 브로드캐스트: #${blockInfo.blockHeight} (레벨: ${blockInfo.searchLevel}, 네트워크: ${blockInfo.networkType})`);
    }

    // API 라우트 설정 (ECCPoW 정보 포함)
    setupRoutes() {
        // 풀 상태 API (ECCPoW 정보 포함)
        this.app.get('/api/pool/status', async (req, res) => {
            try {
                const stats = await dbManager.getPoolStats();
                const config = await dbManager.getPoolConfig();
                const stratumStats = this.stratumServer?.getStats() || {};
                const connectedMiners = this.stratumServer?.getConnectedMiners() || [];
                const eccpowHealth = await this.eccpowValidator.healthCheck();
                const networkInfo = await this.stratumServer?.getNetworkInfo?.() || {};
                
                res.json({
                    success: true,
                    pool: {
                        name: config.pool_name,
                        url: config.pool_url,
                        fee: config.pool_fee + '%',
                        minPayout: config.min_payout + ' WLC',
                        algorithm: 'ECCPoW',
                        blockTime: networkInfo.blockTime || 10,
                        blockReward: 4.0
                    },
                    stats: {
                        hashrate: stats?.total_hashrate || 0,
                        miners: connectedMiners.length,
                        blocks: stats?.blocks_found_today || 0,
                        lastBlock: stats?.last_block_time || null,
                        shares: stratumStats.validShares || 0
                    },
                    stratum: {
                        host: 'doldari.com',
                        port: config.stratum_port || 3333,
                        connections: stratumStats.activeConnections || 0,
                        authorized: stratumStats.authorizedConnections || 0,
                        status: this.stratumServer?.isRunning ? 'running' : 'stopped',
                        shareAcceptanceRate: stratumStats.shareAcceptanceRate || '0%',
                        algorithm: 'ECCPoW'
                    },
                    eccpow: {
                        status: eccpowHealth.status,
                        validations: stratumStats.eccpowValidations || 0,
                        failures: stratumStats.eccpowFailures || 0,
                        successRate: stratumStats.eccpowValidationRate || '0%',
                        networkType: networkInfo.networkType || 'unknown'
                    },
                    network: networkInfo,
                    websocket: {
                        connected: this.connectedClients.size,
                        status: 'active'
                    }
                });
            } catch (error) {
                console.error('풀 상태 API 오류:', error);
                res.status(500).json({
                    success: false,
                    error: '풀 상태 조회 실패'
                });
            }
        });

        // 채굴자 통계 API (ECCPoW 정보 포함)
        this.app.get('/api/pool/miners', async (req, res) => {
            try {
                const miners = await dbManager.getActiveMiners();
                const connectedMiners = this.stratumServer?.getConnectedMiners() || [];
                
                // DB 정보와 연결 정보 결합
                const minersWithConnection = miners.map(miner => {
                    const connectedMiner = connectedMiners.find(
                        cm => cm.address === miner.address
                    );
                    
                    return {
                        address: miner.address,
                        worker: miner.worker_name,
                        shares: miner.valid_shares,
                        blocks: miner.total_blocks_found,
                        lastSeen: miner.last_seen,
                        connected: !!connectedMiner,
                        ip: connectedMiner?.ip || null,
                        currentShares: connectedMiner?.validShares || 0,
                        algorithm: 'ECCPoW',
                        networkType: connectedMiner?.networkType || 'unknown'
                    };
                });
                
                res.json({
                    success: true,
                    count: minersWithConnection.length,
                    algorithm: 'ECCPoW',
                    miners: minersWithConnection
                });
            } catch (error) {
                console.error('채굴자 통계 API 오류:', error);
                res.status(500).json({
                    success: false,
                    error: '채굴자 통계 조회 실패'
                });
            }
        });

        // ECCPoW 통계 API
        // ECCPoW 통계 API
        this.app.get('/api/pool/eccpow', async (req, res) => {
            try {
                const stratumStats = this.stratumServer?.getStats() || {};
                const eccpowHealth = await this.eccpowValidator.healthCheck();
                const eccpowInfo = this.eccpowValidator.getStats();
                const networkInfo = await this.stratumServer?.getNetworkInfo?.() || {};
                
                // ECCPoW 상세 통계 조회
                const [eccpowDetailStats] = await this.dbPromise.execute(`
                    SELECT 
                        COUNT(*) as total_shares,
                        COUNT(CASE WHEN is_valid = TRUE THEN 1 END) as valid_shares,
                        COUNT(CASE WHEN eccpow_codeword IS NOT NULL THEN 1 END) as client_provided_shares,
                        AVG(CASE WHEN weight IS NOT NULL THEN weight END) as avg_weight,
                        MIN(CASE WHEN weight IS NOT NULL THEN weight END) as best_weight
                    FROM shares 
                    WHERE algorithm = 'ECCPoW' 
                    AND submitted_at > DATE_SUB(NOW(), INTERVAL 24 HOUR)
                `);
                
                res.json({
                    success: true,
                    eccpow: {
                        algorithm: 'ECCPoW',
                        version: eccpowInfo.version,
                        health: eccpowHealth,
                        validations: {
                            total: stratumStats.eccpowValidations || 0,
                            successful: (stratumStats.eccpowValidations || 0) - (stratumStats.eccpowFailures || 0),
                            failed: stratumStats.eccpowFailures || 0,
                            successRate: stratumStats.eccpowValidationRate || '0%',
                            clientProvidedShares: eccpowDetailStats[0]?.client_provided_shares || 0
                        },
                        shares: {
                            submitted: stratumStats.sharesSubmitted || 0,
                            valid: stratumStats.validShares || 0,
                            invalid: stratumStats.invalidShares || 0,
                            acceptanceRate: stratumStats.shareAcceptanceRate || '0%'
                        },
                        blocks: {
                            found: stratumStats.blocksFound || 0
                        },
                        network: networkInfo
                    }
                });
            } catch (error) {
                console.error('ECCPoW 통계 API 오류:', error);
                res.status(500).json({
                    success: false,
                    error: 'ECCPoW 통계 조회 실패'
                });
            }
        });

        // 개별 채굴자 정보 API
        this.app.get('/api/pool/miner/:address', async (req, res) => {
            try {
                const { address } = req.params;
                
                if (!this.isValidAddress(address)) {
                    return res.status(400).json({
                        success: false,
                        error: '올바르지 않은 주소 형식'
                    });
                }
                
                const miner = await dbManager.getOrCreateMiner(address);
                const connectedMiner = this.stratumServer?.getConnectedMiners()
                    ?.find(cm => cm.address === address);
                
                // 채굴자의 블록 내역 조회
                const [blocks] = await this.dbPromise.execute(`
                    SELECT * FROM blocks WHERE miner_id = ? ORDER BY found_at DESC LIMIT 10
                `, [miner.id]);
                
                res.json({
                    success: true,
                    miner: {
                        address: miner.address,
                        workerName: miner.worker_name,
                        totalShares: miner.total_shares,
                        validShares: miner.valid_shares,
                        invalidShares: miner.total_shares - miner.valid_shares,
                        blocksFound: miner.total_blocks_found,
                        totalRewards: miner.total_rewards || 0,
                        firstSeen: miner.first_seen,
                        lastSeen: miner.last_seen,
                        isOnline: !!connectedMiner,
                        currentShares: connectedMiner?.validShares || 0,
                        algorithm: 'ECCPoW',
                        networkType: connectedMiner?.networkType || 'unknown',
                        recentBlocks: blocks
                    }
                });
            } catch (error) {
                console.error('개별 채굴자 API 오류:', error);
                res.status(500).json({
                    success: false,
                    error: '채굴자 정보 조회 실패'
                });
            }
        });

        // 블록 발견 내역 API
        this.app.get('/api/pool/blocks', async (req, res) => {
            try {
                const limit = parseInt(req.query.limit) || 50;
                const blocks = await this.getRecentBlocks(limit);
                
                res.json({
                    success: true,
                    count: blocks.length,
                    algorithm: 'ECCPoW',
                    blocks: blocks
                });
            } catch (error) {
                console.error('블록 내역 API 오류:', error);
                res.status(500).json({
                    success: false,
                    error: '블록 내역 조회 실패'
                });
            }
        });

        // Stratum 서버 통계 API
        this.app.get('/api/pool/stratum', async (req, res) => {
            try {
                const stratumStats = this.stratumServer?.getStats() || {};
                const stratumHealth = await this.stratumServer?.healthCheck?.() || {};
                
                res.json({
                    success: true,
                    stratum: {
                        running: this.stratumServer?.isRunning || false,
                        port: this.stratumServer?.port || 3333,
                        algorithm: 'ECCPoW',
                        health: stratumHealth,
                        stats: stratumStats
                    }
                });
            } catch (error) {
                console.error('Stratum 통계 API 오류:', error);
                res.status(500).json({
                    success: false,
                    error: 'Stratum 통계 조회 실패'
                });
            }
        });

        // 채굴 시뮬레이션 API (테스트용)
        this.app.post('/api/pool/simulate', async (req, res) => {
            try {
                const { difficulty, maxAttempts = 100 } = req.body;
                
                const blockHeader = Buffer.from('test_header_' + Date.now());
                const result = await this.eccpowValidator.simulateMining(
                    blockHeader,
                    difficulty || 1000,
                    1, // Seoul 네트워크
                    maxAttempts
                );
                
                res.json({
                    success: true,
                    simulation: result
                });
                
            } catch (error) {
                console.error('채굴 시뮬레이션 오류:', error);
                res.status(500).json({
                    success: false,
                    error: '채굴 시뮬레이션 실패'
                });
            }
        });

        // 건강 상태 체크 API (ECCPoW 정보 포함)
        this.app.get('/api/pool/health', async (req, res) => {
            try {
                const health = await dbManager.healthCheck();
                const stratumRunning = this.stratumServer?.isRunning || false;
                const stratumHealth = await this.stratumServer?.healthCheck?.() || {};
                const eccpowHealth = await this.eccpowValidator.healthCheck();
                
                const overallStatus = health.status === 'healthy' && 
                    stratumRunning && 
                    stratumHealth.status === 'healthy' && 
                    eccpowHealth.status === 'healthy' ? 'healthy' : 'degraded';
                
                res.json({
                    success: true,
                    status: overallStatus,
                    timestamp: new Date().toISOString(),
                    server: 'WorldLand Pool Server',
                    version: '2.0.0',
                    algorithm: 'ECCPoW',
                    components: {
                        database: health.status,
                        stratum: stratumRunning ? 'running' : 'stopped',
                        websocket: this.io ? 'running' : 'stopped',
                        eccpowValidator: eccpowHealth.status,
                        worldlandNode: stratumHealth.networkConnected ? 'connected' : 'disconnected',
                        connectedClients: this.connectedClients.size,
                        api: 'running'
                    },
                    details: {
                        database: health,
                        stratum: stratumHealth,
                        eccpow: eccpowHealth
                    }
                });
            } catch (error) {
                res.status(500).json({
                    success: false,
                    status: 'unhealthy',
                    algorithm: 'ECCPoW',
                    error: error.message
                });
            }
        });

        // 관리자 API들
        this.app.post('/api/admin/difficulty', async (req, res) => {
            try {
                const { difficulty } = req.body;
                
                if (!difficulty || difficulty < 1) {
                    return res.status(400).json({
                        success: false,
                        error: '유효하지 않은 난이도'
                    });
                }
                
                this.stratumServer?.broadcastDifficulty(difficulty);
                
                res.json({
                    success: true,
                    message: `난이도가 ${difficulty}로 변경되었습니다`
                });
                
            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: '난이도 변경 실패'
                });
            }
        });

        this.app.post('/api/admin/ban/:address', async (req, res) => {
            try {
                const { address } = req.params;
                const { reason } = req.body;
                
                this.stratumServer?.banWorker(address, reason || 'Manual ban');
                
                res.json({
                    success: true,
                    message: `워커 ${address}가 차단되었습니다`
                });
                
            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: '워커 차단 실패'
                });
            }
        });
    }

    // 주소 유효성 검사
    isValidAddress(address) {
        const addressRegex = /^0x[a-fA-F0-9]{40}$/;
        return addressRegex.test(address);
    }

    // 서버 초기화 (ECCPoW 지원)
    async initialize() {
        console.log('🚀 WorldLand Pool Server 초기화 중 (ECCPoW 완전 지원)...');
        
        try {
            // 1. Express 앱 설정
            this.setupExpress();
            
            // 2. HTTP/HTTPS 서버 생성
            this.createServer();
            
            // 3. Socket.IO 설정
            this.setupSocketIO();
            
            // 4. 데이터베이스 연결
            await this.setupDatabase();

            // 5. 데이터베이스 연결 테스트
            const dbConnected = await testConnection();
            if (!dbConnected) {
                throw new Error('데이터베이스 연결 실패');
            }

            // 6. ECCPoW 검증기 초기화 및 테스트
            const eccpowHealth = await this.eccpowValidator.healthCheck();
            if (eccpowHealth.status !== 'healthy') {
                console.warn('⚠️ ECCPoW 검증기 상태 불량, 제한된 기능으로 시작');
            }

            // 7. 풀 설정 로드
            const config = await dbManager.getPoolConfig();
            console.log('⚙️  풀 설정 로드 완료:', {
                fee: config.pool_fee + '%',
                minPayout: config.min_payout + ' WLC',
                stratumPort: config.stratum_port,
                algorithm: 'ECCPoW'
            });

            // 8. 기본 통계 초기화
            await this.initializeStats();

            // 9. ECCPoW Stratum 서버 설정 및 시작
            await this.setupStratum();

            console.log('✅ ECCPoW 풀 서버 초기화 완료!');
            return true;

        } catch (error) {
            console.error('❌ ECCPoW 풀 서버 초기화 실패:', error.message);
            return false;
        }
    }

    // 통계 초기화
    async initializeStats() {
        try {
            const stats = await dbManager.getPoolStats();
            if (!stats) {
                await dbManager.updatePoolStats(0, 0, 0, 0);
                console.log('📊 ECCPoW 풀 통계 초기화 완료');
            } else {
                console.log('📊 기존 ECCPoW 풀 통계 로드:', {
                    hashrate: stats.total_hashrate + ' H/s',
                    miners: stats.miners_count,
                    blocks: stats.blocks_found_today,
                    algorithm: 'ECCPoW'
                });
            }
        } catch (error) {
            console.error('❌ ECCPoW 통계 초기화 오류:', error);
        }
    }

    // 정기적 통계 업데이트 및 WebSocket 브로드캐스트
    startStatsUpdater() {
        // 30초마다 통계 업데이트 및 브로드캐스트
        this.statsInterval = setInterval(async () => {
            try {
                await this.updateRealtimeStats();
                await this.sendRealtimeUpdate();
            } catch (error) {
                console.error('❌ ECCPoW 통계 업데이트 오류:', error);
            }
        }, 30000);
    }

    // 실시간 통계 업데이트
    async updateRealtimeStats() {
        try {
            const stratumStats = this.stratumServer?.getStats() || {};
            const connectedMiners = this.stratumServer?.getConnectedMiners() || [];
            
            // ECCPoW 기반 해시레이트 추정
            const estimatedHashrate = this.calculatePoolHashrate(connectedMiners, stratumStats);
            
            const stats = await dbManager.getPoolStats();
            
            // 네트워크 정보 가져오기
            const networkInfo = await this.stratumServer?.getNetworkInfo?.() || {};
            
            await dbManager.updatePoolStats(
                estimatedHashrate,
                connectedMiners.length,
                stats?.blocks_found_today || 0,
                networkInfo?.currentDifficulty || 1000000000000000
            );
            
        } catch (error) {
            console.error('❌ ECCPoW 실시간 통계 업데이트 오류:', error);
        }
    }
 
    // 정기적인 채굴자 상태 업데이트 시작
    startMinerStatusUpdater() {
        // 1분마다 활성 채굴자 상태 업데이트
        setInterval(async () => {
            await this.updateMinerStatus();
        }, 60000);
        
        console.log('📊 채굴자 상태 업데이터 시작 (1분 간격)');
    }

    // 채굴자 상태 업데이트
    async updateMinerStatus() {
        try {
            const connectedMiners = this.stratumServer?.getConnectedMiners() || [];
            const activeAddresses = connectedMiners.map(miner => miner.address);
            
            if (activeAddresses.length > 0) {
                // 현재 연결된 채굴자들을 활성 상태로 업데이트 (기존 컬럼만 사용)
                await this.dbPromise.execute(`
                    UPDATE miners 
                    SET is_active = TRUE, last_seen = NOW()
                    WHERE address IN (${activeAddresses.map(() => '?').join(',')})
                `, activeAddresses);
                
                console.log(`📊 활성 채굴자 업데이트: ${activeAddresses.length}명`);
            }
            
            // 15분 이상 비활성인 채굴자들을 비활성 상태로 업데이트
            const [inactiveResult] = await this.dbPromise.execute(`
                UPDATE miners 
                SET is_active = FALSE
                WHERE last_seen < DATE_SUB(NOW(), INTERVAL 15 MINUTE)
                AND is_active = TRUE
            `);
            
            if (inactiveResult.affectedRows > 0) {
                console.log(`📊 비활성 채굴자 업데이트: ${inactiveResult.affectedRows}명`);
            }
            
        } catch (error) {
            console.error('❌ 채굴자 상태 업데이트 오류:', error);
        }
    }

    // ECCPoW 기반 풀 해시레이트 계산
    calculatePoolHashrate(connectedMiners, stratumStats) {
        // ECCPoW는 share 기반 해시레이트 계산이 다름
        const validShares = stratumStats.validShares || 0;
        const timeWindow = 60; // 1분
        const avgDifficulty = stratumStats.difficulty || 1000;
        
        // ECCPoW 특성을 고려한 해시레이트 추정
        const sharesPerSecond = validShares / timeWindow;
        const eccpowHashrate = Math.floor(sharesPerSecond * avgDifficulty * 0.8); // ECCPoW 보정 계수
        
        return eccpowHashrate;
    }

    // 최근 블록 조회 (ECCPoW 정보 포함)
    async getRecentBlocks(limit = 10) {
        try {
            const [rows] = await this.dbPromise.execute(`
                SELECT b.*, m.address as miner_address 
                FROM blocks b 
                JOIN miners m ON b.miner_id = m.id 
                ORDER BY b.found_at DESC 
                LIMIT ?
            `, [limit]);
            
            // ECCPoW 정보 추가
            return rows.map(block => ({
                ...block,
                algorithm: 'ECCPoW'
            }));
        } catch (error) {
            console.error('❌ 최근 블록 조회 오류:', error);
            return [];
        }
    }

    // ECCPoW 블록 발견시 풀 통계 업데이트
    async updatePoolStatsOnBlock(blockInfo) {
        try {
            const stats = await dbManager.getPoolStats();
            const newBlocksToday = (stats?.blocks_found_today || 0) + 1;
            
            await dbManager.updatePoolStats(
                stats?.total_hashrate || 0,
                stats?.miners_count || 0,
                newBlocksToday,
                stats?.network_difficulty || 0
            );
            
            console.log(`📊 ECCPoW 풀 통계 업데이트: 오늘 발견 블록 ${newBlocksToday}개 (레벨: ${blockInfo.searchLevel}, 네트워크: ${blockInfo.networkType})`);
            
        } catch (error) {
            console.error('❌ ECCPoW 풀 통계 업데이트 오류:', error);
        }
    }

    // 서버 시작 (ECCPoW 버전)
    async start() {
        console.log('\n🌟 ========================================');
        console.log('🌟  WorldLand Mining Pool Server v2.0');
        console.log('🌟  ECCPoW 알고리즘 완전 지원 버전');
        console.log('🌟  Database: MariaDB on Synology NAS');
        console.log('🌟  Integration: WorldLandCafe Server');
        console.log('🌟 ========================================\n');

        // 환경변수 확인
        console.log('🔧 환경변수 확인:');
        console.log(`   - WORLDLAND_RPC_HOST: ${process.env.WORLDLAND_RPC_HOST || 'localhost'}`);
        console.log(`   - WORLDLAND_RPC_PORT: ${process.env.WORLDLAND_RPC_PORT || '8545'}`);
        console.log(`   - DB_HOST: ${process.env.DB_HOST || 'www.doldari.com'}`);
        console.log(`   - ALGORITHM: ECCPoW`);

        // 초기화
        const initialized = await this.initialize();
        if (!initialized) {
            process.exit(1);
        }

        try {
            const PORT = process.env.POOL_PORT || 3003;
            
            this.server.listen(PORT, () => {
                const protocol = this.LOCAL_MODE ? 'HTTP' : 'HTTPS';
                console.log(`🚀 WorldLand ECCPoW Pool Server가 포트 ${PORT}에서 ${protocol}로 실행 중입니다.`);
                console.log(`📊 데이터베이스: ${process.env.DB_HOST}:${process.env.DB_PORT}/worldlandpool`);
                console.log(`🔗 WorldLand 노드: ${process.env.WORLDLAND_RPC_HOST || 'localhost'}:${process.env.WORLDLAND_RPC_PORT || '8545'}`);
                console.log(`🌐 CORS 허용: pool.worldlandcafe.com, localhost:3000`);
                console.log(`🔒 SSL 모드: ${!this.LOCAL_MODE ? '활성화' : '비활성화'}`);
                console.log(`📡 WebSocket: 실시간 통신 활성화`);
                console.log(`⚡ 알고리즘: ECCPoW (다중 네트워크 지원)`);
            });

            this.isRunning = true;

            // 서버 상태 표시
            this.showServerStatus();

            // 정기적 통계 업데이트 시작
            this.startStatsUpdater();

            // ✅ 추가: 채굴자 상태 업데이터 시작
            this.startMinerStatusUpdater();

            // 정기 상태 체크 (5분마다)
            setInterval(() => {
                this.healthCheck();
            }, 5 * 60 * 1000);

            console.log('\n🎉 WorldLand ECCPoW Pool Server 시작 완료!');
            console.log('📍 풀 API: http://www.doldari.com:3003/api/pool/');
            console.log('📍 프론트엔드: https://pool.worldlandcafe.com');
            console.log(`📍 Stratum: doldari.com:${this.stratumServer?.port || 3333}`);
            console.log('📍 WebSocket: 실시간 통신 지원');
            console.log('📍 ECCPoW 알고리즘: 완전 지원 (Default, Seoul, Annapurna)');
            console.log('📍 관리자 API: /api/admin/');

        } catch (error) {
            console.error('❌ 서버 시작 실패:', error);
            process.exit(1);
        }

        
    }

    // 서버 상태 표시 (ECCPoW 버전)
    async showServerStatus() {
        const stratumStatus = this.stratumServer?.isRunning ? '실행 중' : '중지됨';
        const websocketStatus = this.io ? '실행 중' : '중지됨';
        const eccpowHealth = await this.eccpowValidator.healthCheck();
        const networkInfo = await this.stratumServer?.getNetworkInfo?.() || {};
        
        console.log('\n📊 ECCPoW 풀 서버 상태:');
        console.log('├─ 🔗 데이터베이스: 연결됨');
        console.log('├─ 🌐 HTTP API: 실행 중');
        console.log(`├─ ⚡ ECCPoW Stratum: ${stratumStatus}`);
        console.log(`├─ 📡 WebSocket: ${websocketStatus}`);
        console.log(`├─ 🏗️  WorldLand 노드: ${networkInfo.connected ? '연결됨' : '연결 안됨'}`);
        console.log('├─ 📈 통계 시스템: 실행 중');
        console.log(`├─ 🔍 ECCPoW 검증기: ${eccpowHealth.status}`);
        console.log(`├─ 🌏 지원 네트워크: ${eccpowHealth.networkSupport ? Object.keys(eccpowHealth.networkSupport).join(', ') : 'Default, Seoul'}`);
        console.log('├─ 👥 관리자 API: 활성화');
        console.log('└─ 💰 지불 시스템: 준비 중 (다음 구현)');
    }

    // 건강 상태 체크 (ECCPoW 버전)
    async healthCheck() {
        try {
            const dbHealth = await dbManager.healthCheck();
            const stratumRunning = this.stratumServer?.isRunning || false;
            const websocketRunning = !!this.io;
            const stratumHealth = await this.stratumServer?.healthCheck?.() || {};
            const eccpowHealth = await this.eccpowValidator.healthCheck();
            const timestamp = new Date().toISOString();
            
            if (dbHealth.status === 'healthy' && 
                stratumRunning && 
                websocketRunning && 
                eccpowHealth.status === 'healthy') {
                console.log(`✅ [${timestamp}] ECCPoW 풀 서버 상태 정상 (연결된 클라이언트: ${this.connectedClients.size}명, 노드: ${stratumHealth.networkConnected ? '연결됨' : '연결 안됨'})`);
            } else {
                console.log(`⚠️  [${timestamp}] ECCPoW 서버 문제:`, {
                    database: dbHealth.status,
                    stratum: stratumRunning ? 'ok' : 'stopped',
                    websocket: websocketRunning ? 'ok' : 'stopped',
                    worldlandNode: stratumHealth.networkConnected ? 'connected' : 'disconnected',
                    eccpowValidator: eccpowHealth.status
                });
            }
        } catch (error) {
            console.error('❌ ECCPoW 건강 상태 체크 오류:', error);
        }
    }

    // 우아한 종료 (ECCPoW 버전)
    async shutdown() {
        console.log('\n🛑 WorldLand ECCPoW Pool Server 종료 중...');
        this.isRunning = false;

        try {
            // 통계 업데이트 중지
            if (this.statsInterval) {
                clearInterval(this.statsInterval);
            }

            // ✅ 추가: 채굴자 상태 업데이터 중지
            if (this.minerStatusInterval) {
                clearInterval(this.minerStatusInterval);
            }

            // WebSocket 연결 종료
            if (this.io) {
                this.io.close();
                console.log('✅ WebSocket 서버 종료');
            }

            // ECCPoW Stratum 서버 종료
            if (this.stratumServer) {
                await this.stratumServer.stop();
                console.log('✅ ECCPoW Stratum 서버 종료');
            }

            // HTTP 서버 종료
            if (this.server) {
                this.server.close();
                console.log('✅ HTTP 서버 종료');
            }

            // DB 연결 종료
            if (this.db) {
                this.db.end();
                console.log('✅ DB 연결 종료');
            }

            console.log('✅ ECCPoW 풀 서버 정상 종료 완료');
            process.exit(0);
        } catch (error) {
            console.error('❌ ECCPoW 서버 종료 중 오류:', error);
            process.exit(1);
        }
    }

    // 디버그 정보
    getDebugInfo() {
        return {
            server: 'WorldLand Pool Server',
            version: '2.0.0',
            algorithm: 'ECCPoW',
            isRunning: this.isRunning,
            uptime: Date.now() - (this.startTime || Date.now()),
            modules: {
                express: !!this.app,
                socketio: !!this.io,
                database: !!this.db,
                stratum: !!this.stratumServer,
                eccpow: !!this.eccpowValidator
            },
            connections: {
                websocket: this.connectedClients.size,
                stratum: this.stratumServer?.getStats?.()?.activeConnections || 0
            },
            stats: this.stratumServer?.getStats?.() || {},
            eccpow: this.eccpowValidator?.getStats?.() || {}
        };
    }
}

// 서버 인스턴스 생성 및 시작
const poolServer = new WorldLandPoolServer();

// 프로세스 시그널 처리
process.on('SIGINT', () => poolServer.shutdown());
process.on('SIGTERM', () => poolServer.shutdown());

// 처리되지 않은 예외 처리
process.on('uncaughtException', (error) => {
    console.error('❌ 처리되지 않은 예외:', error);
    poolServer.shutdown();
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ 처리되지 않은 Promise 거부:', reason);
    poolServer.shutdown();
});

// 서버 시작
if (require.main === module) {
    poolServer.startTime = Date.now();
    poolServer.start().catch(console.error);
}

module.exports = WorldLandPoolServer;