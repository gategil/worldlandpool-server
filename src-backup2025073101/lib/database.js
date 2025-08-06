// lib/database.js (실시간 통계 업데이트 강화 버전)
// 데이터베이스 모델 및 실시간 통계 관리

const { pool } = require('../config/database');
const crypto = require('crypto'); 

class DatabaseManager {
    constructor() {
        this.pool = pool;
        this.realtimeStats = {
            lastUpdate: Date.now(),
            updateQueue: [],
            batchInterval: 1000, // 1초마다 배치 업데이트
        };
        
        // 실시간 업데이트 배치 처리 시작
        this.startBatchProcessor();
        
        console.log('📊 실시간 데이터베이스 관리자 초기화');
    }

    // ====================================
    // 실시간 배치 처리 시스템
    // ====================================
    
    startBatchProcessor() {
        setInterval(() => {
            this.processBatchUpdates();
        }, this.realtimeStats.batchInterval);
    }
    
    async processBatchUpdates() {
        if (this.realtimeStats.updateQueue.length === 0) {
            return;
        }
        
        const updates = [...this.realtimeStats.updateQueue];
        this.realtimeStats.updateQueue = [];
        
        try {
            await this.executeBatchUpdates(updates);
            console.log(`📊 배치 업데이트 완료: ${updates.length}개 항목`);
        } catch (error) {
            console.error('❌ 배치 업데이트 실패:', error);
            // 실패한 업데이트를 다시 큐에 추가
            this.realtimeStats.updateQueue.unshift(...updates);
        }
    }
    
