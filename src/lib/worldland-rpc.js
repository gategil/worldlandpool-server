// lib/worldland-rpc.js (Fallback RPC 지원 버전)
// WorldLand 노드와의 RPC 통신을 위한 개선된 클라이언트

const axios = require('axios');
const crypto = require('crypto');

class WorldLandRPCClient {
    constructor(options = {}) {
        // 주 RPC 엔드포인트
        this.primaryRPC = process.env.WORLDLAND_RPC_URL || 'https://seoul.worldland.foundation';
        
        // 백업 RPC 엔드포인트들
        this.backupRPCs = [
            process.env.WORLDLAND_RPC_BACKUP_1,
            process.env.WORLDLAND_RPC_BACKUP_2,
            process.env.WORLDLAND_RPC_BACKUP_3,
            'https://rpc.worldland.foundation',
            'https://mainnet.worldland.foundation',
            'https://api.worldland.foundation'
        ].filter(url => url && url.trim() !== '');
        
        // 모든 RPC 엔드포인트 목록
        this.allRPCs = [this.primaryRPC, ...this.backupRPCs];
        this.currentRPCIndex = 0;
        
        // 설정
        this.timeout = parseInt(process.env.RPC_TIMEOUT) || 30000;
        this.retryAttempts = parseInt(process.env.RPC_RETRY_ATTEMPTS) || 3;
        this.retryDelay = parseInt(process.env.RPC_RETRY_DELAY) || 5000;
        
        // 상태 추적
        this.requestId = 0;
        this.connectionStats = {
            totalRequests: 0,
            successfulRequests: 0,
            failedRequests: 0,
            lastSuccessfulConnection: null,
            currentRPC: this.primaryRPC,
            failureCount: 0
        };
        
        console.log(`🔗 WorldLand RPC 클라이언트 초기화:`);
        console.log(`   주 RPC: ${this.primaryRPC}`);
        console.log(`   백업 RPC: ${this.backupRPCs.length}개`);
    }

    // 현재 사용 중인 RPC 엔드포인트 가져오기
    getCurrentRPC() {
        return this.allRPCs[this.currentRPCIndex] || this.primaryRPC;
    }

    // 다음 RPC 엔드포인트로 전환
    switchToNextRPC() {
        this.currentRPCIndex = (this.currentRPCIndex + 1) % this.allRPCs.length;
        this.connectionStats.currentRPC = this.getCurrentRPC();
        console.log(`🔄 RPC 엔드포인트 전환: ${this.connectionStats.currentRPC}`);
    }

    // RPC 요청 보내기 (재시도 및 Fallback 지원)
    async request(method, params = []) {
        const requestData = {
            jsonrpc: '2.0',
            id: ++this.requestId,
            method: method,
            params: params
        };

        this.connectionStats.totalRequests++;

        for (let attempt = 0; attempt < this.retryAttempts; attempt++) {
            for (let rpcIndex = 0; rpcIndex < this.allRPCs.length; rpcIndex++) {
                const currentRPC = this.getCurrentRPC();
                
                try {
                    const response = await this.makeRequest(currentRPC, requestData);
                    
                    // 성공시 통계 업데이트
                    this.connectionStats.successfulRequests++;
                    this.connectionStats.lastSuccessfulConnection = Date.now();
                    this.connectionStats.failureCount = 0;
                    
                    if (response.error) {
                        throw new Error(`RPC Error: ${response.error.message} (Code: ${response.error.code})`);
                    }

                    return response.result;
                    
                } catch (error) {
                    console.error(`❌ RPC 요청 실패 (${method}) - ${currentRPC}: ${error.message}`);
                    
                    // 다음 RPC로 전환
                    this.switchToNextRPC();
                    
                    // 마지막 RPC까지 실패한 경우에만 재시도
                    if (rpcIndex === this.allRPCs.length - 1) {
                        if (attempt < this.retryAttempts - 1) {
                            console.log(`⏳ ${this.retryDelay}ms 후 재시도 (${attempt + 1}/${this.retryAttempts})`);
                            await this.sleep(this.retryDelay);
                        }
                        break;
                    }
                }
            }
        }

        // 모든 시도 실패
        this.connectionStats.failedRequests++;
        this.connectionStats.failureCount++;
        
        throw new Error(`All RPC endpoints failed for method: ${method} (${this.allRPCs.length} endpoints, ${this.retryAttempts} attempts each)`);
    }

