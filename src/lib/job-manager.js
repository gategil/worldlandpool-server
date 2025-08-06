// lib/job-manager.js
// 실제 블록 템플릿 관리 및 작업 생성

const EventEmitter = require('events');
const crypto = require('crypto');
const WorldLandRPCClient = require('./worldland-rpc');

class JobManager extends EventEmitter {
    constructor(rpcConfig) {
        super();
        
        this.rpc = new WorldLandRPCClient(rpcConfig);
        this.currentTemplate = null;
        this.currentJob = null;
        
        this.jobCounter = 0;
        this.jobs = new Map(); // jobId -> job 객체
        
        this.isRunning = false;
        this.updateInterval = null;
        
        console.log('⚡ JobManager 초기화 완료');
    }

    // JobManager 시작
    async start() {
        try {
            console.log('🚀 JobManager 시작 중...');
            
            // 노드 연결 테스트
            const isConnected = await this.rpc.ping();
            if (!isConnected) {
                throw new Error('WorldLand 노드에 연결할 수 없습니다');
            }
            
            // 초기 블록 템플릿 가져오기
            await this.updateBlockTemplate();
            
            // 정기적으로 템플릿 업데이트 (5초마다)
            this.updateInterval = setInterval(() => {
                this.updateBlockTemplate().catch(console.error);
            }, 5000);
            
            this.isRunning = true;
            console.log('✅ JobManager 시작 완료');
            
        } catch (error) {
            console.error('❌ JobManager 시작 실패:', error);
            throw error;
        }
    }

    // JobManager 중지
    async stop() {
        console.log('🛑 JobManager 중지 중...');
        
        this.isRunning = false;
        
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }
        
        this.jobs.clear();
        this.currentJob = null;
        this.currentTemplate = null;
        