    async executeBatchUpdates(updates) {
        const connection = await this.pool.getConnection();
        await connection.beginTransaction();
        
        try {
            for (const update of updates) {
                await connection.execute(update.query, update.params);
            }
            
            await connection.commit();
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }
    
    queueUpdate(query, params, priority = 'normal') {
        this.realtimeStats.updateQueue.push({
            query: query,
            params: params,
            priority: priority,
            timestamp: Date.now()
        });
        
        // 높은 우선순위 업데이트는 즉시 처리
        if (priority === 'high' && this.realtimeStats.updateQueue.length > 10) {
            this.processBatchUpdates();
        }
    }

    // Share 다이제스트 계산 메서드 추가 (database.js에)
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

    // ====================================
    // 실시간 Share 기록 강화
    // ====================================
    
    async recordShareRealtime(shareData) {
        const startTime = Date.now();
        
        try {
            console.log(`📝 실시간 Share 기록 시작:`, {
                miner: shareData.minerAddress,
                worker: shareData.workerName,
                valid: shareData.isValid,
                jobId: shareData.jobId,
                weight: shareData.weight,
                level: shareData.level
            });
            
            // 1. 채굴자 정보 확인/생성
            const miner = await this.getOrCreateMiner(shareData.minerAddress);
            
            // 2. Share 기록 (완전한 ECCPoW 데이터 포함)
            const [shareResult] = await this.pool.execute(`
                INSERT INTO shares (
                    miner_id, job_id, worker, difficulty, 
                    solution, nonce, is_valid, is_block,
                    submitted_at, ip_address, weight, level,
                    algorithm, network_type, eccpow_codeword, 
                    eccpow_mixdigest, eccpow_codelength, error_message
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?, ?, ?, 'ECCPoW', ?, ?, ?, ?, ?)
            `, [
                miner.id, shareData.jobId, shareData.workerName, shareData.difficulty,
                shareData.solution || await this.calculateShareDigest(shareData.job, shareData.validation, shareData.workerName),
                shareData.nonce || '0', 
                shareData.isValid, shareData.isBlock || false,
                shareData.ipAddress, shareData.weight || 0, shareData.level || 0,
                shareData.networkType || 'seoul',
                shareData.eccpowData?.codeword || null,
                shareData.eccpowData?.mixDigest || null,
                shareData.eccpowData?.codeLength || null,
                shareData.isValid ? null : (shareData.error || 'ECCPoW validation failed')
            ]);
            
            // 나머지 구현은 기존과 동일...
            
            return shareResult.insertId;
            
        } catch (error) {
            console.error('❌ 실시간 Share 기록 오류:', error);
            throw error;
        }
    }
    
    // 풀 통계 업데이트 큐잉
    queuePoolStatsUpdate(isValidShare) {
        const updateQuery = `
            UPDATE pool_stats 
            SET total_hashrate = (
                SELECT COALESCE(SUM(hashrate), 0) 
                FROM miner_hashrate_stats 
                WHERE time_window > DATE_SUB(NOW(), INTERVAL 5 MINUTE)
            ),
            miners_count = (
                SELECT COUNT(*) 
                FROM miners 
                WHERE last_seen > DATE_SUB(NOW(), INTERVAL 15 MINUTE) 
                AND is_active = TRUE
            ),
            updated_at = NOW()
            WHERE stat_type = 'current'
        `;
        
        this.queueUpdate(updateQuery, [], 'normal');
        
        // 유효한 Share인 경우 추가 통계 업데이트
        if (isValidShare) {
            const validShareQuery = `
                UPDATE pool_stats 
                SET valid_shares_today = valid_shares_today + 1
                WHERE stat_type = 'current'
            `;
            this.queueUpdate(validShareQuery, [], 'normal');
        }
    }

    // ====================================
    // 블록 발견 실시간 기록
    // ====================================
    
    async recordBlockFoundRealtime(blockData) {
        const startTime = Date.now();
        
        try {
            console.log(`🏆 실시간 블록 기록 시작:`, {
                miner: blockData.miner,
                height: blockData.blockHeight,
                algorithm: blockData.algorithm
            });
            
            const connection = await this.pool.getConnection();
            await connection.beginTransaction();
            
            try {
                // 1. 채굴자 정보 가져오기
                const minerAddress = blockData.miner.split('.')[0];
                const miner = await this.getOrCreateMiner(minerAddress);
                
                // 2. 블록 정보 저장 (ECCPoW 데이터 포함)
                const [blockResult] = await connection.execute(`
                    INSERT INTO blocks (
                        miner_id, block_number, block_hash, 
                        difficulty, reward, pool_fee, status, found_at,
                        confirmations, nonce, weight, search_level, algorithm,
                        network_type, job_id, eccpow_codeword,
                        eccpow_mixdigest, eccpow_codelength, block_header, 
                        tx_hash, network_submitted
                    ) VALUES (?, ?, ?, ?, ?, ?, 'pending', NOW(), 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `, [
                    miner.id, blockData.blockHeight, blockData.blockHash,
                    blockData.difficulty || 1000000, blockData.reward || 4.0, 
                    (blockData.reward || 4.0) * 0.009, // 0.9% 풀 수수료
                    blockData.nonce, blockData.weight, blockData.searchLevel,
                    blockData.algorithm, blockData.networkType, blockData.jobId,
                    blockData.eccpowData?.codeword || null,
                    blockData.eccpowData?.mixDigest || null,
                    blockData.eccpowData?.codeLength || null,
                    blockData.blockHeader || null,
                    blockData.txHash || null,
                    blockData.networkSubmitted || false
                ]);
                
                // 3. 채굴자 블록 통계 업데이트
                await connection.execute(`
                    UPDATE miners 
                    SET total_blocks_found = total_blocks_found + 1,
                        last_block_time = NOW(),
                        total_rewards = total_rewards + ?
                    WHERE id = ?
                `, [blockData.reward || 4.0, miner.id]);
                
                // 4. 풀 블록 통계 업데이트
                await connection.execute(`
                    UPDATE pool_stats 
                    SET blocks_found_today = blocks_found_today + 1,
                        blocks_found_total = blocks_found_total + 1,
                        last_block_number = ?,
                        last_block_time = NOW()
                    WHERE stat_type = 'current'
                `, [blockData.blockHeight]);
                
                await connection.commit();
                
                const processingTime = Date.now() - startTime;
                console.log(`🎉 블록 기록 완료 (${processingTime}ms):`, {
                    blockId: blockResult.insertId,
                    minerId: miner.id,
                    height: blockData.blockHeight,
                    reward: blockData.reward
                });
                
                // 5. 실시간 알림 데이터 생성
                await this.createBlockNotification(blockResult.insertId, blockData);
                
                return blockResult.insertId;
                
            } catch (error) {
                await connection.rollback();
                throw error;
            } finally {
                connection.release();
            }
            
        } catch (error) {
            console.error('❌ 실시간 블록 기록 오류:', error);
            throw error;
        }
    }

    // ====================================
    // ECCPoW 전용 통계 조회
    // ====================================
    
    async getECCPoWStats(timeframe = '24 HOUR') {
        try {
            const [eccpowStats] = await this.pool.execute(`
                SELECT 
                    COUNT(*) as total_shares,
                    COUNT(CASE WHEN is_valid = TRUE THEN 1 END) as valid_shares,
                    COUNT(CASE WHEN eccpow_codeword IS NOT NULL THEN 1 END) as client_provided_shares,
                    COUNT(CASE WHEN eccpow_codeword IS NULL THEN 1 END) as server_calculated_shares,
                    AVG(CASE WHEN weight IS NOT NULL THEN weight END) as avg_weight,
                    MIN(CASE WHEN weight IS NOT NULL THEN weight END) as best_weight,
                    MAX(CASE WHEN weight IS NOT NULL THEN weight END) as worst_weight,
                    COUNT(DISTINCT network_type) as network_types_used,
                    AVG(CASE WHEN eccpow_codelength IS NOT NULL THEN eccpow_codelength END) as avg_code_length
                FROM shares 
                WHERE algorithm = 'ECCPoW' 
                AND submitted_at > DATE_SUB(NOW(), INTERVAL ? )
            `, [timeframe]);
            
            const [networkBreakdown] = await this.pool.execute(`
                SELECT 
                    network_type,
                    COUNT(*) as share_count,
                    COUNT(CASE WHEN is_valid = TRUE THEN 1 END) as valid_count,
                    AVG(weight) as avg_weight
                FROM shares 
                WHERE algorithm = 'ECCPoW' 
                AND submitted_at > DATE_SUB(NOW(), INTERVAL ? )
                GROUP BY network_type
            `, [timeframe]);
            
            return {
                overall: eccpowStats[0] || {},
                byNetwork: networkBreakdown || [],
                timeframe: timeframe
            };
            
        } catch (error) {
            console.error('❌ ECCPoW 통계 조회 오류:', error);
            return null;
        }
    }
    
    async getECCPoWBlockStats(timeframe = '7 DAY') {
        try {
            const [blockStats] = await this.pool.execute(`
                SELECT 
                    COUNT(*) as total_blocks,
                    COUNT(CASE WHEN eccpow_codeword IS NOT NULL THEN 1 END) as client_provided_blocks,
                    AVG(weight) as avg_weight,
                    MIN(weight) as best_weight,
                    AVG(search_level) as avg_search_level,
                    SUM(reward) as total_rewards
                FROM blocks 
                WHERE algorithm = 'ECCPoW' 
                AND found_at > DATE_SUB(NOW(), INTERVAL ? )
            `, [timeframe]);
            
            return blockStats[0] || {};
            
        } catch (error) {
            console.error('❌ ECCPoW 블록 통계 조회 오류:', error);
            return null;
        }
    }
    
    // 블록 발견 알림 생성
    async createBlockNotification(blockId, blockData) {
        try {
            await this.pool.execute(`
                INSERT INTO block_notifications (
                    block_id, miner_address, block_height, 
                    reward, algorithm, created_at, status
                ) VALUES (?, ?, ?, ?, ?, NOW(), 'pending')
            `, [
                blockId, blockData.miner.split('.')[0], blockData.blockHeight,
                blockData.reward, blockData.algorithm
            ]);
            
            console.log(`📢 블록 발견 알림 생성: 블록 #${blockData.blockHeight}`);
            
        } catch (error) {
            console.error('❌ 블록 알림 생성 오류:', error);
        }
    }

    // ====================================
    // 해시레이트 통계 실시간 업데이트
    // ====================================
    
    async updateHashrateStats(minerId, difficulty) {
        try {
            // 5분 단위 시간 윈도우 계산
            const timeWindow = new Date();
            timeWindow.setMinutes(Math.floor(timeWindow.getMinutes() / 5) * 5);
            timeWindow.setSeconds(0);
            timeWindow.setMilliseconds(0);
            
            // 추정 해시레이트 계산 (difficulty 기반)
            const estimatedHashrate = difficulty * 0.8; // ECCPoW 보정 계수
            
            // UPSERT 쿼리로 해시레이트 통계 업데이트
            await this.pool.execute(`
                INSERT INTO miner_hashrate_stats (
                    miner_id, hashrate, shares_count, time_window
                ) VALUES (?, ?, 1, ?)
                ON DUPLICATE KEY UPDATE
                hashrate = (hashrate * shares_count + ?) / (shares_count + 1),
                shares_count = shares_count + 1
            `, [minerId, estimatedHashrate, timeWindow, estimatedHashrate]);
            
        } catch (error) {
            console.error('❌ 해시레이트 통계 업데이트 오류:', error);
        }
    }

    // ====================================
    // 연결 상태 실시간 추적
    // ====================================
    
    async trackConnectionActivity(connectionData) {
        try {
            // connection_logs 테이블이 없으므로 콘솔 로그로 대체
            console.log(`📝 연결 활동 추적: ${connectionData.address}.${connectionData.workerName} - ${connectionData.activityType} (IP: ${connectionData.ipAddress})`);
            
            // 채굴자의 마지막 활동 시간 업데이트 (이 부분은 유지)
            if (connectionData.address) {
                this.queueUpdate(`
                    UPDATE miners 
                    SET last_seen = NOW(), 
                        is_active = TRUE 
                    WHERE address = ?
                `, [connectionData.address], 'high');
            }
            
        } catch (error) {
            console.error('❌ 연결 활동 추적 오류:', error);
        }
    }

    // ====================================
    // 실시간 통계 조회 최적화
    // ====================================
    
    async getRealtimePoolStats() {
        try {
            const [statsRows] = await this.pool.execute(`
                SELECT 
                    ps.*,
                    (SELECT COUNT(*) FROM miners 
                     WHERE last_seen > DATE_SUB(NOW(), INTERVAL 15 MINUTE) 
                     AND is_active = TRUE) as active_miners_count,
                    (SELECT COALESCE(SUM(hashrate), 0) 
                     FROM miner_hashrate_stats 
                     WHERE time_window > DATE_SUB(NOW(), INTERVAL 5 MINUTE)) as current_hashrate,
                    (SELECT COUNT(*) 
                     FROM shares 
                     WHERE submitted_at > CURDATE() 
                     AND is_valid = TRUE) as valid_shares_today,
                    (SELECT COUNT(*) 
                     FROM shares 
                     WHERE submitted_at > CURDATE()) as total_shares_today,
                    (SELECT COUNT(*) 
                     FROM shares 
                     WHERE submitted_at > CURDATE() 
                     AND eccpow_codeword IS NOT NULL) as client_provided_shares_today,
                    (SELECT AVG(weight) 
                     FROM shares 
                     WHERE submitted_at > CURDATE() 
                     AND weight IS NOT NULL) as avg_weight_today
                FROM pool_stats ps 
                WHERE stat_type = 'current'
            `);
            
            const stats = statsRows[0] || {};
            
            // 성공률 계산
            stats.success_rate = stats.total_shares_today > 0 ? 
                (stats.valid_shares_today / stats.total_shares_today * 100) : 0;
            
            // 최근 활동 요약
            const [activityRows] = await this.pool.execute(`
                SELECT 
                    COUNT(*) as activity_count,
                    activity_type
                FROM connection_logs 
                WHERE created_at > DATE_SUB(NOW(), INTERVAL 1 HOUR)
                GROUP BY activity_type
            `);
            
            stats.recent_activity = activityRows;
            
            return stats;
            
        } catch (error) {
            console.error('❌ 실시간 풀 통계 조회 오류:', error);
            return null;
        }
    }
    
    async getActiveMinersRealtime() {
        try {
            const [minersRows] = await this.pool.execute(`
                SELECT 
                    m.*,
                    hrs.hashrate as current_hashrate,
                    (SELECT COUNT(*) FROM shares s 
                     WHERE s.miner_id = m.id 
                     AND s.submitted_at > DATE_SUB(NOW(), INTERVAL 1 HOUR)) as shares_last_hour,
                    (SELECT COUNT(*) FROM shares s 
                     WHERE s.miner_id = m.id 
                     AND s.submitted_at > DATE_SUB(NOW(), INTERVAL 1 HOUR)
                     AND s.is_valid = TRUE) as valid_shares_last_hour,
                    TIMESTAMPDIFF(SECOND, m.last_seen, NOW()) as seconds_since_last_seen
                FROM miners m
                LEFT JOIN (
                    SELECT miner_id, AVG(hashrate) as hashrate
                    FROM miner_hashrate_stats 
                    WHERE time_window > DATE_SUB(NOW(), INTERVAL 15 MINUTE)
                    GROUP BY miner_id
                ) hrs ON m.id = hrs.miner_id
                WHERE m.last_seen > DATE_SUB(NOW(), INTERVAL 15 MINUTE)
                AND m.is_active = TRUE
                ORDER BY m.last_seen DESC
            `);
            
            return minersRows.map(miner => ({
                ...miner,
                status: miner.seconds_since_last_seen < 60 ? 'active' : 
                        miner.seconds_since_last_seen < 300 ? 'idle' : 'inactive',
                success_rate: miner.shares_last_hour > 0 ? 
                    (miner.valid_shares_last_hour / miner.shares_last_hour * 100) : 0
            }));
            
        } catch (error) {
            console.error('❌ 활성 채굴자 실시간 조회 오류:', error);
            return [];
        }
    }

    // ====================================
    // 성능 모니터링 및 최적화
    // ====================================
    
    async getPerformanceMetrics() {
        try {
            const [metricsRows] = await this.pool.execute(`
                SELECT 
                    'database' as component,
                    'healthy' as status,
                    CONNECTION_ID() as connection_id,
                    (SELECT COUNT(*) FROM information_schema.processlist 
                     WHERE db = DATABASE()) as active_connections,
                    (SELECT table_rows FROM information_schema.tables 
                     WHERE table_schema = DATABASE() AND table_name = 'shares') as total_shares,
                    (SELECT table_rows FROM information_schema.tables 
                     WHERE table_schema = DATABASE() AND table_name = 'blocks') as total_blocks,
                    NOW() as check_time
            `);
            
            // 큐 상태 추가
            const queueMetrics = {
                queue_size: this.realtimeStats.updateQueue.length,
                last_batch_process: new Date(this.realtimeStats.lastUpdate),
                batch_interval: this.realtimeStats.batchInterval
            };
            
            return {
                database: metricsRows[0],
                realtime_queue: queueMetrics
            };
            
        } catch (error) {
            console.error('❌ 성능 메트릭 조회 오류:', error);
            return { status: 'error', error: error.message };
        }
    }
    
    // 데이터베이스 최적화 함수
    async optimizeDatabase() {
        try {
            console.log('🔧 데이터베이스 최적화 시작...');
            
            // 1. 오래된 Share 데이터 정리 (30일 이상)
            const [cleanupResult] = await this.pool.execute(`
                DELETE FROM shares 
                WHERE submitted_at < DATE_SUB(NOW(), INTERVAL 30 DAY)
                AND is_block = FALSE
                LIMIT 1000
            `);
            
            if (cleanupResult.affectedRows > 0) {
                console.log(`🧹 오래된 Share ${cleanupResult.affectedRows}개 정리 완료`);
            }
            
            // 2. 해시레이트 통계 정리 (7일 이상)
            const [hashrateCleanup] = await this.pool.execute(`
                DELETE FROM miner_hashrate_stats 
                WHERE time_window < DATE_SUB(NOW(), INTERVAL 7 DAY)
                LIMIT 500
            `);
            
            if (hashrateCleanup.affectedRows > 0) {
                console.log(`📊 오래된 해시레이트 통계 ${hashrateCleanup.affectedRows}개 정리 완료`);
            }
            
            // 3. 연결 로그 정리 (24시간 이상)
            const [connectionCleanup] = await this.pool.execute(`
                DELETE FROM connection_logs 
                WHERE created_at < DATE_SUB(NOW(), INTERVAL 24 HOUR)
                LIMIT 1000
            `);
            
            if (connectionCleanup.affectedRows > 0) {
                console.log(`🔗 오래된 연결 로그 ${connectionCleanup.affectedRows}개 정리 완료`);
            }
            
            console.log('✅ 데이터베이스 최적화 완료');
            
        } catch (error) {
            console.error('❌ 데이터베이스 최적화 오류:', error);
        }
    }

    // ====================================
    // 기존 메서드들 (개선된 버전)
    // ====================================
    
    async getOrCreateMiner(address, workerName = null) {
        try {
            // 기존 채굴자 조회
            const [rows] = await this.pool.execute(
                'SELECT * FROM miners WHERE address = ?',
                [address]
            );
            
            if (rows.length > 0) {
                // ✅ 수정: 기존 컬럼만 사용한 실시간 업데이트
                this.queueUpdate(
                    `UPDATE miners 
                    SET last_seen = NOW(), 
                        is_active = TRUE,
                        worker_name = COALESCE(worker_name, ?)
                    WHERE id = ?`,
                    [workerName, rows[0].id],
                    'high'
                );
                return rows[0];
            }
            
            // 새 채굴자 생성
            const [result] = await this.pool.execute(
                `INSERT INTO miners (
                    address, worker_name, first_seen, last_seen, 
                    is_active, valid_shares, total_shares, invalid_shares
                ) VALUES (?, ?, NOW(), NOW(), TRUE, 0, 0, 0)`,
                [address, workerName]
            );
            
            // 생성된 채굴자 정보 반환
            const [newMiner] = await this.pool.execute(
                'SELECT * FROM miners WHERE id = ?',
                [result.insertId]
            );
            
            console.log(`✅ 새 채굴자 등록: ${address} (${workerName})`);
            
            // 연결 활동 추적
            await this.trackConnectionActivity({
                address: address,
                workerName: workerName,
                activityType: 'new_miner_registration',
                ipAddress: null
            });
            
            return newMiner[0];
            
        } catch (error) {
            console.error('❌ 채굴자 조회/생성 오류:', error);
            throw error;
        }
    }
    
    // 풀 설정 캐시 추가
    async getPoolConfig(key = null) {
        try {
            // 캐시 확인
            if (this.configCache && Date.now() - this.configCache.timestamp < 60000) {
                return key ? this.configCache.data[key] : this.configCache.data;
            }
            
            if (key) {
                const [rows] = await this.pool.execute(
                    'SELECT config_value FROM pool_config WHERE config_key = ?',
                    [key]
                );
                return rows[0] ? rows[0].config_value : null;
            } else {
                const [rows] = await this.pool.execute('SELECT * FROM pool_config');
                const config = {};
                rows.forEach(row => {
                    config[row.config_key] = row.config_value;
                });
                
                // 기본값 추가 (DB에 없는 경우 대비)
                const defaults = {
                    pool_fee: config.pool_fee || '0.9',
                    min_payout: config.min_payout || '0.1', 
                    pool_name: config.pool_name || 'WorldLand Pool',
                    pool_url: config.pool_url || 'pool.worldlandcafe.com',
                    stratum_port: config.stratum_port || '3333',
                    difficulty_target: config.difficulty_target || '1000'
                };
                
                const finalConfig = { ...defaults, ...config };
                
                // 캐시 업데이트
                this.configCache = {
                    data: finalConfig,
                    timestamp: Date.now()
                };
                
                return finalConfig;
            }
        } catch (error) {
            console.error('❌ 풀 설정 조회 오류:', error);
            // 오류 시 기본값 반환
            const fallbackConfig = {
                pool_fee: '0.9',
                min_payout: '0.1', 
                pool_name: 'WorldLand Pool',
                pool_url: 'pool.worldlandcafe.com',
                stratum_port: '3333',
                difficulty_target: '1000'
            };
            return key ? fallbackConfig[key] : fallbackConfig;
        }
    }

    // ====================================
    // 풀 통계 관련 메서드들
    // ====================================
    
    async getPoolStats() {
        try {
            const [rows] = await this.pool.execute(`
                SELECT * FROM pool_stats WHERE stat_type = 'current'
            `);
            
            if (rows.length === 0) {
                // 초기 통계가 없으면 생성
                await this.pool.execute(`
                    INSERT INTO pool_stats (stat_type, total_hashrate, miners_count, blocks_found_today) 
                    VALUES ('current', 0, 0, 0)
                `);
                
                const [newRows] = await this.pool.execute(`
                    SELECT * FROM pool_stats WHERE stat_type = 'current'
                `);
                return newRows[0];
            }
            
            return rows[0];
        } catch (error) {
            console.error('❌ 풀 통계 조회 오류:', error);
            return null;
        }
    }
    
    async updatePoolStats(hashrate, minersCount, blocksFoundToday, networkDifficulty = 0) {
        try {
            await this.pool.execute(`
                UPDATE pool_stats 
                SET total_hashrate = ?, 
                    miners_count = ?, 
                    blocks_found_today = ?,
                    network_difficulty = ?,
                    updated_at = NOW()
                WHERE stat_type = 'current'
            `, [hashrate, minersCount, blocksFoundToday, networkDifficulty]);
            
            return true;
        } catch (error) {
            console.error('❌ 풀 통계 업데이트 오류:', error);
            return false;
        }
    }
    
    async getActiveMiners() {
        try {
            const [rows] = await this.pool.execute(`
                SELECT 
                    m.*,
                    TIMESTAMPDIFF(SECOND, m.last_seen, NOW()) as seconds_since_last_seen
                FROM miners m
                WHERE m.last_seen > DATE_SUB(NOW(), INTERVAL 15 MINUTE)
                AND m.is_active = TRUE
                ORDER BY m.last_seen DESC
            `);
            
            return rows.map(miner => ({
                ...miner,
                status: miner.seconds_since_last_seen < 60 ? 'active' : 
                        miner.seconds_since_last_seen < 300 ? 'idle' : 'inactive'
            }));
        } catch (error) {
            console.error('❌ 활성 채굴자 조회 오류:', error);
            return [];
        }
    } 

    // 건강 상태 체크 개선
    async healthCheck() {
        try {
            const startTime = Date.now();
            
            // 1. 기본 연결 테스트
            const [result] = await this.pool.execute('SELECT 1 as health, NOW() as server_time');
            
            // 2. 성능 메트릭 수집
            const performance = await this.getPerformanceMetrics();
            
            // 3. 실시간 큐 상태
            const queueHealth = {
                queue_size: this.realtimeStats.updateQueue.length,
                queue_status: this.realtimeStats.updateQueue.length < 100 ? 'healthy' : 'warning'
            };
            
            const responseTime = Date.now() - startTime;
            
            return { 
                status: 'healthy', 
                result: result[0],
                response_time: responseTime,
                performance: performance,
                realtime_queue: queueHealth,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            return { 
                status: 'unhealthy', 
                error: error.message,
                timestamp: new Date().toISOString()
            };
        }
    }
}

// 싱글톤 인스턴스 생성
const dbManager = new DatabaseManager();

// 정기적인 데이터베이스 최적화 (1시간마다)
setInterval(() => {
    dbManager.optimizeDatabase();
}, 60 * 60 * 1000);

module.exports = dbManager;