    // 실제 HTTP 요청
    async makeRequest(rpcUrl, requestData) {
        const config = {
            method: 'POST',
            url: rpcUrl,
            data: requestData,
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'WorldLand-Pool-Server/2.0'
            },
            timeout: this.timeout,
            validateStatus: (status) => status < 500 // 4xx는 허용, 5xx만 에러로 처리
        };

        const response = await axios(config);
        return response.data;
    }

    // Sleep 유틸리티
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // 연결 상태 확인 (ping 개선)
    async ping() {
        try {
            // 가장 빠른 방법으로 연결 확인
            await this.request('eth_chainId');
            return true;
        } catch (error) {
            console.error('❌ Ping 실패:', error.message);
            return false;
        }
    }

    // 현재 블록 정보 가져오기 (개선된 에러 처리)
    async getCurrentBlockInfo() {
        try {
            const [blockNumber, blockData] = await Promise.all([
                this.request('eth_blockNumber'),
                this.request('eth_getBlockByNumber', ['latest', false])
            ]);

            return {
                height: parseInt(blockNumber, 16),
                hash: blockData.hash,
                parentHash: blockData.parentHash,
                difficulty: parseInt(blockData.difficulty, 16),
                timestamp: parseInt(blockData.timestamp, 16),
                gasLimit: parseInt(blockData.gasLimit, 16),
                gasUsed: parseInt(blockData.gasUsed, 16)
            };
        } catch (error) {
            console.error('❌ 블록 정보 가져오기 실패:', error.message);
            return null;
        }
    }

    // 네트워크 정보 가져오기 (개선된 버전)
    async getNetworkInfo() {
        try {
            const [chainId, blockNumber, gasPrice] = await Promise.all([
                this.request('eth_chainId'),
                this.request('eth_blockNumber'), 
                this.request('eth_gasPrice').catch(() => '0x0') // gasPrice 실패해도 계속 진행
            ]);

            return {
                chainId: parseInt(chainId, 16),
                blockNumber: parseInt(blockNumber, 16),
                gasPrice: parseInt(gasPrice, 16)
            };
        } catch (error) {
            console.error('❌ 네트워크 정보 가져오기 실패:', error.message);
            return null;
        }
    }

    // 블록 템플릿 가져오기 (WorldLand 전용)
    async getBlockTemplate() {
        try {
            // WorldLand가 표준 getblocktemplate을 지원하지 않을 수 있으므로
            // 현재 블록 정보를 기반으로 템플릿 생성
            const blockInfo = await this.getCurrentBlockInfo();
            if (!blockInfo) {
                throw new Error('Failed to get current block info');
            }

            // 간단한 블록 템플릿 생성
            return {
                version: 1,
                previousblockhash: blockInfo.hash,
                transactions: [],
                coinbaseaux: {},
                coinbasevalue: 4000000000, // 4 WLC in wei (가정)
                target: this.difficultyToTarget(blockInfo.difficulty),
                mintime: blockInfo.timestamp,
                mutable: ['time', 'transactions', 'prevblock'],
                noncerange: "00000000ffffffff",
                sigoplimit: 20000,
                sizelimit: 1000000,
                curtime: Math.floor(Date.now() / 1000),
                bits: this.difficultyToBits(blockInfo.difficulty),
                height: blockInfo.height + 1
            };
        } catch (error) {
            console.error('❌ 블록 템플릿 생성 실패:', error.message);
            throw error;
        }
    }
 
    // 블록 제출 (WorldLand ECCPoW 형식)
    async submitBlock(blockHeader, nonce, mixHash, minerAddress) {
        try {
            console.log(`📤 WorldLand ECCPoW 블록 제출 시도:`);
            console.log(`   - 블록 헤더: ${blockHeader.slice(0, 32)}...`);
            console.log(`   - Nonce: ${nonce}`);
            console.log(`   - Mix Hash: ${mixHash}`);
            console.log(`   - 채굴자: ${minerAddress}`);
            
            // WorldLand ECCPoW 블록 제출 형식
            const result = await this.request('eth_submitWork', [
                nonce,           // ECCPoW nonce
                blockHeader,     // 완전한 블록 헤더
                mixHash          // ECCPoW mix digest
            ]);
            
            if (result) {
                console.log(`✅ 블록 제출 성공: ${result}`);
                return { success: true, result: result };
            } else {
                console.log(`❌ 블록 제출 거부됨`);
                return { success: false, error: 'Block rejected by network' };
            }
            
        } catch (error) {
            console.error('❌ 블록 제출 실패:', error.message);
            return { success: false, error: error.message };
        }
    }

    // 추가: 블록 검증 메서드
    async validateBlock(blockHeader, nonce, mixHash) {
        try {
            const result = await this.request('eth_getWork');
            
            if (result && result.length >= 3) {
                const [currentJob, seedHash, boundary] = result;
                
                return {
                    valid: true,
                    currentJob: currentJob,
                    seedHash: seedHash,
                    boundary: boundary
                };
            }
            
            return { valid: false, error: 'Invalid work data' };
            
        } catch (error) {
            console.error('❌ 블록 검증 실패:', error.message);
            return { valid: false, error: error.message };
        }
    }

    // 유틸리티: 난이도를 타겟으로 변환
    difficultyToTarget(difficulty) {
        const maxTarget = BigInt('0x00000000FFFF0000000000000000000000000000000000000000000000000000');
        const target = maxTarget / BigInt(difficulty);
        return '0x' + target.toString(16).padStart(64, '0');
    }

    // 유틸리티: 난이도를 bits로 변환
    difficultyToBits(difficulty) {
        // 간단한 변환 (실제로는 더 복잡한 계산 필요)
        return Math.floor(difficulty / 1000000);
    }

    // 연결 통계 가져오기
    getConnectionStats() {
        const successRate = this.connectionStats.totalRequests > 0 ? 
            (this.connectionStats.successfulRequests / this.connectionStats.totalRequests * 100).toFixed(2) : 0;

        return {
            ...this.connectionStats,
            successRate: successRate + '%',
            isHealthy: this.connectionStats.failureCount < 5,
            availableEndpoints: this.allRPCs.length,
            lastConnectionTime: this.connectionStats.lastSuccessfulConnection ? 
                new Date(this.connectionStats.lastSuccessfulConnection).toISOString() : null
        };
    }

    // 노드 상태 체크 (개선된 버전)
    async healthCheck() {
        try {
            const startTime = Date.now();
            const networkInfo = await this.getNetworkInfo();
            const responseTime = Date.now() - startTime;
            
            if (!networkInfo) {
                throw new Error('Network info not available');
            }

            return {
                status: 'healthy',
                chainId: networkInfo.chainId,
                blockNumber: networkInfo.blockNumber,
                currentRPC: this.getCurrentRPC(),
                responseTime: responseTime + 'ms',
                stats: this.getConnectionStats()
            };
        } catch (error) {
            return {
                status: 'unhealthy',
                error: error.message,
                currentRPC: this.getCurrentRPC(),
                stats: this.getConnectionStats()
            };
        }
    }

    // 강제로 주 RPC로 복원
    resetToPrimaryRPC() {
        this.currentRPCIndex = 0;
        this.connectionStats.currentRPC = this.primaryRPC;
        this.connectionStats.failureCount = 0;
        console.log(`🔄 주 RPC로 복원: ${this.primaryRPC}`);
    }

    // 모든 RPC 엔드포인트 테스트
    async testAllEndpoints() {
        console.log('🧪 모든 RPC 엔드포인트 테스트 중...');
        
        const results = [];
        
        for (const rpc of this.allRPCs) {
            const startTime = Date.now();
            try {
                const requestData = {
                    jsonrpc: '2.0',
                    id: 1,
                    method: 'eth_chainId',
                    params: []
                };
                
                await this.makeRequest(rpc, requestData);
                const responseTime = Date.now() - startTime;
                
                results.push({
                    url: rpc,
                    status: 'success',
                    responseTime: responseTime + 'ms'
                });
                
                console.log(`✅ ${rpc}: ${responseTime}ms`);
                
            } catch (error) {
                results.push({
                    url: rpc,
                    status: 'failed',
                    error: error.message
                });
                
                console.log(`❌ ${rpc}: ${error.message}`);
            }
        }
        
        return results;
    }
}

module.exports = WorldLandRPCClient;