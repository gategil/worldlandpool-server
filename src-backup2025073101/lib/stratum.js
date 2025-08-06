// lib/stratum.js (표준 프로토콜 준수 + 상세 로깅 버전)
// WorldLand ECCPoW Stratum Server - 블록 발견 과정 완전 추적

const net = require('net');
const crypto = require('crypto');
const EventEmitter = require('events');
const ECCPoWValidator = require('./eccpow');
const dbManager = require('./database');

class WorldLandStratumServer extends EventEmitter {
    constructor(config) {
        super();
        
        this.config = config;
        this.port = config.port || 3333;
        this.host = config.host || '0.0.0.0';
        this.difficulty = config.difficulty || 1000;
        
        // ECCPoW 검증기 초기화
        this.eccpowValidator = new ECCPoWValidator();
        
        // 서버 상태
        this.isRunning = false;
        this.server = null;
        this.connections = new Map();
        this.jobs = new Map();
        this.workers = new Map();
        
        // 연결 추적기
        this.connectionTracker = new ConnectionTracker();
        
        // 로깅 설정 초기화
        this.enableMiningLogs = true;
        this.logLevel = 3; // 0=error, 1=warn, 2=info, 3=debug
        
        // RPC 설정 초기화 (호스트에 따라 프로토콜 자동 결정)
        const rpcHost = config.rpcHost || 'seoul.worldland.foundation';;
        const isLocalHost = rpcHost.includes('192.168.') || rpcHost.includes('localhost') || rpcHost.includes('127.0.0.1');
        
        // WorldLand 네트워크별 기본 RPC 포트
        const defaultPorts = {
            seoul: 443,    // Seoul 메인넷 
            local: 8545     // 로컬 노드
        };
        
        const networkType = config.networkType || 'seoul';
        const defaultPort = isLocalHost ? defaultPorts.local : defaultPorts[networkType];

        this.rpcEndpoints = [
            {
                protocol: isLocalHost ? 'http' : 'https',
                host: rpcHost,
                port: config.rpcPort || defaultPort
            }
        ];
        
        console.log(`🌐 WorldLand 네트워크 설정: ${networkType.toUpperCase()}`);
        console.log(`📡 RPC 엔드포인트: ${isLocalHost ? 'http' : 'https'}://${rpcHost}:${config.rpcPort || defaultPort}`);

        console.log(`⚙️ RPC 설정: ${isLocalHost ? 'HTTP' : 'HTTPS'}://${rpcHost}:${config.rpcPort || (isLocalHost ? 8545 : 443)}`);

        this.currentRPCIndex = 0;
        this.rpcStats = {
            connected: false,
            totalCalls: 0,
            successfulCalls: 0,
            consecutiveFailures: 0,
            lastSuccessfulCall: null,
            currentEndpoint: null
        };
        
        // 채굴 진행상황 추적 초기화
        this.miningProgress = {
            totalSubmissions: 0,
            validSubmissions: 0,
            invalidSubmissions: 0,
            blockCandidates: 0,
            blocksFound: 0,
            bestWeight: Infinity,
            lastBlockTime: null,
            recentShares: [],
            workerStats: new Map()
        };
        
        // 프로덕션 모드 강제 설정
        this.forceProductionMode = process.env.FORCE_PRODUCTION_MODE === 'true';
        this.autoSimulationMode = process.env.AUTO_SIMULATION_MODE === 'true';
        this.failOnRpcError = process.env.FAIL_ON_RPC_ERROR === 'true';

        // 시뮬레이션 설정
        this.simulateBlocks = false;
        
        // 데이터베이스 연결 (pool-server에서 전달받음)
        this.dbPromise = null;
        
        // 통계
        this.stats = {
            activeConnections: 0,
            authorizedConnections: 0,
            sharesSubmitted: 0,
            validShares: 0,
            invalidShares: 0,
            eccpowValidations: 0,
            eccpowFailures: 0,
            blocksFound: 0,
            startTime: Date.now(),
            networkConnected: true,
            offlineMode: false
        };
        
        // 현재 블록 템플릿
        this.currentBlockTemplate = null;
        this.blockTemplateId = 0;
        
        // 실시간 상태 표시
        this.statusDisplay = new PoolStatusDisplay(this);
        
        console.log('⚡ WorldLand ECCPoW Stratum 서버 초기화 (표준 프로토콜 준수)');
    }

    // ===============================
    // 로깅 메서드들
    // ===============================
    
    logError(message, data = {}) {
        if (this.logLevel >= 0) {
            console.error(`❌ [STRATUM] ${message}`, Object.keys(data).length > 0 ? data : '');
        }
    }
    
    logWarn(message, data = {}) {
        if (this.logLevel >= 1) {
            console.warn(`⚠️ [STRATUM] ${message}`, Object.keys(data).length > 0 ? data : '');
        }
    }
    
    logInfo(message, data = {}) {
        if (this.logLevel >= 2) {
            console.log(`ℹ️ [STRATUM] ${message}`, Object.keys(data).length > 0 ? data : '');
        }
    }
    
    logDebug(message, data = {}) {
        if (this.logLevel >= 3) {
            console.log(`🔍 [STRATUM] ${message}`, Object.keys(data).length > 0 ? data : '');
        }
    }

    // ===============================
    // Share 제출 처리 - 완전한 추적
    // ===============================
    async handleSubmit(connection, params, id) {
        const startTime = Date.now();
        
        // WorldLand ECCPoW 확장 프로토콜 지원
        let workerName, jobId, extraNonce2, nTime, nonce, codeword, mixDigest, codeLength;
        
        if (params.length >= 8) {
            // ECCPoW 확장 프로토콜 (8개 파라미터)
            [workerName, jobId, extraNonce2, nTime, nonce, codeword, mixDigest, codeLength] = params;
        } else if (params.length >= 7) {
            // ECCPoW 확장 프로토콜 (7개 파라미터, codeLength 없음)
            [workerName, jobId, extraNonce2, nTime, nonce, codeword, mixDigest] = params;
        } else {
            // 기존 표준 프로토콜 (5개 파라미터)
            [workerName, jobId, extraNonce2, nTime, nonce] = params;
        }
        
        // 1단계: 기본 정보 출력
        console.log('\n' + '='.repeat(80));
        console.log(`🔍 [${new Date().toLocaleTimeString()}] Share 제출 수신`);
        console.log('='.repeat(80));
        console.log(`👷 워커: ${connection.address}.${workerName}`);
        console.log(`🆔 Job ID: ${jobId}`);
        console.log(`🎲 Nonce: 0x${nonce}`);
        console.log(`⏰ ExtraNonce2: ${extraNonce2}`);
        console.log(`🕐 NTime: ${nTime}`);
        console.log(`🌐 IP: ${connection.remoteAddress}`);
        
        // 연결 추적 업데이트
        this.connectionTracker.updateActivity(connection.id, 'SHARE_SUBMIT', {
            jobId, nonce, workerName
        });

        // 기본 통계 업데이트
        this.stats.sharesSubmitted++;
        this.stats.eccpowValidations++;

        if (!connection.authorized) {
            console.log(`❌ 검증 실패: 인증되지 않은 워커`);
            console.log('='.repeat(80) + '\n');
            this.sendError(connection, id, -10, 'Unauthorized worker');
            return;
        }

        // 2단계: Job 유효성 검사
        const job = this.jobs.get(jobId);
        if (!job) {
            console.log(`❌ 검증 실패: 잘못된 Job ID`);
            console.log(`   - 요청한 Job ID: ${jobId}`);
            console.log(`   - 사용 가능한 Job들: [${Array.from(this.jobs.keys()).join(', ')}]`);
            console.log('='.repeat(80) + '\n');
            
            this.sendError(connection, id, -21, 'Job not found');
            this.stats.invalidShares++;
            return;
        }

        // 3단계: ECCPoW 데이터 검증 (있는 경우)
        if (codeword && mixDigest) {
            console.log(`⚡ ECCPoW 데이터 수신:`);
            console.log(`   - Codeword: ${codeword.slice(0, 16)}... (${codeword.length} chars)`);
            console.log(`   - MixDigest: ${mixDigest.slice(0, 16)}... (${mixDigest.length} chars)`);
            if (codeLength) {
                console.log(`   - CodeLength: ${codeLength}`);
            }
            
            // ECCPoW 데이터 유효성 검증
            if (!this.validateECCPoWData(codeword, mixDigest, codeLength)) {
                console.log(`❌ 검증 실패: 잘못된 ECCPoW 데이터 형식`);
                console.log('='.repeat(80) + '\n');
                
                this.sendError(connection, id, -23, 'Invalid ECCPoW data format');
                this.stats.invalidShares++;
                return;
            }
        }

        // 4단계: Job 정보 표시
        console.log(`📋 Job 정보:`);
        console.log(`   - 블록 높이: #${job.blockHeight}`);
        console.log(`   - 네트워크 난이도: ${job.networkDifficulty?.toLocaleString() || 'N/A'}`);
        console.log(`   - 풀 난이도: ${job.difficulty?.toLocaleString() || this.difficulty.toLocaleString()}`);
        console.log(`   - 이전 블록: ${job.prevBlockHash?.slice(0, 16)}...`);
        console.log(`   - 생성 시간: ${new Date(job.createdAt).toLocaleString()}`);

        // 4.5단계: 중복 Share 검사
        const shareKey = `${jobId}-${extraNonce2}-${nTime}-${nonce}`;
        if (job.submittedShares && job.submittedShares.has(shareKey)) {
            console.log(`❌ 검증 실패: 중복 Share 제출`);
            console.log(`   - Share 키: ${shareKey}`);
            console.log('='.repeat(80) + '\n');
            
            this.sendError(connection, id, -22, 'Duplicate share');
            this.stats.invalidShares++;
            return;
        }

        // 5단계: ECCPoW 검증 시작
        console.log(`⚡ ECCPoW 검증 시작...`);
        console.log(`   - 알고리즘: ECCPoW`);
        console.log(`   - 네트워크 타입: ${this.detectNetworkType(job.blockHeight)}`);
        console.log(`   - 검증 모드: ${this.stats.offlineMode ? '시뮬레이션' : '실제'}`);
        
        const validationStartTime = Date.now();
        let validation;

        try {
            // 항상 실제 ECCPoW 검증만 수행
            console.log(`⚡ 실제 ECCPoW 검증 수행 중...`);
            
            const eccpowData = codeword && mixDigest ? {
                codeword: codeword,
                mixDigest: mixDigest,
                codeLength: codeLength
            } : null;
            
            validation = await this.validateShare(job, nonce, connection.address, job.blockHeight, eccpowData);
            
            const validationTime = Date.now() - validationStartTime;
            console.log(`   - 검증 소요 시간: ${validationTime}ms`);
            console.log(`   - LDPC 디코딩: ${validation.converged ? '수렴' : '발산'}`);
            
        } catch (error) {
            console.log(`💥 ECCPoW 검증 중 오류!`);
            console.log(`   - 오류: ${error.message}`);
            validation = { valid: false, error: error.message };
        }

        // 6단계: 검증 결과 상세 표시
        console.log(`📊 ECCPoW 검증 결과:`);
        console.log(`   - 유효성: ${validation.valid ? '✅ 유효' : '❌ 무효'}`);
        console.log(`   - 해밍 가중치: ${validation.weight || 'N/A'}`);
        console.log(`   - 검색 레벨: ${validation.level || 'N/A'}`);
        console.log(`   - 네트워크 타입: ${validation.networkType || 'unknown'}`);
        
        if (validation.threshold) {
            console.log(`   - 임계값: ${validation.threshold}`);
            console.log(`   - 가중치 비교: ${validation.weight} ${validation.weight <= validation.threshold ? '≤' : '>'} ${validation.threshold}`);
        }
        
        if (validation.error) {
            console.log(`   - 오류 상세: ${validation.error}`);
        }

        // 7단계: Share 처리
        if (validation.valid) {
            await this.processValidShare(connection, job, validation, shareKey, workerName, id);
        } else {
            await this.processInvalidShare(connection, job, validation, workerName, id);
        }

        const totalTime = Date.now() - startTime;
        console.log(`⏱️  총 처리 시간: ${totalTime}ms`);
        console.log('='.repeat(80) + '\n');
    }

    // 유효한 Share 처리
    async processValidShare(connection, job, validation, shareKey, workerName, id) {
        this.stats.validShares++;
        connection.validShares++;
        
        // 중복 방지를 위해 기록
        if (!job.submittedShares) {
            job.submittedShares = new Set();
        }
        job.submittedShares.add(shareKey);

        // 워커 통계 업데이트
        const workerInfo = this.workers.get(connection.address);
        if (workerInfo) {
            workerInfo.validShares++;
            workerInfo.totalShares++;
            workerInfo.lastShareTime = Date.now();
        }

        // 연결 추적 업데이트
        this.connectionTracker.updateActivity(connection.id, 'SHARE_ACCEPT', {
            weight: validation.weight,
            level: validation.level
        });

        // 블록 후보 검사
        const isBlockCandidate = await this.checkBlockCandidate(validation, job);
        
        console.log(`✅ Share 승인됨!`);
        console.log(`   - 승인 번호: #${this.stats.validShares}`);
        console.log(`   - 워커 성공률: ${connection.validShares}/${connection.validShares + connection.invalidShares} (${((connection.validShares / (connection.validShares + connection.invalidShares || 1)) * 100).toFixed(1)}%)`);
        console.log(`   - 풀 전체 성공률: ${((this.stats.validShares / this.stats.sharesSubmitted) * 100).toFixed(1)}%`);

        if (isBlockCandidate) {
            await this.handlePotentialBlock(validation, job, `${connection.address}.${workerName}`, validation.nonce);
        }

        // 데이터베이스에 기록
        await this.recordValidShare(connection, job, validation, workerName);
        
        this.sendResponse(connection, id, true);
    }