        console.log('✅ JobManager 중지 완료');
    }

    // 블록 템플릿 업데이트
    async updateBlockTemplate() {
        try {
            const newTemplate = await this.rpc.getBlockTemplate();
            
            // 템플릿이 변경되었는지 확인
            const templateChanged = !this.currentTemplate || 
                this.currentTemplate.previousblockhash !== newTemplate.previousblockhash ||
                this.currentTemplate.height !== newTemplate.height;
            
            if (templateChanged) {
                this.currentTemplate = newTemplate;
                
                // 새 작업 생성
                const newJob = this.createJob(newTemplate);
                this.currentJob = newJob;
                
                console.log(`🔄 새 블록 템플릿: 높이 ${newTemplate.height}, 이전 해시: ${newTemplate.previousblockhash.slice(0, 16)}...`);
                
                // 새 작업 이벤트 발생
                this.emit('newJob', newJob);
                
                // 오래된 작업 정리
                this.cleanupOldJobs();
            }
            
        } catch (error) {
            console.error('❌ 블록 템플릿 업데이트 실패:', error);
        }
    }

    // 새 작업 생성
    createJob(template) {
        this.jobCounter++;
        
        const jobId = `job_${this.jobCounter}_${Date.now()}`;
        const extraNonce1Size = 4; // ExtraNonce1 크기
        const extraNonce2Size = 4; // ExtraNonce2 크기
        
        // Coinbase 트랜잭션 생성
        const coinbase = this.buildCoinbaseTransaction(template);
        
        const job = {
            id: jobId,
            template: template,
            
            // Stratum 필드들
            previousBlockHash: template.previousblockhash,
            coinbase1: coinbase.part1,
            coinbase2: coinbase.part2,
            merkleRoots: this.calculateMerkleRoots(template.transactions),
            version: template.version.toString(16).padStart(8, '0'),
            bits: template.bits,
            timestamp: template.curtime.toString(16).padStart(8, '0'),
            
            // 추가 정보
            height: template.height,
            target: template.target,
            difficulty: this.calculateDifficulty(template.bits),
            
            createdAt: Date.now(),
            extraNonce1Size: extraNonce1Size,
            extraNonce2Size: extraNonce2Size
        };
        
        this.jobs.set(jobId, job);
        
        console.log(`📋 새 작업 생성: ${jobId}, 높이: ${template.height}`);
        
        return job;
    }

    // Coinbase 트랜잭션 구성
    buildCoinbaseTransaction(template) {
        // 간단한 coinbase 트랜잭션 구성
        // 실제로는 더 복잡한 구조가 필요할 수 있음
        
        const version = Buffer.alloc(4);
        version.writeUInt32LE(1, 0);
        
        const inputCount = Buffer.from([1]); // 1개 입력
        const prevHash = Buffer.alloc(32, 0); // null hash
        const prevIndex = Buffer.alloc(4, 0xff); // 0xffffffff
        
        // scriptSig 구성 (블록 높이 + extraNonce 자리)
        const blockHeight = this.encodeBlockHeight(template.height);
        const extraNoncePlaceholder = Buffer.alloc(8, 0); // ExtraNonce 자리
        const scriptSig = Buffer.concat([
            Buffer.from([blockHeight.length + extraNoncePlaceholder.length]),
            blockHeight,
            extraNoncePlaceholder
        ]);
        
        const sequence = Buffer.alloc(4, 0xff);
        
        // 여기서 coinbase를 두 부분으로 나눔
        const part1 = Buffer.concat([
            version,
            inputCount,
            prevHash,
            prevIndex,
            scriptSig.slice(0, blockHeight.length + 1)
        ]);
        
        // 출력 구성
        const outputCount = Buffer.from([1]); // 1개 출력
        const outputValue = Buffer.alloc(8);
        outputValue.writeBigUInt64LE(BigInt(template.coinbasevalue), 0);
        
        // 간단한 P2PKH 스크립트 (실제로는 풀 주소 사용)
        const scriptPubKey = Buffer.from([
            0x19, // 스크립트 길이
            0x76, 0xa9, 0x14, // OP_DUP OP_HASH160 <20 bytes>
            ...Buffer.alloc(20, 0), // 실제로는 풀 주소
            0x88, 0xac // OP_EQUALVERIFY OP_CHECKSIG
        ]);
        
        const lockTime = Buffer.alloc(4, 0);
        
        const part2 = Buffer.concat([
            sequence,
            outputCount,
            outputValue,
            scriptPubKey,
            lockTime
        ]);
        
        return {
            part1: part1.toString('hex'),
            part2: part2.toString('hex')
        };
    }

    // 블록 높이를 바이트로 인코딩
    encodeBlockHeight(height) {
        const buffer = Buffer.alloc(4);
        buffer.writeUInt32LE(height, 0);
        
        // 불필요한 앞자리 0 제거
        let length = 4;
        while (length > 1 && buffer[length - 1] === 0) {
            length--;
        }
        
        return buffer.slice(0, length);
    }

    // Merkle root 계산
    calculateMerkleRoots(transactions) {
        if (!transactions || transactions.length === 0) {
            return [];
        }
        
        // 간단한 구현 - 실제로는 더 복잡한 merkle tree 구성 필요
        const hashes = transactions.map(tx => tx.hash || tx.txid);
        return this.buildMerkleTree(hashes);
    }

    // Merkle tree 구성
    buildMerkleTree(hashes) {
        if (hashes.length === 0) return [];
        if (hashes.length === 1) return [];
        
        const tree = [];
        let level = [...hashes];
        
        while (level.length > 1) {
            const nextLevel = [];
            
            for (let i = 0; i < level.length; i += 2) {
                const left = level[i];
                const right = level[i + 1] || left; // 홀수개일 경우 마지막 해시 복제
                
                const combined = Buffer.concat([
                    Buffer.from(left, 'hex'),
                    Buffer.from(right, 'hex')
                ]);
                
                const hash = crypto.createHash('sha256')
                    .update(crypto.createHash('sha256').update(combined).digest())
                    .digest('hex');
                
                nextLevel.push(hash);
                tree.push(hash);
            }
            
            level = nextLevel;
        }
        
        return tree.slice(0, -1); // 마지막 root 제외
    }

    // 난이도 계산 (bits에서)
    calculateDifficulty(bits) {
        const bitsHex = bits.toString(16).padStart(8, '0');
        const exponent = parseInt(bitsHex.slice(0, 2), 16);
        const mantissa = parseInt(bitsHex.slice(2), 16);
        
        const target = mantissa * Math.pow(256, exponent - 3);
        return Math.floor(0x00000000FFFF0000000000000000000000000000000000000000000000000000 / target);
    }

    // Share 검증
    async validateShare(jobId, extraNonce1, extraNonce2, nTime, nonce, workerAddress) {
        try {
            const job = this.jobs.get(jobId);
            if (!job) {
                return { valid: false, error: 'Job not found' };
            }
            
            // 블록 헤더 구성
            const blockHeader = this.buildBlockHeader(
                job, 
                extraNonce1, 
                extraNonce2, 
                nTime, 
                nonce
            );
            
            // 해시 계산
            const blockHash = this.calculateBlockHash(blockHeader);
            
            // 난이도 확인 (풀 난이도)
            const poolTarget = this.calculatePoolTarget();
            const isValidShare = this.compareHash(blockHash, poolTarget);
            
            // 네트워크 난이도 확인 (블록 발견)
            const networkTarget = job.target;
            const isBlock = this.compareHash(blockHash, networkTarget);
            
            if (isValidShare) {
                console.log(`✅ 유효한 share: ${workerAddress}, Job: ${jobId}`);
                
                if (isBlock) {
                    console.log(`🎉 블록 발견! ${workerAddress}, 블록 해시: ${blockHash}`);
                    
                    // 블록 제출
                    const blockHex = this.buildFullBlock(job, extraNonce1, extraNonce2, nTime, nonce);
                    const submitResult = await this.rpc.submitBlock(blockHex);
                    
                    if (submitResult === null) {
                        console.log('✅ 블록 제출 성공!');
                        this.emit('blockFound', {
                            jobId: jobId,
                            blockHash: blockHash,
                            blockHeight: job.height,
                            miner: workerAddress,
                            nonce: nonce,
                            timestamp: Date.now()
                        });
                    } else {
                        console.error('❌ 블록 제출 실패:', submitResult);
                    }
                }
                
                return {
                    valid: true,
                    isBlock: isBlock,
                    blockHash: isBlock ? blockHash : null
                };
            } else {
                return { valid: false, error: 'Hash does not meet target' };
            }
            
        } catch (error) {
            console.error('❌ Share 검증 오류:', error);
            return { valid: false, error: error.message };
        }
    }

    // 블록 헤더 구성
    buildBlockHeader(job, extraNonce1, extraNonce2, nTime, nonce) {
        // WorldLand 블록 헤더 구성 (구체적인 구조는 WorldLand 사양에 따라 다름)
        const version = Buffer.from(job.version, 'hex');
        const prevHash = Buffer.from(job.previousBlockHash, 'hex').reverse();
        
        // Merkle root 계산 (coinbase + 기존 트랜잭션들)
        const coinbaseTx = this.buildCoinbaseWithNonce(job, extraNonce1, extraNonce2);
        const merkleRoot = this.calculateMerkleRootWithCoinbase(job.merkleRoots, coinbaseTx);
        
        const timestamp = Buffer.from(nTime, 'hex');
        const bits = Buffer.from(job.bits.toString(16).padStart(8, '0'), 'hex');
        const nonceBuffer = Buffer.from(nonce.padStart(8, '0'), 'hex');
        
        return Buffer.concat([
            version,
            prevHash,
            merkleRoot,
            timestamp,
            bits,
            nonceBuffer
        ]);
    }

    // Coinbase 트랜잭션에 nonce 추가
    buildCoinbaseWithNonce(job, extraNonce1, extraNonce2) {
        const coinbaseHex = job.coinbase1 + extraNonce1 + extraNonce2 + job.coinbase2;
        return crypto.createHash('sha256')
            .update(crypto.createHash('sha256').update(Buffer.from(coinbaseHex, 'hex')).digest())
            .digest();
    }

    // Merkle root 계산 (coinbase 포함)
    calculateMerkleRootWithCoinbase(merkleRoots, coinbaseHash) {
        let hash = coinbaseHash;
        
        for (const merkleHash of merkleRoots) {
            const combined = Buffer.concat([hash, Buffer.from(merkleHash, 'hex')]);
            hash = crypto.createHash('sha256')
                .update(crypto.createHash('sha256').update(combined).digest())
                .digest();
        }
        
        return hash;
    }

    // 블록 해시 계산 (ECCPoW)
    calculateBlockHash(blockHeader) {
        // WorldLand의 ECCPoW 알고리즘 구현
        // 실제로는 WorldLand의 구체적인 해시 함수를 사용해야 함
        
        // 임시로 SHA256 double hash 사용
        const hash1 = crypto.createHash('sha256').update(blockHeader).digest();
        const hash2 = crypto.createHash('sha256').update(hash1).digest();
        
        return hash2.toString('hex');
    }

    // 해시 비교 (target과 비교)
    compareHash(hash, target) {
        const hashBN = BigInt('0x' + hash);
        const targetBN = BigInt('0x' + target);
        return hashBN <= targetBN;
    }

    // 풀 타겟 계산
    calculatePoolTarget() {
        // 풀 난이도 설정 (네트워크 난이도보다 낮게)
        const poolDifficulty = 1000; // 예시
        return (BigInt('0x00000000FFFF0000000000000000000000000000000000000000000000000000') / BigInt(poolDifficulty)).toString(16);
    }

    // 완전한 블록 구성
    buildFullBlock(job, extraNonce1, extraNonce2, nTime, nonce) {
        // 블록 헤더
        const blockHeader = this.buildBlockHeader(job, extraNonce1, extraNonce2, nTime, nonce);
        
        // 트랜잭션 수
        const txCount = Buffer.from([job.template.transactions.length + 1]); // +1 for coinbase
        
        // Coinbase 트랜잭션
        const coinbaseTxHex = job.coinbase1 + extraNonce1 + extraNonce2 + job.coinbase2;
        
        // 다른 트랜잭션들
        const otherTxs = job.template.transactions.map(tx => tx.data || tx.hex).join('');
        
        return blockHeader.toString('hex') + txCount.toString('hex') + coinbaseTxHex + otherTxs;
    }

    // 오래된 작업 정리
    cleanupOldJobs() {
        const now = Date.now();
        const maxAge = 10 * 60 * 1000; // 10분
        
        for (const [jobId, job] of this.jobs) {
            if (now - job.createdAt > maxAge) {
                this.jobs.delete(jobId);
            }
        }
    }

    // 현재 작업 가져오기
    getCurrentJob() {
        return this.currentJob;
    }

    // 특정 작업 가져오기
    getJob(jobId) {
        return this.jobs.get(jobId);
    }

    // 네트워크 정보 가져오기
    async getNetworkInfo() {
        try {
            const [blockchainInfo, miningInfo, networkHashRate] = await Promise.all([
                this.rpc.getBlockchainInfo(),
                this.rpc.getMiningInfo(),
                this.rpc.getNetworkHashPS()
            ]);
            
            return {
                height: blockchainInfo.blocks,
                difficulty: miningInfo.difficulty,
                networkHashrate: networkHashRate,
                connections: blockchainInfo.connections || 0
            };
        } catch (error) {
            console.error('❌ 네트워크 정보 가져오기 실패:', error);
            return null;
        }
    }
}

module.exports = JobManager;