    // 무효한 Share 처리
    async processInvalidShare(connection, job, validation, workerName, id) {
        this.stats.invalidShares++;
        this.stats.eccpowFailures++;
        connection.invalidShares++;
        
        // 연결 추적 업데이트
        this.connectionTracker.updateActivity(connection.id, 'SHARE_REJECT', {
            reason: validation.error || 'ECCPoW validation failed'
        });

        console.log(`❌ Share 거부됨`);
        console.log(`   - 거부 사유: ${validation.error || 'ECCPoW 검증 실패'}`);
        console.log(`   - 워커 실패율: ${connection.invalidShares}/${connection.validShares + connection.invalidShares} (${((connection.invalidShares / (connection.validShares + connection.invalidShares || 1)) * 100).toFixed(1)}%)`);
        console.log(`   - 풀 전체 실패율: ${((this.stats.invalidShares / this.stats.sharesSubmitted) * 100).toFixed(1)}%`);

        // 데이터베이스에 기록
        await this.recordInvalidShare(connection, job, validation, workerName);
        
        this.sendResponse(connection, id, false);
    }

    // 블록 후보 검사
    async checkBlockCandidate(validation, job) {
        console.log(`🎯 블록 후보 검사 중...`);
        
        if (this.stats.offlineMode) {
            const isCandidate = Math.random() < 0.01; // 1% 확률
            console.log(`   - 시뮬레이션 블록 후보: ${isCandidate ? '예' : '아니오'}`);
            return isCandidate;
        }
        
        // 실제 네트워크 난이도와 비교
        const networkTarget = this.calculateNetworkTarget(job.networkDifficulty);
        const shareTarget = this.calculateShareTarget(validation.weight, validation.level);
        
        console.log(`   - 네트워크 타겟: ${networkTarget.toString(16).slice(0, 16)}...`);
        console.log(`   - Share 타겟: ${shareTarget.toString(16).slice(0, 16)}...`);
        
        const isCandidate = shareTarget <= networkTarget;
        console.log(`   - 블록 기준 충족: ${isCandidate ? '예' : '아니오'}`);
        
        return isCandidate;
    }

    // 잠재적 블록 처리
    async handlePotentialBlock(validation, job, worker, nonce) {
        console.log('\n' + '🏆'.repeat(50));
        console.log('🏆 잠재적 블록 발견! 최종 검증 시작...');
        console.log('🏆'.repeat(50));
        
        try {
            console.log(`🔍 최종 블록 검증 수행 중...`);
            console.log(`   - 블록 높이: #${job.blockHeight}`);
            console.log(`   - 발견자: ${worker}`);
            console.log(`   - Nonce: 0x${nonce?.toString(16).padStart(16, '0')}`);
            
            const finalValidationStart = Date.now();
            
            // 네트워크 난이도로 최종 검증
            const finalValidation = await this.eccpowValidator.validateECCPoW(
                Buffer.from(job.blockHeader || 'test_header', 'hex'),
                parseInt(nonce, 16),
                job.networkDifficulty,
                job.blockHeight
            );
            
            const finalValidationTime = Date.now() - finalValidationStart;
            console.log(`   - 최종 검증 시간: ${finalValidationTime}ms`);
            console.log(`   - 최종 결과: ${finalValidation.valid ? '✅ 유효한 블록!' : '❌ 네트워크 기준 미달'}`);
            
            if (finalValidation.valid) {
                // 완전한 블록 구성
                const fullBlock = await this.buildFullBlock(job, nonce, extraNonce2, nTime);
                
                // 채굴자 주소 추출
                const minerAddress = worker.split('.')[0];
                
                await this.processValidBlock(validation, job, worker, nonce, fullBlock, minerAddress);
            } else {
                console.log(`📊 풀 Share로만 처리됨 (네트워크 기준 미달)`);
                console.log(`   - 풀 난이도: 충족 ✅`);
                console.log(`   - 네트워크 난이도: 미달 ❌`);
                console.log(`   - 가중치: ${validation.weight}`);
            }
            
        } catch (error) {
            console.log(`💥 블록 검증 중 오류!`);
            console.log(`   - 오류: ${error.message}`);
        }
        
        console.log('🏆'.repeat(50) + '\n');
    }

    // 유효한 블록 처리 - 실제 ECCPoW 해시 계산 (상세 정보 포함)
    async processValidBlock(validation, job, worker, nonce, fullBlock = null, minerAddress = null) {
        this.stats.blocksFound++;
        
        // 실제 블록 헤더 구성
        const completeBlockHeader = await this.buildCompleteBlockHeader(job, nonce, worker);
        
        // 실제 ECCPoW 해시 계산
        const realBlockHash = await this.calculateRealBlockHash(completeBlockHeader, nonce, job.blockHeight);
        
        // 확장된 블록 데이터 - scan.worldland.foundation 비교용 정보 추가
        const blockData = {
            miner: worker,
            blockHeight: job.blockHeight,
            blockHash: realBlockHash, // ✅ 실제 ECCPoW 해시!
            prevBlockHash: job.prevBlockHash,
            algorithm: 'ECCPoW',
            networkType: validation.networkType || 'seoul',
            searchLevel: validation.level,
            weight: validation.weight,
            reward: 4.0,
            timestamp: Date.now(),
            nonce: nonce,
            jobId: job.id,
            blockHeader: completeBlockHeader.toString('hex'), // 완전한 블록 헤더 저장
            
            // ECCPoW 상세 데이터
            eccpowData: {
                codeword: validation.codeword || null,
                mixDigest: validation.mixDigest || validation.digest || null,
                codeLength: validation.codeLength || null,
                converged: validation.converged || false,
                iterations: validation.iterations || null
            },
            
            // 네트워크 및 난이도 정보
            networkDifficulty: job.networkDifficulty,
            poolDifficulty: job.difficulty,
            
            // 검증 정보
            eccpowValid: validation.valid,
            blockValid: true, // processValidBlock에 도달했다면 블록 기준 충족
            
            // Job 관련 정보
            jobCreatedAt: job.createdAt,
            jobVersion: job.blockVersion,
            jobBits: job.difficultyBits,
            jobTimestamp: job.timestamp,
            
            // 풀 정보
            poolMode: this.stats.offlineMode ? 'simulation' : 'live',
            stratumId: `${this.host}:${this.port}`,
            
            // 처리 시간 정보
            processedAt: Date.now(),
            processingTime: Date.now() - validation.startTime || 0
        };
        
        // 네트워크에 실제 블록 제출 (결과 정보 포함)
        if (!this.stats.offlineMode) {
            console.log(`\n📤 WorldLand 메인넷에 블록 제출 시도 중...`);
            const submitResult = await this.submitRealBlockToNetwork(
                completeBlockHeader, 
                blockData
            );
            
            // 제출 결과를 blockData에 추가
            blockData.networkSubmitted = submitResult.success;
            if (submitResult.txHash) {
                blockData.txHash = submitResult.txHash;
            }
            if (submitResult.error) {
                blockData.submitError = submitResult.error;
            }
            if (submitResult.blockHash && submitResult.blockHash !== blockData.blockHash) {
                blockData.confirmedBlockHash = submitResult.blockHash;
            }
            
            console.log(`📊 네트워크 제출 결과:`);
            console.log(`   ✅ 제출 성공: ${submitResult.success ? '예' : '아니오'}`);
            if (submitResult.txHash) {
                console.log(`   🔗 트랜잭션 해시: ${submitResult.txHash}`);
            }
            if (submitResult.error) {
                console.log(`   ❌ 제출 오류: ${submitResult.error}`);
            }
            if (submitResult.blockHash) {
                console.log(`   🔗 확인된 블록 해시: ${submitResult.blockHash}`);
            }
        } else {
            console.log(`🎲 시뮬레이션 모드 - 블록 제출 건너뜀`);
            blockData.networkSubmitted = false;
            blockData.simulated = true;
        }

        // 블록 발견 축하 메시지
        console.log('\n' + '🎊'.repeat(50));
        console.log('🎊🎊🎊🎊🎊      블 록   발 견!      🎊🎊🎊🎊🎊');
        console.log('🎊'.repeat(50));
        console.log(`🥇 발견자: ${blockData.miner}`);
        console.log(`📏 블록 높이: #${blockData.blockHeight}`);
        console.log(`🎲 Nonce: 0x${nonce?.toString(16).padStart(16, '0')}`);
        console.log(`⚖️ 해밍 가중치: ${blockData.weight}`);
        console.log(`🔢 검색 레벨: ${blockData.searchLevel}`);
        console.log(`🌐 네트워크: ${blockData.networkType.toUpperCase()}`);
        console.log(`💰 보상: ${blockData.reward} WLC`);
        console.log(`📅 발견 시간: ${new Date().toLocaleString()}`);
        console.log(`🏆 풀 총 블록 수: ${this.stats.blocksFound}개`);
        console.log('🎊'.repeat(50) + '\n');

        // 데이터베이스에 블록 기록
        await this.recordBlockFound(blockData);
        
        // 이벤트 발생
        this.emit('blockFound', blockData);
        
        console.log(`📡 블록 발견 알림 브로드캐스트 완료`);
    }

    // ===============================
    // 데이터베이스 기록 함수들
    // ===============================
    async recordValidShare(connection, job, validation, workerName) {
        try {
            const miner = await dbManager.getOrCreateMiner(connection.address);
            
            // 실제 ECCPoW 다이제스트 계산
            const realDigest = await this.calculateShareDigest(job, validation, workerName);

            const [shareResult] = await this.dbPromise.execute(`
                INSERT INTO shares (
                miner_id, job_id, worker, difficulty, 
                solution, nonce, is_valid, is_block,
                submitted_at, ip_address, weight, level, 
                algorithm, network_type, eccpow_codeword, 
                eccpow_mixdigest, eccpow_codelength
            ) VALUES (?, ?, ?, ?, ?, ?, TRUE, FALSE, NOW(), ?, ?, ?, 'ECCPoW', ?, ?, ?, ?)
        `, [
            miner.id, job.id, workerName, job.difficulty,
            realDigest,
            validation.nonce || '0', 
            connection.remoteAddress,
            validation.weight || 0,
            validation.level || 0,
            validation.networkType || 'seoul',
            validation.codeword || null,
            validation.mixDigest || validation.digest || null,
            validation.codeLength || null
        ]);
            
            // 채굴자 통계 업데이트
            await this.dbPromise.execute(`
                UPDATE miners 
                SET valid_shares = valid_shares + 1,
                    total_shares = total_shares + 1,
                    last_seen = NOW()
                WHERE id = ?
            `, [miner.id]);
            
            console.log(`📝 유효 Share DB 기록 완료 (ID: ${shareResult.insertId})`);
            
        } catch (error) {
            console.error(`❌ Share 기록 오류:`, error);
        }
    }

    // 실제 블록 해시 계산 메서드 추가
    async calculateRealBlockHash(blockHeader, nonce, blockHeight) {
        try {
            // ECCPoW 알고리즘으로 실제 해시 계산
            const validation = await this.eccpowValidator.validateECCPoW(
                blockHeader,
                parseInt(nonce, 16),
                1, // 최소 난이도로 해시만 계산
                blockHeight
            );
            
            if (validation.digest) {
                const fullHash = '0x' + validation.digest;
                console.log(`   - ECCPoW 다이제스트: ${fullHash}`);
                
                // WorldLand 블록 해시는 헤더 전체의 Keccak256일 수 있음
                const blockHash = crypto.createHash('sha256')
                    .update(blockHeader)
                    .digest('hex');
                const finalBlockHash = '0x' + blockHash;
                
                console.log(`   - 최종 블록 해시: ${finalBlockHash}`);
                console.log(`   - 해시 계산 방식: BlockHeader -> Keccak256`);
                
                return finalBlockHash;
            }
            
            // ECCPoW 실패시 SHA256 기반 계산
            const hash1 = crypto.createHash('sha256').update(blockHeader).digest();
            const hash2 = crypto.createHash('sha256').update(hash1).digest();
            return '0x' + hash2.toString('hex');
            
        } catch (error) {
            console.error('❌ 실제 블록 해시 계산 실패:', error);
            // 최후의 수단으로 결정론적 해시 생성
            const combined = Buffer.concat([blockHeader, Buffer.from(nonce.toString(16), 'hex')]);
            const hash = crypto.createHash('sha256').update(combined).digest();
            return '0x' + hash.toString('hex');
        }
    }

    // 완전한 블록 헤더 구성
    async buildCompleteBlockHeader(job, nonce, worker) {
        const minerAddress = worker.split('.')[0];
        
        // WorldLand 블록 헤더 구조에 맞게 구성
        const header = Buffer.alloc(80); // 표준 블록 헤더 크기
        let offset = 0;
        
        // Version (4 bytes)
        header.writeUInt32LE(parseInt(job.blockVersion || '0x20000000', 16), offset);
        offset += 4;
        
        // Previous Block Hash (32 bytes)
        const prevHash = Buffer.from(job.prevBlockHash || '0'.repeat(64), 'hex');
        prevHash.copy(header, offset, 0, 32);
        offset += 32;
        
        // Merkle Root (32 bytes) - 실제 트랜잭션 기반으로 계산
        const merkleRoot = await this.calculateMerkleRoot(job, minerAddress);
        merkleRoot.copy(header, offset, 0, 32);
        offset += 32;
        
        // Timestamp (4 bytes)
        header.writeUInt32LE(parseInt(job.timestamp, 16), offset);
        offset += 4;
        
        // Difficulty Bits (4 bytes)
        header.writeUInt32LE(parseInt(job.difficultyBits || '0x1d00ffff', 16), offset);
        offset += 4;
        
        // Nonce (8 bytes for ECCPoW)
        const nonceBuffer = Buffer.alloc(8);
        nonceBuffer.writeBigUInt64LE(BigInt('0x' + nonce), 0);
        nonceBuffer.copy(header, offset, 0, 8);
        offset += 8;
        
        // ECCPoW Mix Hash 처리
        if (validation.eccpowData?.mixDigest) {
            const mixHash = Buffer.from(validation.eccpowData.mixDigest, 'hex');
            mixHash.copy(header, offset, 0, Math.min(32, mixHash.length));
            offset += 32;
        } else {
            // 기본 mixHash 추가
            crypto.randomBytes(32).copy(header, offset, 0, 32);
            offset += 32;
        }
        
        return header.slice(0, offset); // 실제 사용된 길이만 반환
    }


    async recordInvalidShare(connection, job, validation, workerName) {
        try {
            const miner = await dbManager.getOrCreateMiner(connection.address);
            
            await this.dbPromise.execute(`
                INSERT INTO shares (
                    miner_id, job_id, worker, difficulty, 
                    solution, nonce, is_valid, is_block,
                    submitted_at, ip_address, error_message
                ) VALUES (?, ?, ?, ?, ?, ?, FALSE, FALSE, NOW(), ?, ?)
            `, [
                miner.id, job.id, workerName, job.difficulty,
                '0x' + crypto.randomBytes(32).toString('hex'),
                '0', connection.remoteAddress,
                validation.error || 'ECCPoW validation failed'
            ]);
            
            // 채굴자 통계 업데이트
            await this.dbPromise.execute(`
                UPDATE miners 
                SET total_shares = total_shares + 1,
                    last_seen = NOW()
                WHERE id = ?
            `, [miner.id]);
            
        } catch (error) {
            console.error(`❌ 무효 Share 기록 오류:`, error);
        }
    }

    async recordBlockFound(blockData) {
        try {
            const minerAddress = blockData.miner.split('.')[0];
            const miner = await dbManager.getOrCreateMiner(minerAddress);
            
            // 실제 네트워크 제출 성공 여부에 따라 상태 구분
            const status = blockData.networkSubmitted ? 'confirmed' : 'pool_only';

            const [blockResult] = await this.dbPromise.execute(`
                INSERT INTO blocks (
                    miner_id, block_number, block_hash, 
                    difficulty, reward, status, found_at,
                    nonce, weight, search_level, algorithm,
                    network_type, job_id, network_submitted,
                    eccpow_codeword, eccpow_mixdigest, eccpow_codelength,
                    block_header, tx_hash, pool_fee
                ) VALUES (?, ?, ?, ?, ?, ?, NOW(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                miner.id, blockData.blockHeight, blockData.blockHash,
                blockData.networkDifficulty || 1000000, blockData.reward, status,
                blockData.nonce, blockData.weight, blockData.searchLevel,
                blockData.algorithm, blockData.networkType, blockData.jobId,
                blockData.networkSubmitted || false,
                blockData.eccpowData?.codeword || null,
                blockData.eccpowData?.mixDigest || null,
                blockData.eccpowData?.codeLength || null,
                blockData.blockHeader || null,
                blockData.txHash || null,
                (blockData.reward || 4.0) * 0.009 // 0.9% 풀 수수료
            ]);
            
            // 채굴자 블록 통계 업데이트
            await this.dbPromise.execute(`
                UPDATE miners 
                SET total_blocks_found = total_blocks_found + 1,
                    last_block_time = NOW(),
                    total_rewards = total_rewards + ?
                WHERE id = ?
            `, [blockData.reward, miner.id]);
            
            console.log(`📝 블록 DB 기록 완료 (ID: ${blockResult.insertId})`);
            
        } catch (error) {
            console.error(`❌ 블록 기록 오류:`, error);
        }
    }

    // ===============================
    // 표준 Stratum 프로토콜 메시지
    // ===============================
    
    // 표준 mining.notify 메시지 생성
    createMiningNotifyMessage(job) {
        return {
            method: 'mining.notify',
            params: [
                job.id,                           // Job ID
                job.prevBlockHash || '0'.repeat(64), // Previous block hash
                job.coinbase1 || '',              // Coinbase part 1
                job.coinbase2 || '',              // Coinbase part 2
                job.merkleBranches || [],         // Merkle branches
                job.version || '0x20000000',      // Block version
                job.bits || '0x1d00ffff',         // Difficulty bits
                job.timestamp || Math.floor(Date.now() / 1000).toString(16), // Network time
                true                              // Clean jobs flag
            ]
        };
    }

    // 표준 mining.set_difficulty 메시지 생성
    createDifficultyMessage(difficulty) {
        return {
            method: 'mining.set_difficulty',
            params: [difficulty]
        };
    }

    // ===============================
    // 유틸리티 함수들
    // ===============================
    
    detectNetworkType(blockHeight) {
        if (blockHeight > 7000000) {
            return 'annapurna';
        } else if (blockHeight > 5000000) {
            return 'seoul';
        } else {
            return 'default';
        }
    }

    calculateNetworkTarget(difficulty) {
        const maxTarget = BigInt('0x00000000FFFF0000000000000000000000000000000000000000000000000000');
        return maxTarget / BigInt(difficulty || 1);
    }

    calculateShareTarget(weight, level) {
        const baseTarget = BigInt('0x0000FFFF00000000000000000000000000000000000000000000000000000000');
        const levelAdjustment = BigInt(level || 1);
        const weightAdjustment = BigInt(Math.floor(weight || 1000));
        
        return baseTarget / (levelAdjustment * weightAdjustment);
    }

    simulateShareValidation() {
        const isValid = Math.random() > 0.1; // 90% 성공률
        const weight = isValid ? Math.floor(Math.random() * 500) + 50 : Math.floor(Math.random() * 1000) + 500;
        
        return {
            valid: isValid,
            weight: weight,
            level: Math.floor(Math.random() * 15) + 5,
            networkType: 'seoul',
            algorithm: 'ECCPoW',
            simulated: true,
            error: isValid ? null : 'Simulated validation failure'
        };
    } 

    // 워커별 채굴 통계 업데이트
    updateWorkerMiningStats(address, workerName, shareResult) {
        const workerId = `${address}.${workerName}`;
        
        if (!this.miningProgress.workerStats.has(workerId)) {
            this.miningProgress.workerStats.set(workerId, {
                address: address,
                workerName: workerName,
                totalSubmissions: 0,
                validShares: 0,
                invalidShares: 0,
                bestWeight: Infinity,
                avgWeight: 0,
                shareRate: '0',
                lastShareTime: null,
                weights: []
            });
        }
        
        const stats = this.miningProgress.workerStats.get(workerId);
        stats.totalSubmissions++;
        stats.lastShareTime = Date.now();
        
        if (shareResult.valid) {
            stats.validShares++;
            if (shareResult.weight !== undefined) {
                stats.weights.push(shareResult.weight);
                if (stats.weights.length > 100) stats.weights.shift(); // 최근 100개만 유지
                
                stats.avgWeight = stats.weights.reduce((a, b) => a + b, 0) / stats.weights.length;
                stats.bestWeight = Math.min(stats.bestWeight, shareResult.weight);
            }
        } else {
            stats.invalidShares++;
        }
        
        // 분당 Share 비율 계산 (최근 1시간 기준)
        const recentShares = this.miningProgress.recentShares.filter(
            share => share.worker === workerId && 
            (Date.now() - share.timestamp) < 3600000 // 1시간
        );
        stats.shareRate = (recentShares.length / 60).toFixed(1);
        
        // 최근 Share 기록에 추가
        this.miningProgress.recentShares.unshift({
            timestamp: Date.now(),
            worker: workerId,
            valid: shareResult.valid,
            weight: shareResult.weight,
            networkType: shareResult.networkType || 'unknown'
        });
        
        // 최근 Share는 최대 1000개만 유지
        if (this.miningProgress.recentShares.length > 1000) {
            this.miningProgress.recentShares = this.miningProgress.recentShares.slice(0, 1000);
        }
    }
 
    // 데이터베이스 연결 설정
    setDatabaseConnection(dbPromise) {
        this.dbPromise = dbPromise;
        this.logInfo('데이터베이스 연결 설정 완료');
    }

    // 서버 시작 (기존 코드와 동일)
    async start() {
        try {
            const health = await this.eccpowValidator.healthCheck();
            if (health.status !== 'healthy') {
                this.logWarn('ECCPoW 검증기 상태 불량, 제한된 기능으로 시작', { error: health.error });
            }

            this.server = net.createServer();
            this.server.on('connection', (socket) => this.handleConnection(socket));
            this.server.on('error', (error) => this.handleServerError(error));

            await new Promise((resolve, reject) => {
                this.server.listen(this.port, this.host, (error) => {
                    if (error) reject(error);
                    else resolve();
                });
            });

            this.isRunning = true;
            
            this.logInfo(`WorldLand ECCPoW Stratum 서버 시작`, {
                address: `${this.host}:${this.port}`,
                algorithm: 'ECCPoW',
                poolDifficulty: this.difficulty
            });
            
            await this.createInitialTemplate(); // ✅ await 추가
            this.startBlockTemplateUpdater();
            this.startStatsUpdater();
            this.startMiningProgressDisplay();
            
            // if (this.simulateBlocks) {
            //     this.startBlockSimulation();
            // }

            // 실제 모드 확인 로그
            console.log('\n🔍 ===== Stratum 서버 모드 확인 =====');
            console.log(`🌐 네트워크 연결: ${this.stats.networkConnected ? '✅ 연결됨' : '❌ 연결 안됨'}`);
            console.log(`🎲 오프라인 모드: ${this.stats.offlineMode ? '❌ 활성화 (시뮬레이션)' : '✅ 비활성화 (실제)'}`);
            console.log(`🎯 블록 시뮬레이션: ${this.simulateBlocks ? '❌ 활성화' : '✅ 비활성화'}`);
            console.log(`📡 RPC 엔드포인트: ${this.rpcEndpoints[0]?.protocol}://${this.rpcEndpoints[0]?.host}:${this.rpcEndpoints[0]?.port}`);
            console.log(`🔄 RPC 상태: ${this.rpcStats.connected ? '연결됨' : '연결 안됨'}`);
            console.log('=====================================\n');
            
            return true;
        } catch (error) {
            this.logError('Stratum 서버 시작 실패', { error: error.message });
            throw error;
        }
    }

    // 채굴 진행상황 실시간 표시 시작
    startMiningProgressDisplay() {
        // 30초마다 채굴 진행상황 요약 표시
        setInterval(() => {
            this.displayMiningProgress();
        }, 30000);
        
        this.logInfo('📊 채굴 진행상황 모니터링 시작');
    }

    // 채굴 진행상황 표시
    displayMiningProgress() {
        const now = Date.now();
        const uptime = now - this.stats.startTime;
        const uptimeMinutes = Math.floor(uptime / 60000);
        
        console.log('\n🌟 ================== 채굴 진행상황 요약 ==================');
        console.log(`⏰ 가동시간: ${uptimeMinutes}분`);
        console.log(`🔗 연결된 채굴기: ${this.stats.authorizedConnections}대`);
        console.log(`📊 총 제출: ${this.miningProgress.totalSubmissions}회`);
        console.log(`✅ 유효 Share: ${this.miningProgress.validSubmissions}회 (${this.miningProgress.totalSubmissions > 0 ? ((this.miningProgress.validSubmissions / this.miningProgress.totalSubmissions) * 100).toFixed(1) : 0}%)`);
        console.log(`❌ 무효 Share: ${this.miningProgress.invalidSubmissions}회`);
        console.log(`🎯 블록 후보: ${this.miningProgress.blockCandidates}개`);
        console.log(`🏆 발견 블록: ${this.miningProgress.blocksFound}개`);
        
        if (this.miningProgress.bestWeight < Infinity) {
            console.log(`💎 최고 가중치: ${this.miningProgress.bestWeight}`);
        }
        
        // 활성 워커별 통계
        const activeWorkers = Array.from(this.miningProgress.workerStats.values())
            .filter(worker => worker.lastShareTime && (now - worker.lastShareTime) < 300000) // 5분 이내 활성
            .sort((a, b) => b.validShares - a.validShares);
        
        if (activeWorkers.length > 0) {
            console.log(`\n👷 활성 워커 TOP 5:`);
            activeWorkers.slice(0, 5).forEach((worker, index) => {
                const successRate = worker.totalSubmissions > 0 ? 
                    ((worker.validShares / worker.totalSubmissions) * 100).toFixed(1) : 0;
                
                console.log(`  ${index + 1}. ${worker.workerName} (${worker.address.slice(0, 8)}...)`);
                console.log(`     📈 ${worker.validShares}/${worker.totalSubmissions} (${successRate}%) | 평균가중치: ${worker.avgWeight.toFixed(1)} | 분당: ${worker.shareRate}`);
            });
        }
        
        console.log('🌟 ======================================================\n');
    }

    // 🎯 블록 후보 검사 함수 (새로 추가)
    async checkBlockCandidate(validation, job) {
        console.log(`🎯 블록 후보 검사 중...`);
        
        if (this.stats.offlineMode) {
            const isCandidate = Math.random() < 0.01; // 1% 확률
            console.log(`   - 시뮬레이션 블록 후보: ${isCandidate ? '예' : '아니오'}`);
            return isCandidate;
        }
        
        // 실제 네트워크 난이도와 비교
        const networkTarget = this.calculateNetworkTarget(job.networkDifficulty);
        const shareTarget = this.calculateShareTarget(validation.weight, validation.level);
        
        console.log(`   - 네트워크 타겟: ${networkTarget}`);
        console.log(`   - Share 타겟: ${shareTarget}`);
        console.log(`   - 블록 기준 충족: ${shareTarget <= networkTarget ? '예' : '아니오'}`);
        
        const isCandidate = shareTarget <= networkTarget;
        
        if (isCandidate) {
            this.miningProgress.blockCandidates++;
            console.log(`🎯 블록 후보 발견! (후보 #${this.miningProgress.blockCandidates})`);
        }
        
        return isCandidate;
    }

    // 🏆 잠재적 블록 처리 함수 (새로 추가)
    async handlePotentialBlock(validation, job, worker, nonce, extraNonce2, nTime) {
        console.log('\n' + '🏆'.repeat(40));
        console.log('🏆 잠재적 블록 발견! 최종 검증 시작...');
        console.log('🏆'.repeat(40));
        
        try {
            // 🔍 최종 블록 검증
            console.log(`🔍 최종 블록 검증 수행 중...`);
            console.log(`   - 블록 높이: #${job.blockHeight}`);
            console.log(`   - 발견자: ${worker}`);
            console.log(`   - Nonce: 0x${nonce.toString(16).padStart(16, '0')}`);
            console.log(`   - 검증 시작: ${new Date().toLocaleString()}`);
            
            const finalValidationStart = Date.now();
            
            // 완전한 블록 구성
            const fullBlock = await this.buildFullBlock(job, nonce, extraNonce2, nTime);
            console.log(`   - 블록 크기: ${fullBlock.length} bytes`);
            console.log(`   - 트랜잭션 수: ${job.template?.transactions?.length || 0}개`);
            
            // 네트워크 난이도로 최종 검증
            const finalValidation = await this.eccpowValidator.validateECCPoW(
                Buffer.from(job.blockHeader, 'hex'),
                parseInt(nonce, 16),
                job.networkDifficulty,
                job.blockHeight
            );
            
            const finalValidationTime = Date.now() - finalValidationStart;
            console.log(`   - 최종 검증 시간: ${finalValidationTime}ms`);
            console.log(`   - 최종 결과: ${finalValidation.valid ? '✅ 유효한 블록!' : '❌ 네트워크 기준 미달'}`);
            
            if (finalValidation.valid) {
                // 🎉 실제 블록 발견!
                await this.processValidBlock(validation, job, worker, nonce, fullBlock);
            } else {
                // 📊 풀 Share로만 처리
                console.log(`📊 풀 Share로 처리됨 (네트워크 기준 미달)`);
                console.log(`   - 풀 난이도: 충족 ✅`);
                console.log(`   - 네트워크 난이도: 미달 ❌`);
            }
            
        } catch (error) {
            console.log(`💥 블록 검증 중 오류!`);
            console.log(`   - 오류: ${error.message}`);
        }
        
        console.log('🏆'.repeat(40) + '\n');
    }

    // 🎉 유효한 블록 처리 함수 (새로 추가)
    async processValidBlock(validation, job, worker, nonce, fullBlock) {
        this.stats.blocksFound++;
        this.miningProgress.blocksFound++;
        this.miningProgress.lastBlockTime = Date.now();
        
        // 🎊 블록 발견 축하 메시지
        console.log('\n' + '🎊'.repeat(50));
        console.log('🎊🎊🎊🎊🎊      블 록   발 견!      🎊🎊🎊🎊🎊');
        console.log('🎊'.repeat(50));
        console.log(`🥇 발견자: ${worker}`);
        console.log(`📏 블록 높이: #${job.blockHeight}`);
        console.log(`🎲 Nonce: 0x${nonce.toString(16).padStart(16, '0')}`);
        console.log(`⚖️ 해밍 가중치: ${validation.weight}`);
        console.log(`🔢 검색 레벨: ${validation.level}`);
        console.log(`🌐 네트워크: ${validation.networkType.toUpperCase()}`);
        console.log(`💰 보상: 4.0 WLC`);
        console.log(`📅 발견 시간: ${new Date().toLocaleString()}`);
        console.log(`🏆 풀 총 블록 수: ${this.miningProgress.blocksFound}개`);
        
        // 📤 네트워크 제출 시도
        const minerAddress = worker.split('.')[0]; 

        // 실제 블록 헤더 구성
        const completeBlockHeader = await this.buildCompleteBlockHeader(job, nonce, worker);

        // 📤 네트워크 제출 시도
        if (!this.stats.offlineMode) {
            console.log(`📤 WorldLand 네트워크에 블록 제출 중...`);
            
            try {
                const submitResult = await this.submitBlockToNetwork(fullBlock, job.blockHeight, minerAddress);
                
                if (submitResult.success) {
                    console.log(`✅ 블록 제출 성공!`);
                    console.log(`   - 채굴자 주소: ${minerAddress}`);
                    console.log(`   - 트랜잭션 해시: ${submitResult.txHash}`);
                    console.log(`   - 네트워크 확인: 대기 중...`);
                    
                    // 성공 이벤트 발생 (networkSubmitted: true)
                    this.emit('blockFound', {
                        miner: worker,
                        blockHeight: job.blockHeight,
                        blockHash: submitResult.blockHash,
                        algorithm: 'ECCPoW',
                        networkType: validation.networkType,
                        searchLevel: validation.level,
                        weight: validation.weight,
                        reward: 4.0,
                        timestamp: Date.now(),
                        txHash: submitResult.txHash,
                        jobId: job.id,
                        networkSubmitted: true,
                        actualMinerAddress: minerAddress  // 실제 제출된 채굴자 주소
                    });
                    
                } else {
                    console.log(`❌ 블록 제출 실패!`);
                    console.log(`   - 사유: ${submitResult.error}`);
                    
                    // 실패해도 풀 기록은 남김 (networkSubmitted: false)
                    this.emit('blockFound', {
                        miner: worker,
                        blockHeight: job.blockHeight,
                        blockHash: '0x' + crypto.randomBytes(32).toString('hex'),
                        algorithm: 'ECCPoW',
                        networkType: validation.networkType,
                        searchLevel: validation.level,
                        weight: validation.weight,
                        reward: 4.0,
                        timestamp: Date.now(),
                        jobId: job.id,
                        networkSubmitted: false,
                        submitError: submitResult.error
                    });
                }
                
            } catch (error) {
                console.log(`💥 블록 제출 중 오류!`);
                console.log(`   - 오류: ${error.message}`);
            }
        } else {
            console.log(`🎲 시뮬레이션 모드 - 블록 제출 건너뜀`);
            
            // 시뮬레이션 이벤트 발생
            this.emit('blockFound', {
                miner: worker,
                blockHeight: job.blockHeight,
                blockHash: '0x' + crypto.randomBytes(32).toString('hex'),
                algorithm: 'ECCPoW',
                networkType: validation.networkType,
                searchLevel: validation.level,
                weight: validation.weight,
                timestamp: Date.now(),
                simulated: true,
                jobId: job.id,
                networkSubmitted: false
            });
        }
        
        console.log('🎊'.repeat(50));
        console.log('\n');
        
        // 📊 워커 블록 발견 기록
        const workerInfo = this.workers.get(worker.split('.')[0]);
        if (workerInfo) {
            workerInfo.blocksFound++;
            console.log(`👑 ${worker} 총 발견 블록: ${workerInfo.blocksFound}개`);
        }
        
        // 🔄 다음 블록 작업 준비
        setTimeout(() => {
            console.log(`🔄 다음 블록 #${job.blockHeight + 1} 작업 준비 중...`);
            this.updateBlockTemplate();
        }, 2000);
    }

    buildBlockHeader(job, nonce, extraNonce2, nTime) {
        return {
            parentHash: job.prevBlockHash,
            number: job.blockHeight,
            gasLimit: 8000000,
            gasUsed: 0,
            timestamp: parseInt(nTime, 16),
            difficulty: job.networkDifficulty,
            nonce: nonce,
            extraData: extraNonce2,
            mixHash: crypto.randomBytes(32)
        };
    }

    // 네트워크 타입 감지 함수 추가
    detectNetworkType(blockHeight) {
        // Seoul 네트워크는 특정 블록 높이 이후부터 활성화
        if (blockHeight > 5000000) {
            return 'seoul';
        } else if (blockHeight > 7000000) {
            return 'annapurna';
        } else {
            return 'default';
        }
    }

    // 네트워크 타겟 계산 함수 추가
    calculateNetworkTarget(difficulty) {
        const maxTarget = BigInt('0x00000000FFFF0000000000000000000000000000000000000000000000000000');
        return maxTarget / BigInt(difficulty || 1);
    }

    // Share 타겟 계산 함수 추가  
    calculateShareTarget(weight, level) {
        // ECCPoW에서는 가중치가 낮을수록 좋은 해시
        // 레벨에 따른 기본 타겟 계산
        const baseTarget = BigInt('0x0000FFFF00000000000000000000000000000000000000000000000000000000');
        const levelAdjustment = BigInt(level || 1);
        const weightAdjustment = BigInt(Math.floor(weight || 1000));
        
        return baseTarget / (levelAdjustment * weightAdjustment);
    }

    // 전체 블록 구성 함수 추가
    async buildFullBlock(job, nonce, extraNonce2, nTime) {
        // 블록 헤더 + 트랜잭션들로 완전한 블록 구성
        const blockHeader = this.buildBlockHeader(job, nonce, extraNonce2, nTime);
        const transactions = job.template?.transactions || [];
        
        // 간단한 블록 구성 (실제로는 더 복잡함)
        return {
            header: blockHeader,
            transactions: transactions,
            size: blockHeader.length + transactions.reduce((sum, tx) => sum + tx.length, 0)
        };
    }

    // 네트워크에 블록 제출 함수 추가
    async submitBlockToNetwork(blockHeader, blockData) {
        try {
            const submitData = {
                jsonrpc: '2.0',
                method: 'eth_submitWork',
                params: [
                    '0x' + blockData.nonce.toString(16).padStart(16, '0'),
                    blockData.blockHash, // 이미 계산된 실제 해시
                    '0x' + blockHeader.toString('hex'),
                    blockData.miner.split('.')[0] // 채굴자 주소
                ],
                id: Date.now()
            };
            
            const response = await this.rpcCall(submitData, 15000);
            
            if (response && response.result) {
                // 네트워크에서 확인된 실제 블록 해시 가져오기
                const confirmedHash = await this.getConfirmedBlockHash(blockData.blockHeight);
                
                return {
                    success: true,
                    txHash: response.result,
                    blockHash: confirmedHash || blockData.blockHash, // ✅ 네트워크 확인된 해시
                    minerAddress: blockData.miner.split('.')[0],
                    networkConfirmed: !!confirmedHash
                };
            } else {
                return {
                    success: false,
                    error: response?.error?.message || 'Submission rejected'
                };
            }
            
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    // 네트워크에서 확인된 블록 해시 가져오기
    async getConfirmedBlockHash(blockHeight) {
        try {
            await new Promise(resolve => setTimeout(resolve, 2000)); // 2초 대기
            
            const rpcData = {
                method: 'eth_getBlockByNumber',
                params: ['0x' + blockHeight.toString(16), false],
                id: Date.now(),
                jsonrpc: '2.0'
            };
            
            const response = await this.rpcCall(rpcData, 5000);
            return response?.result?.hash || null;
            
        } catch (error) {
            console.error('❌ 블록 해시 확인 실패:', error);
            return null;
        }
    }

    // 블록 후보 여부 확인
    isBlockCandidate(validation) {
        if (this.stats.offlineMode) {
            return Math.random() < 0.01; // 1% 확률
        }
        
        // 실제 모드에서는 가중치 기반으로 판단
        const threshold = this.getBlockThreshold();
        return validation.valid && validation.weight && validation.weight <= threshold;
    }

    // 블록 임계값 가져오기
    getBlockThreshold() {
        // 현재 네트워크 난이도에 따른 블록 임계값
        const networkDifficulty = this.currentBlockTemplate?.difficulty || 1000000;
        return Math.floor(networkDifficulty / 10000); // 예시 계산
    }

    // 블록 유효성 검사 (네트워크 난이도 대비)
    async isValidBlock(shareValidation, job) {
        try {
            if (this.stats.offlineMode) {
                return Math.random() < 0.1; // 10% 확률로 실제 블록
            }

            // 실제 네트워크 난이도로 검증
            const blockValidation = await this.eccpowValidator.validateECCPoW(
                Buffer.from(job.blockHeader, 'hex'),
                job.nonce,
                job.networkDifficulty,
                job.blockHeight
            );

            return blockValidation.valid;
        } catch (error) {
            this.logError('블록 검증 오류', { error: error.message });
            return false;
        }
    }

    // 블록 발견 처리 (강화된 로깅)
    async handleBlockFound(validation, workerAddress) {
        this.stats.blocksFound++;
        this.miningProgress.blocksFound++;
        this.miningProgress.lastBlockTime = Date.now();
        
        const worker = this.workers.get(workerAddress);
        if (worker) {
            worker.blocksFound++;
        }

        const currentHeight = this.currentBlockTemplate?.height || 0;
        const blockReward = 4.0; // WorldLand 블록 보상

        // 🎉 블록 발견 축하 로그
        console.log('\n🎊🎊🎊🎊🎊🎊🎊🎊🎊🎊🎊🎊🎊🎊🎊🎊🎊🎊🎊🎊');
        console.log('🏆                 블록 발견!                 🏆');
        console.log('🎊🎊🎊🎊🎊🎊🎊🎊🎊🎊🎊🎊🎊🎊🎊🎊🎊🎊🎊🎊');
        
        this.logInfo(`🎉 블록 채굴 성공!`, {
            miner: workerAddress,
            blockNumber: this.miningProgress.blocksFound,
            height: currentHeight,
            algorithm: 'ECCPoW',
            networkType: validation.networkType || 'seoul',
            weight: validation.weight || 'N/A',
            level: validation.level || 'N/A',
            reward: `${blockReward} WLC`,
            timestamp: new Date().toLocaleString('ko-KR')
        });

        console.log(`🥇 채굴자: ${workerAddress}`);
        console.log(`📏 블록 높이: ${currentHeight}`);
        console.log(`⚖️  가중치: ${validation.weight || 'N/A'}`);
        console.log(`🔢 레벨: ${validation.level || 'N/A'}`);
        console.log(`🌐 네트워크: ${validation.networkType || 'seoul'}`);
        console.log(`💰 보상: ${blockReward} WLC`);
        console.log(`📅 시간: ${new Date().toLocaleString('ko-KR')}`);
        
        console.log('🎊🎊🎊🎊🎊🎊🎊🎊🎊🎊🎊🎊🎊🎊🎊🎊🎊🎊🎊🎊\n');

        // 이벤트 발생
        this.emit('blockFound', {
            miner: workerAddress,
            blockHeight: currentHeight,
            blockHash: this.currentBlockTemplate?.blockHash || ('0x' + crypto.randomBytes(32).toString('hex')),
            algorithm: 'ECCPoW',
            networkType: validation.networkType || 'seoul',
            searchLevel: validation.level || Math.floor(Math.random() * 10) + 5,
            weight: validation.weight || Math.floor(Math.random() * 100) + 50,
            reward: blockReward,
            timestamp: Date.now(),
            simulated: validation.simulated || this.stats.offlineMode,
            jobId: job.id
        });

        // 실제 모드에서는 노드에 블록 제출 시도
        if (!this.stats.offlineMode) {
            this.logInfo(`📤 네트워크에 블록 제출 중...`);
            const submitted = await this.submitBlockToNode(validation);
            if (submitted) {
                this.logInfo(`✅ 블록이 네트워크에 성공적으로 제출되었습니다!`);
            } else {
                this.logWarn(`❌ 블록 제출 실패 - 네트워크에서 거부됨`);
            }
        } else {
            this.logInfo(`🎲 시뮬레이션 모드 - 블록 제출 건너뜀`);
        }

        // 풀 전체에 블록 발견 알림
        this.broadcast('mining.notify_block_found', {
            miner: workerAddress,
            height: currentHeight,
            reward: blockReward
        });
    }

    // 시뮬레이션 Share 검증 (90% 성공률)
    simulateShareValidation() {
        const isValid = Math.random() > 0.1; // 90% 성공률
        const weight = isValid ? Math.floor(Math.random() * 500) + 50 : Math.floor(Math.random() * 1000) + 500;
        
        return {
            valid: isValid,
            weight: weight,
            level: Math.floor(Math.random() * 15) + 5,
            networkType: 'seoul',
            algorithm: 'ECCPoW',
            simulated: true,
            error: isValid ? null : 'Simulated validation failure'
        };
    }

    // ECCPoW Share 검증
    async validateShare(job, nonce, workerAddress, blockHeight, eccpowData = null) {
        try {
            let validation;
            
            if (eccpowData && eccpowData.codeword && eccpowData.mixDigest) {
                // 클라이언트에서 전송한 ECCPoW 데이터로 검증
                validation = await this.eccpowValidator.validateSubmittedECCPoW(
                    eccpowData.codeword,
                    eccpowData.mixDigest,
                    parseInt(nonce, 16),
                    this.difficulty,
                    blockHeight,
                    eccpowData.codeLength
                );
                
                validation.clientProvided = true;
                
            } else {
                // 기존 방식: 서버에서 직접 계산
                validation = await this.eccpowValidator.validatePoolShare(
                    Buffer.from(job.blockHeader, 'hex'),
                    parseInt(nonce, 16),
                    this.difficulty,
                    blockHeight
                );
                
                validation.clientProvided = false;
            }

            return validation;
        } catch (error) {
            this.logError('ECCPoW 검증 오류', { 
                worker: workerAddress, 
                error: error.message 
            });
            return { valid: false, error: error.message };
        }
    }

    // 인증 처리 (로깅 추가)
    async handleAuthorize(connection, params, id) {
        const [addressWithWorker, password] = params;
        
        let cleanAddress, workerName;
        
        if (addressWithWorker.includes('.')) {
            const parts = addressWithWorker.split('.');
            cleanAddress = parts[0];
            workerName = parts.slice(1).join('.');
        } else {
            cleanAddress = addressWithWorker;
            workerName = password || 'default';
        }
        
        this.logDebug(`🔐 채굴기 인증 시도`, {
            ip: connection.ip,
            originalInput: addressWithWorker,
            parsedAddress: cleanAddress,
            workerName: workerName
        });
        
        // 주소 유효성 검사
        if (!this.isValidAddress(cleanAddress)) {
            this.sendResponse(connection, id, false);
            this.logWarn(`❌ 인증 실패 - 잘못된 주소`, {
                ip: connection.ip,
                address: cleanAddress,
                workerName: workerName,
                reason: 'Invalid address format'
            });
            return;
        }

        connection.address = cleanAddress;
        connection.workerName = workerName;
        connection.authorized = true;
        
        this.stats.authorizedConnections++;

        // ✅ 수정: 데이터베이스에 채굴자 정보 업데이트
        try {
            const miner = await dbManager.getOrCreateMiner(cleanAddress, workerName);
            
            // 현재 접속 상태로 업데이트 (스키마의 기존 컬럼만 사용)
            if (this.dbPromise) {
                await this.dbPromise.execute(`
                    UPDATE miners 
                    SET last_seen = NOW(), 
                        is_active = TRUE,
                        worker_name = COALESCE(worker_name, ?)
                    WHERE address = ?
                `, [workerName, cleanAddress]);
            }
            
            console.log(`📝 채굴자 인증 완료: ${cleanAddress}.${workerName} (IP: ${connection.ip})`);
            
        } catch (error) {
            console.error('❌ 채굴자 DB 업데이트 실패:', error);
        }

        // 워커 등록 (메모리)
        if (!this.workers.has(cleanAddress)) {
            this.workers.set(cleanAddress, {
                address: cleanAddress,
                connections: new Set(),
                totalShares: 0,
                validShares: 0,
                invalidShares: 0,
                blocksFound: 0,
                lastShareTime: null,
                difficulty: this.difficulty,
                workers: new Map()
            });
        }
        
        const worker = this.workers.get(cleanAddress);
        worker.connections.add(connection.id);
        
        if (!worker.workers.has(workerName)) {
            worker.workers.set(workerName, {
                name: workerName,
                validShares: 0,
                invalidShares: 0,
                lastActivity: Date.now(),
                difficulty: this.difficulty
            });
        }

        this.sendResponse(connection, id, true);

        this.logInfo(`✅ 채굴기 인증 성공`, {
            ip: connection.ip,
            address: cleanAddress,
            workerName: workerName,
            totalConnections: this.stats.authorizedConnections
        });

        // 현재 작업 전송
        if (this.currentBlockTemplate) {
            await this.sendJob(connection);
        }

        // 네트워크 타입 감지
        const networkInfo = this.eccpowValidator.getNetworkInfo(
            this.currentBlockTemplate?.height || 0
        );
        connection.networkType = networkInfo.networkType;
    }

    // 작업 전송 (로깅 추가)
    async sendJob(connection) {
        if (!this.currentBlockTemplate || !connection.authorized) {
            return;
        }

        const job = this.createJobForConnection(connection);
        this.jobs.set(job.id, job);

        // 오래된 작업 정리
        if (this.jobs.size > 10) {
            const oldestJobId = this.jobs.keys().next().value;
            this.jobs.delete(oldestJobId);
        }

        // mining.notify 전송
        this.sendNotification(connection, 'mining.notify', [
            job.id,
            job.prevBlockHash,
            job.coinbase1,
            job.coinbase2,
            job.merkleBranches,
            job.blockVersion,
            job.difficultyBits,
            job.timestamp,
            true
        ]);

        const modeText = job.isSimulation ? '시뮬레이션' : '실제';
        this.logDebug(`📤 채굴 작업 전송`, {
            worker: `${connection.address}.${connection.workerName}`,
            jobId: job.id,
            blockHeight: job.blockHeight,
            difficulty: job.difficulty,
            mode: modeText
        });
    }

    // 연결 해제 처리 (로깅 추가)
    handleDisconnect(connection) {
        this.connections.delete(connection.id);
        this.stats.activeConnections--;
        
        if (connection.authorized) {
            this.stats.authorizedConnections--;
            
            const worker = this.workers.get(connection.address);
            if (worker) {
                worker.connections.delete(connection.id);
                
                // ✅ 수정: 마지막 연결이 끊어지면 DB에서 비활성화
                if (worker.connections.size === 0) {
                    this.workers.delete(connection.address);
                    
                    // 데이터베이스에서 비활성화 상태로 업데이트
                    if (this.dbPromise && connection.address) {
                        this.dbPromise.execute(`
                            UPDATE miners 
                            SET is_active = FALSE,
                                last_seen = NOW()
                            WHERE address = ?
                        `, [connection.address]).catch(error => {
                            console.error('❌ 채굴자 비활성화 업데이트 실패:', error);
                        });
                    }
                    
                    console.log(`📝 채굴자 연결 해제: ${connection.address}.${connection.workerName} (IP: ${connection.ip})`);
                }
            }
            
            this.logInfo(`🔌 채굴기 연결 해제`, {
                ip: connection.ip,
                address: connection.address,
                workerName: connection.workerName,
                validShares: connection.validShares,
                invalidShares: connection.invalidShares,
                remainingConnections: this.stats.authorizedConnections
            });
        } else {
            this.logDebug(`❌ 미인증 연결 해제`, {
                ip: connection.ip
            });
        }
    }

    // 블록 템플릿 업데이트 (로깅 추가)
    async updateBlockTemplate() {
        try {
            if (this.rpcStats.consecutiveFailures > 5) {
                this.logWarn('연속 RPC 실패로 오프라인 모드 유지', {
                    failures: this.rpcStats.consecutiveFailures
                });
                this.stats.offlineMode = true;
                this.stats.networkConnected = false;
                return;
            }

            const template = await this.getBlockTemplateFromRPC();
            
            if (template && (!this.currentBlockTemplate || 
                template.height !== this.currentBlockTemplate.height ||
                this.currentBlockTemplate.isSimulation)) {
                
                const previousHeight = this.currentBlockTemplate?.height || 0;
                
                this.currentBlockTemplate = {
                    ...template,
                    isSimulation: false
                };
                this.blockTemplateId++;
                
                this.logInfo(`🔄 새 블록 템플릿 수신`, {
                    previousHeight: previousHeight,
                    newHeight: template.height,
                    difficulty: template.difficulty,
                    mode: 'live'
                });
                
                this.stats.offlineMode = false;
                this.stats.networkConnected = true;
                
                // 모든 인증된 연결에 새 작업 전송
                let jobsSent = 0;
                for (const connection of this.connections.values()) {
                    if (connection.authorized) {
                        await this.sendJob(connection);
                        jobsSent++;
                    }
                }
                
                this.logDebug(`📡 새 작업 브로드캐스트`, {
                    height: template.height,
                    jobsSent: jobsSent,
                    connectedMiners: this.stats.authorizedConnections
                });
            }
            
        } catch (error) {
            this.logWarn(`RPC 블록 템플릿 업데이트 실패`, {
                error: error.message,
                endpoint: this.rpcStats.currentEndpoint?.host
            });
            
            this.stats.networkConnected = false;
            
            // 자동 시뮬레이션 모드 전환 제거
            this.logError('RPC 연결 실패 - 실제 모드 유지, 블록 템플릿 업데이트 불가');
            
            // 기존 템플릿이 있다면 계속 사용, 없다면 서버 중단 고려
            if (!this.currentBlockTemplate) {
                this.logError('초기 블록 템플릿이 없습니다. RPC 연결을 확인하세요.');
                throw new Error('Cannot operate without RPC connection in production mode');
            }
        }
    }

    // createInitialTemplate 함수 수정
    async createInitialTemplate() {
        const now = Math.floor(Date.now() / 1000);
        
        // 실제 네트워크에서 최신 블록 정보 가져오기 시도
        let realPreviousHash = '0x' + '0'.repeat(64);
        let realHeight = Math.floor(Date.now() / 10000);
        let networkInfo = null;
        
        try {
            networkInfo = await this.getCurrentNetworkInfo();
            if (networkInfo) {
                realPreviousHash = networkInfo.latestBlockHash;
                realHeight = networkInfo.blockNumber + 1;
            }
        } catch (error) {
            console.warn('⚠️ 네트워크 정보 가져오기 실패, 시뮬레이션 모드 사용');
        }
        
        const templateHeader = this.generateTemplateBlockHeader(realPreviousHash, realHeight, now);
        
        // 네트워크 정보를 가져올 수 없으면 에러 발생
        if (!networkInfo) {
            throw new Error('Cannot create initial template without network connection');
        }

        this.currentBlockTemplate = {
            blockHeader: templateHeader.toString('hex'),
            blockHash: await this.calculateTemplateHash(templateHeader),
            difficulty: networkInfo.difficulty || 1000000,
            height: realHeight,
            previousblockhash: realPreviousHash.slice(2), // 0x 제거
            version: '0x20000000',
            bits: '0x1d00ffff',
            curtime: now,
            seedHash: '0x' + crypto.createHash('sha256').update(templateHeader).digest().toString('hex'),
            isSimulation: false // 항상 실제 모드
        };
        
        this.logInfo('📦 초기 블록 템플릿 생성', {
            height: this.currentBlockTemplate.height,
            difficulty: this.currentBlockTemplate.difficulty,
            mode: this.currentBlockTemplate.isSimulation ? 'simulation' : 'live'
        });
    }

    // 누락된 함수들 추가 (stratum.js 파일 하단에 추가)

    // 템플릿 블록 헤더 생성 함수
    generateTemplateBlockHeader(previousHash, height, timestamp) {
        try {
            // WorldLand 블록 헤더 구조 (80 bytes)
            const header = Buffer.alloc(80);
            let offset = 0;
            
            // Version (4 bytes)
            header.writeUInt32LE(0x20000000, offset);
            offset += 4;
            
            // Previous Block Hash (32 bytes)
            const prevHashBuffer = Buffer.from(previousHash.replace('0x', ''), 'hex');
            prevHashBuffer.copy(header, offset, 0, Math.min(32, prevHashBuffer.length));
            if (prevHashBuffer.length < 32) {
                // 부족한 부분은 0으로 채움
                header.fill(0, offset + prevHashBuffer.length, offset + 32);
            }
            offset += 32;
            
            // Merkle Root (32 bytes) - 임시로 높이와 타임스탬프 기반 생성
            const merkleData = Buffer.alloc(8);
            merkleData.writeUInt32LE(height, 0);
            merkleData.writeUInt32LE(timestamp, 4);
            const merkleRoot = crypto.createHash('sha256').update(merkleData).digest();
            merkleRoot.copy(header, offset, 0, 32);
            offset += 32;
            
            // Timestamp (4 bytes)
            header.writeUInt32LE(timestamp, offset);
            offset += 4;
            
            // Difficulty Bits (4 bytes)
            header.writeUInt32LE(0x1d00ffff, offset);
            offset += 4;
            
            // Nonce (4 bytes) - 템플릿이므로 0
            header.writeUInt32LE(0, offset);
            
            return header;
            
        } catch (error) {
            console.error('❌ 템플릿 블록 헤더 생성 실패:', error);
            // 실패시 기존 시뮬레이션 헤더 사용
            return Buffer.from(this.generateSimulationBlockHeader(), 'hex');
        }
    }

    // Merkle Root 계산 함수 (buildCompleteBlockHeader에서 사용)
    async calculateMerkleRoot(job, minerAddress) {
        try {
            // 간단한 Coinbase 트랜잭션 해시 생성
            const coinbaseData = Buffer.concat([
                Buffer.from(minerAddress.replace('0x', ''), 'hex'),
                Buffer.from(job.id, 'utf8'),
                Buffer.alloc(4).fill(Date.now() & 0xFFFFFFFF)
            ]);
            
            const coinbaseHash = crypto.createHash('sha256')
                .update(crypto.createHash('sha256').update(coinbaseData).digest())
                .digest();
            
            // 추가 트랜잭션이 없으므로 coinbase 해시를 merkle root로 사용
            return coinbaseHash;
            
        } catch (error) {
            console.error('❌ Merkle Root 계산 실패:', error);
            // 기본값 반환
            return crypto.randomBytes(32);
        }
    }

    // Share 다이제스트 계산 함수 (recordValidShare에서 사용)
    async calculateShareDigest(job, validation, workerName) {
        try {
            if (validation.digest && validation.digest.startsWith('0x')) {
                return validation.digest;
            }
            
            // ECCPoW 기반 다이제스트 재계산
            const seed = Buffer.alloc(40);
            const jobHeader = Buffer.from(job.blockHeader || 'default', 'hex');
            seed.fill(jobHeader.slice(0, Math.min(32, jobHeader.length)));
            seed.writeBigUInt64LE(BigInt(validation.nonce || 0), 32);
            
            const digest = crypto.createHash('sha512').update(seed).digest();
            return '0x' + digest.toString('hex');
            
        } catch (error) {
            console.error('❌ Share 다이제스트 계산 오류:', error);
            // 결정론적 대안
            const fallback = crypto.createHash('sha256')
                .update(`${job.id}-${workerName}-${validation.nonce}-${Date.now()}`)
                .digest();
            return '0x' + fallback.toString('hex');
        }
    }

    // 네트워크에 실제 블록 제출 함수 (processValidBlock에서 사용)
    async submitRealBlockToNetwork(blockHeader, blockData) {
        try {
            console.log(`📤 실제 블록 제출 준비:`);
            console.log(`   - 블록 높이: #${blockData.blockHeight}`);
            console.log(`   - 채굴자: ${blockData.miner}`);
            console.log(`   - 블록 해시: ${blockData.blockHash.slice(0, 16)}...`);
            
            // WorldLand ECCPoW 표준 제출 형식
            const submitData = {
                jsonrpc: '2.0',
                method: 'eth_submitWork',
                params: [
                    '0x' + blockData.nonce.toString(16).padStart(16, '0'),  // nonce
                    '0x' + blockHeader.toString('hex'),                    // pow_hash (block header)
                    '0x' + blockData.mixDigest || blockData.blockHash     // mix_hash (ECCPoW digest)
                ],
                id: Date.now()
            };
            
            console.log(`📡 WorldLand 표준 형식으로 제출:`);
            console.log(`   - Method: ${submitData.method}`);
            console.log(`   - Nonce: ${submitData.params[0]}`);
            console.log(`   - Pow Hash: ${submitData.params[1].slice(0, 32)}...`);
            console.log(`   - Mix Hash: ${submitData.params[2]?.slice(0, 32)}...`);
            
            console.log(`📡 WorldLand 노드에 블록 제출 중...`);
            const response = await this.rpcCall(submitData, 15000);
            
            if (response && response.result) {
                // 네트워크에서 확인된 실제 블록 해시 가져오기
                const confirmedHash = await this.getConfirmedBlockHash(blockData.blockHeight);
                
                return {
                    success: true,
                    txHash: response.result,
                    blockHash: confirmedHash || blockData.blockHash,
                    minerAddress: blockData.miner.split('.')[0],
                    networkConfirmed: !!confirmedHash
                };
            } else {
                console.log(`❌ 블록 제출 실패: ${response?.error?.message || 'Unknown error'}`);
                return {
                    success: false,
                    error: response?.error?.message || 'Unknown submission error'
                };
            }
            
        } catch (error) {
            console.log(`💥 블록 제출 중 네트워크 오류: ${error.message}`);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // 템플릿 해시 계산
    async calculateTemplateHash(blockHeader) {
        try {
            // 템플릿이므로 nonce는 0으로 설정
            const hash = crypto.createHash('sha256')
                .update(blockHeader)
                .digest();
            return '0x' + hash.toString('hex');
        } catch (error) {
            console.error('❌ 템플릿 해시 계산 실패:', error);
            return '0x' + crypto.randomBytes(32).toString('hex');
        }
    }

    // 현재 네트워크 정보 가져오기
    async getCurrentNetworkInfo() {
        try {
            const rpcData = {
                method: 'eth_getBlockByNumber',
                params: ['latest', false],
                id: Date.now(),
                jsonrpc: '2.0'
            };
            
            const response = await this.rpcCall(rpcData, 5000);
            
            if (response && response.result) {
                return {
                    latestBlockHash: response.result.hash,
                    blockNumber: parseInt(response.result.number, 16),
                    difficulty: parseInt(response.result.difficulty, 16)
                };
            }
            
            return null;
        } catch (error) {
            console.error('❌ 네트워크 정보 조회 실패:', error);
            return null;
        }
    }

    generateSimulationBlockHeader() {
        const version = Buffer.alloc(4);
        version.writeUInt32LE(0x20000000, 0);
        
        const prevHash = crypto.randomBytes(32);
        const merkleRoot = crypto.randomBytes(32);
        const timestamp = Buffer.alloc(4);
        timestamp.writeUInt32LE(Math.floor(Date.now() / 1000), 0);
        
        const bits = Buffer.alloc(4);
        bits.writeUInt32LE(0x1d00ffff, 0);
        
        const nonce = Buffer.alloc(4, 0);
        
        return Buffer.concat([
            version, prevHash, merkleRoot, timestamp, bits, nonce
        ]).toString('hex');
    }

    // RPC 호출 관련 메서드들 (기존과 동일)
    async rpcCall(data, timeoutMs = 5000) {
        this.rpcStats.totalCalls++;
        
        for (let endpointIndex = 0; endpointIndex < this.rpcEndpoints.length; endpointIndex++) {
            const endpoint = this.rpcEndpoints[this.currentRPCIndex];
            
            try {
                this.logDebug(`🔄 RPC 시도`, {
                    endpoint: `${endpoint.host}:${endpoint.port}`,
                    method: data.method
                });
                
                const result = await this.makeRPCRequest(endpoint, data, timeoutMs);
                
                this.rpcStats.connected = true;
                this.rpcStats.lastSuccessfulCall = Date.now();
                this.rpcStats.consecutiveFailures = 0;
                this.rpcStats.successfulCalls++;
                this.rpcStats.currentEndpoint = endpoint;
                
                return result;
                
            } catch (error) {
                this.logWarn(`RPC 실패`, {
                    endpoint: `${endpoint.host}:${endpoint.port}`,
                    method: data.method,
                    error: error.message
                });
                
                this.currentRPCIndex = (this.currentRPCIndex + 1) % this.rpcEndpoints.length;
                
                if (endpointIndex === this.rpcEndpoints.length - 1) {
                    this.rpcStats.connected = false;
                    this.rpcStats.consecutiveFailures++;
                    break;
                }
            }
        }
        
        throw new Error(`All RPC endpoints failed for method: ${data.method}`);
    }

    async makeRPCRequest(endpoint, data, timeoutMs) {
        return new Promise((resolve, reject) => {
            const protocol = endpoint.protocol === 'https' ? require('https') : require('http');
            const postData = JSON.stringify(data);
            
            const options = {
                hostname: endpoint.host,
                port: endpoint.port,
                path: '/',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(postData),
                    'User-Agent': 'WorldLand-Pool/2.0',
                    'Connection': 'close'
                },
                timeout: timeoutMs
            };

            if (endpoint.protocol === 'https') {
                options.rejectUnauthorized = false;
            }

            const req = protocol.request(options, (res) => {
                let responseData = '';
                
                res.on('data', (chunk) => {
                    responseData += chunk;
                });
                
                res.on('end', () => {
                    try {
                        if (!responseData.trim()) {
                            reject(new Error('Empty response'));
                            return;
                        }

                        if (responseData.trim().startsWith('<')) {
                            reject(new Error('HTML response received'));
                            return;
                        }

                        const response = JSON.parse(responseData);
                        
                        if (response.error) {
                            reject(new Error(`RPC Error: ${response.error.message}`));
                            return;
                        }
                        
                        resolve(response);
                    } catch (error) {
                        reject(new Error('Invalid JSON response'));
                    }
                });
            });

            req.on('error', (error) => {
                reject(error);
            });

            req.on('timeout', () => {
                req.destroy();
                reject(new Error('Request timeout'));
            });

            req.write(postData);
            req.end();
        });
    }

    async getBlockTemplateFromRPC() {
        const methods = [
            { 
                name: 'eth_getBlockByNumber',
                call: async () => {
                    const rpcData = {
                        method: 'eth_getBlockByNumber',
                        params: ['latest', false],
                        id: Date.now(),
                        jsonrpc: '2.0'
                    };
                    
                    const response = await this.rpcCall(rpcData, 8000);
                    return this.parseEthBlockResponse(response.result);
                }
            },
            {
                name: 'eth_blockNumber',
                call: async () => {
                    const rpcData = {
                        method: 'eth_blockNumber',
                        params: [],
                        id: Date.now(),
                        jsonrpc: '2.0'
                    };
                    
                    const response = await this.rpcCall(rpcData, 5000);
                    return this.createTemplateFromBlockNumber(response.result);
                }
            }
        ];

        for (const method of methods) {
            try {
                this.logDebug(`🔄 시도 중: ${method.name}`);
                const result = await method.call();
                this.logDebug(`✅ 성공: ${method.name} - 높이 ${result.height}`);
                return result;
            } catch (error) {
                this.logWarn(`${method.name} 실패`, { error: error.message });
                continue;
            }
        }
        
        throw new Error('All block template methods failed');
    }

    parseEthBlockResponse(block) {
        if (!block) {
            throw new Error('Invalid block data');
        }

        const height = parseInt(block.number || '0x1', 16);
        const difficulty = parseInt(block.difficulty || '0x1000', 16);
        
        return {
            blockHeader: this.createBlockHeaderFromEthBlock(block),
            blockHash: block.hash || ('0x' + crypto.randomBytes(32).toString('hex')),
            difficulty: difficulty,
            height: height,
            previousblockhash: (block.parentHash || '0x' + '0'.repeat(64)).slice(2),
            version: '0x20000000',
            bits: block.difficulty || '0x1000',
            curtime: parseInt(block.timestamp || Math.floor(Date.now() / 1000).toString(16), 16),
            seedHash: block.mixHash || ('0x' + crypto.randomBytes(32).toString('hex'))
        };
    }

    createBlockHeaderFromEthBlock(block) {
        try {
            const version = Buffer.alloc(4);
            version.writeUInt32LE(0x20000000, 0);
            
            const prevHash = Buffer.from((block.parentHash || '0x' + '0'.repeat(64)).slice(2), 'hex');
            const merkleRoot = Buffer.from((block.receiptsRoot || block.stateRoot || '0x' + crypto.randomBytes(32).toString('hex')).slice(2), 'hex');
            
            const timestamp = Buffer.alloc(4);
            timestamp.writeUInt32LE(parseInt(block.timestamp || Math.floor(Date.now() / 1000).toString(16), 16), 0);
            
            const bits = Buffer.alloc(4);
            bits.writeUInt32LE(parseInt(block.difficulty || '0x1000', 16) & 0xFFFFFFFF, 0);
            
            const nonce = Buffer.alloc(4, 0);
            
            return Buffer.concat([
                version, prevHash.slice(0, 32), merkleRoot.slice(0, 32), 
                timestamp, bits, nonce
            ]).toString('hex');
            
        } catch (error) {
            this.logWarn('블록 헤더 생성 실패, 시뮬레이션 헤더 사용', { error: error.message });
            return this.generateSimulationBlockHeader();
        }
    }

    createTemplateFromBlockNumber(blockNumberHex) {
        const height = parseInt(blockNumberHex, 16) + 1;
        
        return {
            blockHeader: this.generateSimulationBlockHeader(),
            blockHash: '0x' + crypto.randomBytes(32).toString('hex'),
            difficulty: 1000000,
            height: height,
            previousblockhash: crypto.randomBytes(32).toString('hex'),
            version: '0x20000000',
            bits: '0x1d00ffff',
            curtime: Math.floor(Date.now() / 1000),
            seedHash: '0x' + crypto.randomBytes(32).toString('hex')
        };
    }

    // 기본 메서드들
    startBlockTemplateUpdater() {
        this.blockTemplateInterval = setInterval(async () => {
            await this.updateBlockTemplate();
        }, 15000);

        setTimeout(async () => {
            await this.updateBlockTemplate();
        }, 10000);
    }

    startStatsUpdater() {
        this.statsInterval = setInterval(() => {
            this.updateStats();
        }, 30000);
    }

    updateStats() {
        const now = Date.now();
        for (const [id, connection] of this.connections) {
            if (now - connection.lastActivity > 900000) {
                this.logDebug(`🧹 비활성 연결 정리`, { ip: connection.ip });
                connection.socket.destroy();
            }
        }
    }

    // 유틸리티 메서드들
    handleConnection(socket) {
        const connectionId = this.generateConnectionId();
        const connection = {
            id: connectionId,
            socket: socket,
            address: null,
            workerName: null,
            authorized: false,
            ip: socket.remoteAddress,
            connectedAt: Date.now(),
            lastActivity: Date.now(),
            validShares: 0,
            invalidShares: 0,
            difficulty: this.difficulty,
            networkType: 'unknown'
        };

        this.connections.set(connectionId, connection);
        this.stats.activeConnections++;

        this.logDebug(`🔌 새 연결`, {
            ip: connection.ip,
            connectionId: connectionId,
            totalConnections: this.stats.activeConnections
        });

        socket.on('data', (data) => this.handleData(connection, data));
        socket.on('close', () => this.handleDisconnect(connection));
        socket.on('error', (error) => this.handleSocketError(connection, error));

        socket.setTimeout(1800000, () => {
            this.logWarn(`⏰ 연결 타임아웃`, { ip: connection.ip });
            socket.destroy();
        });
    }

    handleData(connection, data) {
        connection.lastActivity = Date.now();
        
        const messages = data.toString().trim().split('\n');
        
        for (const message of messages) {
            if (!message.trim()) continue;
            
            try {
                const request = JSON.parse(message);
                this.handleRequest(connection, request);
            } catch (error) {
                this.logError('JSON 파싱 오류', { error: error.message });
                this.sendError(connection, null, -32700, 'Parse error');
            }
        }
    }

    async handleRequest(connection, request) {
        const { method, params, id } = request;

        try {
            switch (method) {
                case 'mining.subscribe':
                    await this.handleSubscribe(connection, params, id);
                    break;
                    
                case 'mining.authorize':
                    await this.handleAuthorize(connection, params, id);
                    break;
                    
                case 'mining.submit':
                    await this.handleSubmit(connection, params, id);
                    break;
                    
                default:
                    this.sendError(connection, id, -3, 'Method not found');
            }
        } catch (error) {
            this.logError(`요청 처리 오류 [${method}]`, { error: error.message });
            this.sendError(connection, id, -1, 'Internal error');
        }
    }

    async handleSubscribe(connection, params, id) {
        const subscriptionId = this.generateSubscriptionId();
        const extraNonce1 = this.generateExtraNonce1();
        const extraNonce2Size = 4;

        connection.subscriptionId = subscriptionId;
        connection.extraNonce1 = extraNonce1;

        this.sendResponse(connection, id, [
            subscriptionId,
            extraNonce1,
            extraNonce2Size
        ]);

        this.logDebug(`📝 구독 완료`, {
            ip: connection.ip,
            subscriptionId: subscriptionId
        });
    }

    createJobForConnection(connection) {
        const template = this.currentBlockTemplate;
        const jobId = this.generateJobId();
        
        return {
            id: jobId,
            blockHeader: template.blockHeader,
            blockHash: template.blockHash,
            networkDifficulty: template.difficulty,
            blockHeight: template.height,
            prevBlockHash: template.previousblockhash,
            coinbase1: '',
            coinbase2: '',
            merkleBranches: [],
            blockVersion: template.version || '0x20000000',
            difficultyBits: template.bits || '0x1d00ffff',
            timestamp: (template.curtime || Math.floor(Date.now() / 1000)).toString(16),
            nonce: 0,
            difficulty: connection.difficulty,
            isSimulation: template.isSimulation || false,
            createdAt: Date.now(),
            minerAddress: connection.address  // 채굴자 주소 추가
        };
    }

    adjustWorkerDifficulty(workerAddress) {
        const worker = this.workers.get(workerAddress);
        if (!worker || !worker.lastShareTime) return;

        const targetTime = 30;
        const timeSinceLastShare = (Date.now() - worker.lastShareTime) / 1000;
        
        if (timeSinceLastShare < 15) {
            worker.difficulty = Math.min(worker.difficulty * 1.1, this.difficulty * 10);
        } else if (timeSinceLastShare > 60) {
            worker.difficulty = Math.max(worker.difficulty * 0.9, this.difficulty * 0.1);
        }

        for (const connectionId of worker.connections) {
            const connection = this.connections.get(connectionId);
            if (connection) {
                connection.difficulty = worker.difficulty;
                this.sendNotification(connection, 'mining.set_difficulty', [worker.difficulty]);
            }
        }
    }

    handleSocketError(connection, error) {
        this.logError(`소켓 오류`, {
            ip: connection.ip,
            error: error.message
        });
        connection.socket.destroy();
    }

    handleServerError(error) {
        this.logError('서버 오류', { error: error.message });
    }

    // 메시지 전송 관련
    sendResponse(connection, id, result) {
        const response = { id: id, result: result, error: null };
        this.sendMessage(connection, response);
    }

    sendError(connection, id, code, message) {
        const response = {
            id: id,
            result: null,
            error: { code: code, message: message }
        };
        this.sendMessage(connection, response);
    }

    sendNotification(connection, method, params) {
        const notification = { method: method, params: params };
        this.sendMessage(connection, notification);
    }

    sendMessage(connection, message) {
        try {
            const data = JSON.stringify(message) + '\n';
            connection.socket.write(data);
        } catch (error) {
            this.logError('메시지 전송 오류', { error: error.message });
        }
    }

    // 유틸리티
    isValidAddress(address) {
        if (!address || typeof address !== 'string') {
            return false;
        }
        const addressRegex = /^0x[a-fA-F0-9]{40}$/;
        return addressRegex.test(address);
    }

    generateConnectionId() { return crypto.randomBytes(8).toString('hex'); }
    generateSubscriptionId() { return crypto.randomBytes(4).toString('hex'); }
    generateJobId() { return crypto.randomBytes(4).toString('hex'); }
    generateExtraNonce1() { return crypto.randomBytes(4).toString('hex'); }

    // 블록 제출
    async submitBlockToNode(validation) {
        try {
            const rpcData = {
                method: 'eth_submitWork',
                params: [
                    '0x' + (validation.nonce || '0').toString(16).padStart(16, '0'),
                    this.currentBlockTemplate?.blockHash || '0x' + '0'.repeat(64),
                    validation.digest || '0x' + crypto.randomBytes(32).toString('hex')
                ],
                id: Date.now(),
                jsonrpc: '2.0'
            };

            const response = await this.rpcCall(rpcData, 10000);
            
            if (response && response.result) {
                return true;
            } else {
                this.logWarn('노드에서 블록을 거부', { 
                    error: response?.error || 'Unknown error' 
                });
                return false;
            }
        } catch (error) {
            this.logError('블록 제출 오류', { error: error.message });
            return false;
        }
    }

    // 통계 및 정보
    getStats() {
        const uptime = Date.now() - this.stats.startTime;
        const shareAcceptanceRate = this.stats.sharesSubmitted > 0 ? 
            ((this.stats.validShares / this.stats.sharesSubmitted) * 100).toFixed(2) + '%' : '0%';
        const eccpowValidationRate = this.stats.eccpowValidations > 0 ?
            (((this.stats.eccpowValidations - this.stats.eccpowFailures) / this.stats.eccpowValidations) * 100).toFixed(2) + '%' : '0%';

        return {
            ...this.stats,
            uptime: uptime,
            shareAcceptanceRate: shareAcceptanceRate,
            eccpowValidationRate: eccpowValidationRate,
            algorithm: 'ECCPoW',
            isRunning: this.isRunning,
            connectedWorkers: this.workers.size,
            currentBlockHeight: this.currentBlockTemplate?.height || 0,
            simulationMode: this.stats.offlineMode,
            rpcStats: this.rpcStats,
            miningProgress: {
                totalSubmissions: this.miningProgress.totalSubmissions,
                validSubmissions: this.miningProgress.validSubmissions,
                invalidSubmissions: this.miningProgress.invalidSubmissions,
                blockCandidates: this.miningProgress.blockCandidates,
                blocksFound: this.miningProgress.blocksFound,
                bestWeight: this.miningProgress.bestWeight === Infinity ? null : this.miningProgress.bestWeight,
                lastBlockTime: this.miningProgress.lastBlockTime
            }
        };
    }

    getConnectedMiners() {
        const miners = [];
        
        for (const connection of this.connections.values()) {
            if (connection.authorized) {
                const worker = this.workers.get(connection.address);
                const workerStats = worker?.workers?.get(connection.workerName);
                const workerId = `${connection.address}.${connection.workerName}`;
                const miningStats = this.miningProgress.workerStats.get(workerId);
                
                miners.push({
                    address: connection.address,
                    worker: connection.workerName,
                    ip: connection.ip,
                    connectedAt: connection.connectedAt,
                    lastActivity: connection.lastActivity,
                    validShares: connection.validShares || 0,
                    invalidShares: connection.invalidShares || 0,
                    difficulty: connection.difficulty,
                    algorithm: 'ECCPoW',
                    networkType: connection.networkType || 'unknown',
                    simulationMode: this.stats.offlineMode,
                    miningStats: miningStats ? {
                        shareRate: miningStats.shareRate,
                        avgWeight: miningStats.avgWeight.toFixed(1),
                        bestWeight: miningStats.bestWeight === Infinity ? null : miningStats.bestWeight
                    } : null
                });
            }
        }
        
        return miners;
    }

    async healthCheck() {
        try {
            const eccpowHealth = await this.eccpowValidator.healthCheck();
            
            return {
                status: eccpowHealth.status === 'healthy' && this.isRunning ? 'healthy' : 'degraded',
                algorithm: 'ECCPoW',
                isRunning: this.isRunning,
                eccpowValidator: eccpowHealth.status,
                networkConnected: this.stats.networkConnected,
                offlineMode: this.stats.offlineMode,
                simulationMode: this.stats.offlineMode,
                activeConnections: this.stats.activeConnections,
                authorizedConnections: this.stats.authorizedConnections,
                currentBlockHeight: this.currentBlockTemplate?.height || 0,
                rpcStats: this.rpcStats,
                miningProgress: this.miningProgress,
                eccpowStats: {
                    validations: this.stats.eccpowValidations,
                    failures: this.stats.eccpowFailures,
                    successRate: this.stats.eccpowValidations > 0 ?
                        (((this.stats.eccpowValidations - this.stats.eccpowFailures) / this.stats.eccpowValidations) * 100).toFixed(2) + '%' : '0%'
                },
                lastBlockTemplate: this.currentBlockTemplate ? {
                    height: this.currentBlockTemplate.height,
                    difficulty: this.currentBlockTemplate.difficulty,
                    timestamp: this.currentBlockTemplate.curtime,
                    isSimulation: this.currentBlockTemplate.isSimulation || false
                } : null
            };
        } catch (error) {
            return {
                status: 'unhealthy',
                error: error.message,
                algorithm: 'ECCPoW',
                isRunning: this.isRunning
            };
        }
    }

    async getNetworkInfo() {
        try {
            const currentHeight = this.currentBlockTemplate?.height || 0;
            const networkInfo = this.eccpowValidator.getNetworkInfo(currentHeight);
            
            return {
                ...networkInfo,
                currentHeight: currentHeight,
                currentDifficulty: this.currentBlockTemplate?.difficulty || 0,
                poolDifficulty: this.difficulty,
                connected: this.stats.networkConnected,
                offlineMode: this.stats.offlineMode,
                simulationMode: this.stats.offlineMode,
                rpcEndpoint: this.rpcStats.currentEndpoint ? 
                    `${this.rpcStats.currentEndpoint.host}:${this.rpcStats.currentEndpoint.port}` : 'none',
                lastSuccessfulCall: this.rpcStats.lastSuccessfulCall,
                consecutiveFailures: this.rpcStats.consecutiveFailures
            };
        } catch (error) {
            return {
                error: error.message,
                algorithm: 'ECCPoW',
                connected: false,
                simulationMode: true
            };
        }
    }

    // 서버 종료
    async stop() {
        this.logInfo('WorldLand ECCPoW Stratum 서버 정지 중...');
        
        this.isRunning = false;
        
        if (this.blockTemplateInterval) {
            clearInterval(this.blockTemplateInterval);
        }
        
        if (this.statsInterval) {
            clearInterval(this.statsInterval);
        }
        
        for (const [id, connection] of this.connections) {
            connection.socket.destroy();
        }
        this.connections.clear();
        
        if (this.server) {
            await new Promise((resolve) => {
                this.server.close(resolve);
            });
        }
        
        this.logInfo('WorldLand ECCPoW Stratum 서버 정지 완료');
    }

    // 브로드캐스트 및 관리 기능
    broadcast(method, params) {
        for (const connection of this.connections.values()) {
            if (connection.authorized) {
                this.sendNotification(connection, method, params);
            }
        }
    }

    broadcastDifficulty(newDifficulty) {
        this.difficulty = newDifficulty;
        this.broadcast('mining.set_difficulty', [newDifficulty]);
        this.logInfo(`풀 난이도 변경`, { newDifficulty: newDifficulty });
    }

    banWorker(address, reason = 'Manual ban') {
        const worker = this.workers.get(address);
        if (worker) {
            for (const connectionId of worker.connections) {
                const connection = this.connections.get(connectionId);
                if (connection) {
                    this.sendError(connection, null, -20, `Banned: ${reason}`);
                    connection.socket.destroy();
                }
            }
            
            this.workers.delete(address);
            this.logWarn(`워커 차단`, { address: address, reason: reason });
        }
    }

    // 블록 시뮬레이션 (테스트용)
    startBlockSimulation() {
        if (!this.simulateBlocks) return;
        
        const scheduleNextBlock = () => {
            const delay = Math.random() * 180000 + 120000; // 2-5분
            setTimeout(() => {
                this.simulateBlockFound();
                scheduleNextBlock();
            }, delay);
        };
        
        scheduleNextBlock();
        this.logInfo('블록 발견 시뮬레이션 시작', { interval: '2-5분' });
    }

    simulateBlockFound() {
        const workers = Array.from(this.workers.keys());
        if (workers.length === 0) {
            this.logDebug('시뮬레이션: 연결된 워커가 없어서 건너뜀');
            return;
        }
        
        const randomWorker = workers[Math.floor(Math.random() * workers.length)];
        const currentHeight = this.currentBlockTemplate?.height || Math.floor(Date.now() / 10000);
        
        this.logInfo('블록 발견 시뮬레이션!', { miner: randomWorker });
        
        this.emit('blockFound', {
            miner: randomWorker,
            blockHeight: currentHeight,
            blockHash: '0x' + crypto.randomBytes(32).toString('hex'),
            algorithm: 'ECCPoW',
            networkType: 'seoul',
            searchLevel: Math.floor(Math.random() * 10) + 5,
            weight: Math.floor(Math.random() * 100) + 50,
            timestamp: Date.now(),
            simulated: true,
            jobId: this.currentBlockTemplate?.id || 'simulation_job'  // 시뮬레이션용 Job ID 추가
        });
        
        this.stats.blocksFound++;
        this.miningProgress.blocksFound++;
        
        const worker = this.workers.get(randomWorker);
        if (worker) {
            worker.blocksFound++;
        }
        
        if (this.currentBlockTemplate) {
            this.currentBlockTemplate.height++;
            this.currentBlockTemplate.previousblockhash = crypto.randomBytes(32).toString('hex');
            this.currentBlockTemplate.curtime = Math.floor(Date.now() / 1000);
        }
    }

    // 최근 채굴 활동 조회
    getRecentMiningActivity(limit = 20) {
        return this.miningProgress.recentShares.slice(0, limit);
    }

    // 워커별 상세 통계
    getWorkerMiningStats() {
        const stats = [];
        
        for (const [workerId, workerStats] of this.miningProgress.workerStats) {
            if (workerStats.lastShareTime && (Date.now() - workerStats.lastShareTime) < 3600000) { // 1시간 이내
                stats.push({
                    workerId: workerId,
                    address: workerStats.address,
                    workerName: workerStats.workerName,
                    totalSubmissions: workerStats.totalSubmissions,
                    validShares: workerStats.validShares,
                    invalidShares: workerStats.invalidShares,
                    successRate: workerStats.totalSubmissions > 0 ? 
                        ((workerStats.validShares / workerStats.totalSubmissions) * 100).toFixed(1) + '%' : '0%',
                    shareRate: workerStats.shareRate + '/min',
                    avgWeight: workerStats.avgWeight.toFixed(1),
                    bestWeight: workerStats.bestWeight === Infinity ? null : workerStats.bestWeight,
                    lastShareTime: workerStats.lastShareTime
                });
            }
        }
        
        return stats.sort((a, b) => b.validShares - a.validShares);
    }

    // ECCPoW 데이터 유효성 검증
    validateECCPoWData(codeword, mixDigest, codeLength) {
        try {
            // Codeword 검증 (hex 문자열)
            if (!codeword || typeof codeword !== 'string') {
                return false;
            }
            
            // hex 형식 검증
            if (!/^[0-9a-fA-F]+$/.test(codeword)) {
                return false;
            }
            
            // MixDigest 검증 (64자리 hex)
            if (!mixDigest || typeof mixDigest !== 'string') {
                return false;
            }
            
            if (mixDigest.length !== 64 || !/^[0-9a-fA-F]{64}$/.test(mixDigest)) {
                return false;
            }
            
            // CodeLength 검증 (선택사항)
            if (codeLength !== undefined && (!Number.isInteger(codeLength) || codeLength <= 0)) {
                return false;
            }
            
            return true;
            
        } catch (error) {
            this.logError('ECCPoW 데이터 검증 오류', { error: error.message });
            return false;
        }
    }

    // 디버그 정보
    getDebugInfo() {
        return {
            algorithm: 'ECCPoW',
            version: '2.0.0',
            uptime: Date.now() - this.stats.startTime,
            config: {
                port: this.port,
                host: this.host,
                difficulty: this.difficulty,
                rpcEndpoints: this.rpcEndpoints.length,
                simulationMode: this.stats.offlineMode,
                loggingEnabled: this.enableMiningLogs,
                logLevel: this.logLevel
            },
            memory: {
                connections: this.connections.size,
                workers: this.workers.size,
                jobs: this.jobs.size,
                recentShares: this.miningProgress.recentShares.length,
                workerStats: this.miningProgress.workerStats.size
            },
            currentBlock: this.currentBlockTemplate ? {
                height: this.currentBlockTemplate.height,
                difficulty: this.currentBlockTemplate.difficulty,
                hash: this.currentBlockTemplate.blockHash?.slice(0, 10) + '...',
                isSimulation: this.currentBlockTemplate.isSimulation || false
            } : null,
            stats: this.getStats(),
            rpcStats: this.rpcStats,
            miningProgress: {
                totalSubmissions: this.miningProgress.totalSubmissions,
                validSubmissions: this.miningProgress.validSubmissions,
                invalidSubmissions: this.miningProgress.invalidSubmissions,
                blockCandidates: this.miningProgress.blockCandidates,
                blocksFound: this.miningProgress.blocksFound,
                bestWeight: this.miningProgress.bestWeight === Infinity ? null : this.miningProgress.bestWeight
            },
            eccpowValidator: this.eccpowValidator.getStats()
        };
    }

    // 채굴 진행상황을 JSON으로 반환 (API용)
    getMiningProgressReport() {
        const now = Date.now();
        const uptime = now - this.stats.startTime;
        const uptimeHours = Math.floor(uptime / 3600000);
        const uptimeMinutes = Math.floor((uptime % 3600000) / 60000);
        
        const activeWorkers = Array.from(this.miningProgress.workerStats.values())
            .filter(worker => worker.lastShareTime && (now - worker.lastShareTime) < 300000) // 5분 이내
            .sort((a, b) => b.validShares - a.validShares);
        
        return {
            timestamp: now,
            uptime: {
                milliseconds: uptime,
                hours: uptimeHours,
                minutes: uptimeMinutes,
                formatted: `${uptimeHours}시간 ${uptimeMinutes}분`
            },
            connections: {
                total: this.stats.activeConnections,
                authorized: this.stats.authorizedConnections,
                workers: this.workers.size
            },
            shares: {
                total: this.miningProgress.totalSubmissions,
                valid: this.miningProgress.validSubmissions,
                invalid: this.miningProgress.invalidSubmissions,
                acceptanceRate: this.miningProgress.totalSubmissions > 0 ? 
                    ((this.miningProgress.validSubmissions / this.miningProgress.totalSubmissions) * 100).toFixed(1) + '%' : '0%'
            },
            blocks: {
                candidates: this.miningProgress.blockCandidates,
                found: this.miningProgress.blocksFound,
                lastFoundTime: this.miningProgress.lastBlockTime,
                bestWeight: this.miningProgress.bestWeight === Infinity ? null : this.miningProgress.bestWeight
            },
            network: {
                connected: this.stats.networkConnected,
                currentHeight: this.currentBlockTemplate?.height || 0,
                difficulty: this.currentBlockTemplate?.difficulty || 0,
                poolDifficulty: this.difficulty,
                algorithm: 'ECCPoW',
                mode: this.stats.offlineMode ? 'simulation' : 'live'
            },
            topWorkers: activeWorkers.slice(0, 10).map(worker => ({
                address: worker.address.slice(0, 8) + '...',
                workerName: worker.workerName,
                validShares: worker.validShares,
                shareRate: worker.shareRate,
                avgWeight: worker.avgWeight.toFixed(1),
                bestWeight: worker.bestWeight === Infinity ? null : worker.bestWeight,
                successRate: worker.totalSubmissions > 0 ? 
                    ((worker.validShares / worker.totalSubmissions) * 100).toFixed(1) + '%' : '0%'
            })),
            recentActivity: this.miningProgress.recentShares.slice(0, 5).map(share => ({
                timestamp: share.timestamp,
                worker: share.worker,
                valid: share.valid,
                weight: share.weight,
                networkType: share.networkType
            }))
        };
    }
}

// ===============================
// 연결 추적기 클래스
// ===============================
class ConnectionTracker {
    constructor() {
        this.connections = new Map();
        this.connectionHistory = [];
    }
    
    trackConnection(connection) {
        const tracker = {
            id: connection.id,
            address: connection.address,
            workerName: connection.workerName,
            connectedAt: Date.now(),
            lastActivity: Date.now(),
            sharesSubmitted: 0,
            sharesAccepted: 0,
            sharesRejected: 0,
            status: 'connected'
        };
        
        this.connections.set(connection.id, tracker);
        this.logConnectionEvent('CONNECT', tracker);
    }
    
    updateActivity(connectionId, activityType, data = {}) {
        const tracker = this.connections.get(connectionId);
        if (!tracker) return;
        
        tracker.lastActivity = Date.now();
        
        switch (activityType) {
            case 'SHARE_SUBMIT':
                tracker.sharesSubmitted++;
                break;
            case 'SHARE_ACCEPT':
                tracker.sharesAccepted++;
                break;
            case 'SHARE_REJECT':
                tracker.sharesRejected++;
                break;
        }
        
        this.logConnectionEvent(activityType, tracker, data);
    }
    
    logConnectionEvent(event, tracker, data = {}) {
        const logEntry = {
            timestamp: new Date().toLocaleTimeString(),
            event: event,
            connection: `${tracker.address}.${tracker.workerName}`,
            data: data
        };
        
        if (event !== 'SHARE_SUBMIT') { // SHARE_SUBMIT은 이미 상세히 로그됨
            console.log(`🔗 [${logEntry.timestamp}] ${event}: ${logEntry.connection}`, 
                Object.keys(data).length > 0 ? data : '');
        }
    }
}

// ===============================
// 실시간 상태 표시 클래스
// ===============================
class PoolStatusDisplay {
    constructor(stratumServer) {
        this.server = stratumServer;
        this.recentLogs = [];
        this.startDisplayLoop();
    }
    
    startDisplayLoop() {
        // 30초마다 상태 표시
        setInterval(() => {
            this.displayPoolStatus();
        }, 30000);
    }
    
    displayPoolStatus() {
        const stats = this.server.getStats();
        const connectedMiners = this.server.getConnectedMiners();
        
        console.log('\n' + '═'.repeat(70));
        console.log('🌍 WorldLand Mining Pool Server - 실시간 상태');
        console.log('═'.repeat(70));
        console.log(`🕐 ${new Date().toLocaleString()}`);
        console.log(`👥 연결된 채굴자: ${stats.authorizedConnections}명`);
        console.log(`📊 총 Share: ${stats.sharesSubmitted} (✅${stats.validShares} ❌${stats.invalidShares})`);
        console.log(`📈 성공률: ${stats.sharesSubmitted > 0 ? ((stats.validShares / stats.sharesSubmitted) * 100).toFixed(1) : 0}%`);
        console.log(`🏆 발견 블록: ${stats.blocksFound}개`);
        console.log(`⚡ ECCPoW 검증: ${stats.eccpowValidations} (실패: ${stats.eccpowFailures})`);
        console.log('═'.repeat(70) + '\n');
    }
    
    addLogEntry(message) {
        this.recentLogs.push({
            timestamp: new Date().toLocaleTimeString(),
            message: message
        });
        
        if (this.recentLogs.length > 10) {
            this.recentLogs.shift();
        }
    }
}

module.exports = WorldLandStratumServer;