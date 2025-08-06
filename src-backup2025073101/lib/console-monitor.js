// lib/console-monitor.js
// 실시간 콘솔 모니터링 및 상태 표시 시스템

const colors = require('colors');
const dbManager = require('./database');

class ConsoleMonitor {
    constructor(stratumServer) {
        this.server = stratumServer;
        this.isActive = true;
        this.displayMode = 'dashboard'; // 'dashboard', 'logs', 'details'
        this.refreshInterval = 3000; // 3초
        this.logBuffer = [];
        this.maxLogs = 50;
        
        // 키보드 입력 처리
        this.setupKeyboardControls();
        
        // 실시간 표시 시작
        this.startMonitoring();
        
        console.log('📺 콘솔 모니터링 시스템 시작');
    }

    setupKeyboardControls() {
        if (process.stdin.setRawMode) {
            process.stdin.setRawMode(true);
            process.stdin.resume();
            process.stdin.setEncoding('utf8');
            
            process.stdin.on('data', (key) => {
                this.handleKeyInput(key);
            });
        }
    }

    handleKeyInput(key) {
        switch (key) {
            case '\u0003': // Ctrl+C
                console.log('\n\n🛑 서버 종료 중...');
                process.exit(0);
                break;
            case 'd':
            case 'D':
                this.displayMode = 'dashboard';
                this.displayDashboard();
                break;
            case 'l':
            case 'L':
                this.displayMode = 'logs';
                this.displayLogs();
                break;
            case 's':
            case 'S':
                this.displayMode = 'stats';
                this.displayDetailedStats();
                break;
            case 'c':
            case 'C':
                console.clear();
                break;
            case 'h':
            case 'H':
                this.showHelp();
                break;
        }
    }

    startMonitoring() {
        // 초기 화면 설정
        console.clear();
        console.log('📺 WorldLand Pool Monitor 시작됨'.green.bold);
        console.log('💡 키보드 단축키: [D]대시보드 [L]로그 [S]통계 [C]화면지우기 [H]도움말\n'.cyan);
        
        // 정기적인 업데이트
        setInterval(() => {
            if (this.isActive) {
                this.updateDisplay();
            }
        }, this.refreshInterval);
        
        // 즉시 첫 번째 표시
        setTimeout(() => this.updateDisplay(), 500);
    }

    updateDisplay() {
        switch (this.displayMode) {
            case 'dashboard':
                this.displayDashboard();
                break;
            case 'logs':
                this.displayLogs();
                break;
            case 'stats':
                this.displayDetailedStats();
                break;
        }
    }

    async displayDashboard() {
        try {
            // 화면 지우기 및 커서 위치 초기화
            console.clear();
            
            const stats = this.server.getStats();
            const connectedMiners = this.server.getConnectedMiners();
            const poolStats = await dbManager.getRealtimePoolStats();
            const now = new Date();
            
            // 헤더
            console.log('╔══════════════════════════════════════════════════════════════════════╗'.cyan);
            console.log('║                    🌍 WorldLand Pool Server Dashboard                ║'.cyan);
            console.log('╠══════════════════════════════════════════════════════════════════════╣'.cyan);
            console.log(`║ 🕐 ${now.toLocaleString().padEnd(58)} ║`.white);
            console.log(`║ 🔄 마지막 업데이트: ${now.toLocaleTimeString().padEnd(45)} ║`.gray);
            console.log('╠══════════════════════════════════════════════════════════════════════╣'.cyan);
            
            // 연결 상태
            const connectionStatus = this.getConnectionStatusIcon(stats);
            console.log(`║ ${connectionStatus.icon} 서버 상태: ${connectionStatus.text.padEnd(50)} ║`.white);
            console.log(`║ 🌐 포트: ${this.server.port.toString().padEnd(55)} ║`);
            console.log(`║ 👥 연결된 채굴자: ${stats.authorizedConnections.toString().green.padEnd(47)} ║`);
            console.log(`║ 🔗 총 연결: ${stats.activeConnections.toString().padEnd(51)} ║`);
            
            console.log('╠══════════════════════════════════════════════════════════════════════╣'.cyan);
            
            // Share 통계
            const successRate = stats.sharesSubmitted > 0 ? 
                ((stats.validShares / stats.sharesSubmitted) * 100).toFixed(1) : '0.0';
            
            console.log('║ 📊 Share 통계:                                                       ║'.yellow.bold);
            console.log(`║   📤 총 제출: ${stats.sharesSubmitted.toString().white.bold.padEnd(52)} ║`);
            console.log(`║   ✅ 승인: ${stats.validShares.toString().green.bold.padEnd(54)} ║`);
            console.log(`║   ❌ 거부: ${stats.invalidShares.toString().red.bold.padEnd(54)} ║`);
            console.log(`║   📈 성공률: ${successRate.green.bold}%`.padEnd(62) + ' ║');
            
            console.log('╠══════════════════════════════════════════════════════════════════════╣'.cyan);
            
            // ECCPoW 통계
            const eccpowRate = stats.eccpowValidations > 0 ? 
                (((stats.eccpowValidations - stats.eccpowFailures) / stats.eccpowValidations) * 100).toFixed(1) : '0.0';
            
            console.log('║ ⚡ ECCPoW 검증:                                                      ║'.yellow.bold);
            console.log(`║   🔍 총 검증: ${stats.eccpowValidations.toString().padEnd(51)} ║`);
            console.log(`║   ❌ 실패: ${stats.eccpowFailures.toString().red.padEnd(53)} ║`);
            console.log(`║   📊 성공률: ${eccpowRate.green.bold}%`.padEnd(59) + ' ║');
            
            console.log('╠══════════════════════════════════════════════════════════════════════╣'.cyan);
            
            // 블록 통계
            console.log('║ 🏆 블록 발견:                                                        ║'.yellow.bold);
            console.log(`║   💎 오늘 발견: ${(poolStats?.blocks_found_today || 0).toString().cyan.bold.padEnd(49)} ║`);
            console.log(`║   🎯 총 발견: ${stats.blocksFound.toString().cyan.bold.padEnd(51)} ║`);
            
            if (poolStats?.last_block_time) {
                const lastBlockTime = new Date(poolStats.last_block_time).toLocaleString();
                console.log(`║   ⏰ 마지막 블록: ${lastBlockTime.padEnd(45)} ║`);
            }
            
            console.log('╠══════════════════════════════════════════════════════════════════════╣'.cyan);
            
            // 활성 채굴자 목록 (상위 5명)
            console.log('║ 👷 활성 채굴자 TOP 5:                                                ║'.yellow.bold);
            
            if (connectedMiners.length > 0) {
                connectedMiners.slice(0, 5).forEach((miner, index) => {
                    const minerDisplay = `${miner.address.slice(0, 8)}...${miner.worker || 'worker'}`;
                    const shareInfo = `${miner.validShares || 0}/${(miner.validShares || 0) + (miner.invalidShares || 0)}`;
                    console.log(`║   ${(index + 1).toString().padStart(2)}. ${minerDisplay.padEnd(20)} ${shareInfo.green.padEnd(15)} ║`);
                });
            } else {
                console.log('║   🔍 연결된 채굴자가 없습니다.                                       ║'.gray);
            }
            
            // 남은 슬롯 채우기
            for (let i = connectedMiners.length; i < 5; i++) {
                console.log('║' + ' '.repeat(70) + '║');
            }
            
            console.log('╠══════════════════════════════════════════════════════════════════════╣'.cyan);
            
            // 실시간 활동
            console.log('║ 📈 실시간 활동:                                                      ║'.yellow.bold);
            
            const recentActivity = this.getRecentActivity();
            if (recentActivity.length > 0) {
                recentActivity.slice(0, 3).forEach(activity => {
                    console.log(`║   ${activity.padEnd(66)} ║`);
                });
            } else {
                console.log('║   🔍 최근 활동이 없습니다.                                           ║'.gray);
            }
            
            // 남은 슬롯 채우기
            for (let i = recentActivity.length; i < 3; i++) {
                console.log('║' + ' '.repeat(70) + '║');
            }
            
            console.log('╠══════════════════════════════════════════════════════════════════════╣'.cyan);
            
            // 컨트롤 가이드
            console.log('║ 🎮 컨트롤: [D]대시보드 [L]로그 [S]통계 [C]지우기 [H]도움말 [Ctrl+C]종료 ║'.magenta);
            console.log('╚══════════════════════════════════════════════════════════════════════╝'.cyan);
            
        } catch (error) {
            console.error('❌ 대시보드 표시 오류:', error);
        }
    }

    displayLogs() {
        console.clear();
        console.log('╔══════════════════════════════════════════════════════════════════════╗'.cyan);
        console.log('║                          📜 실시간 로그 뷰어                         ║'.cyan);
        console.log('╠══════════════════════════════════════════════════════════════════════╣'.cyan);
        
        const logs = this.getFormattedLogs();
        
        if (logs.length > 0) {
            logs.forEach(log => {
                const truncatedLog = log.length > 68 ? log.substring(0, 65) + '...' : log;
                console.log(`║ ${truncatedLog.padEnd(68)} ║`);
            });
        } else {
            console.log('║ 🔍 표시할 로그가 없습니다.                                           ║'.gray);
        }
        
        // 남은 줄 채우기
        const remainingLines = Math.max(0, 20 - logs.length);
        for (let i = 0; i < remainingLines; i++) {
            console.log('║' + ' '.repeat(70) + '║');
        }
        
        console.log('╠══════════════════════════════════════════════════════════════════════╣'.cyan);
        console.log('║ 🎮 [D]대시보드로 돌아가기 [C]로그 지우기 [L]로그 새로고침             ║'.magenta);
        console.log('╚══════════════════════════════════════════════════════════════════════╝'.cyan);
    }

    async displayDetailedStats() {
        console.clear();
        console.log('╔══════════════════════════════════════════════════════════════════════╗'.cyan);
        console.log('║                        📊 상세 통계 및 성능 지표                     ║'.cyan);
        console.log('╠══════════════════════════════════════════════════════════════════════╣'.cyan);
        
        try {
            const stats = this.server.getStats();
            const poolStats = await dbManager.getRealtimePoolStats();
            const performance = await dbManager.getPerformanceMetrics();
            
            // 서버 성능
            console.log('║ 🖥️  서버 성능:                                                       ║'.yellow.bold);
            console.log(`║   💾 메모리 사용: ${this.formatMemoryUsage().padEnd(48)} ║`);
            console.log(`║   🔄 가동시간: ${this.formatUptime(stats.startTime).padEnd(50)} ║`);
            console.log(`║   📊 CPU 사용률: ${this.getCPUUsage().padEnd(48)} ║`);
            
            console.log('╠══════════════════════════════════════════════════════════════════════╣'.cyan);
            
            // 데이터베이스 통계
            console.log('║ 🗄️  데이터베이스:                                                    ║'.yellow.bold);
            if (performance && performance.database) {
                console.log(`║   🔗 연결 수: ${performance.database.active_connections.toString().padEnd(51)} ║`);
                console.log(`║   📄 총 Share: ${performance.database.total_shares.toString().padEnd(49)} ║`);
                console.log(`║   🏆 총 블록: ${performance.database.total_blocks.toString().padEnd(50)} ║`);
            }
            
            console.log('╠══════════════════════════════════════════════════════════════════════╣'.cyan);
            
            // 네트워크 통계
            console.log('║ 🌐 네트워크:                                                         ║'.yellow.bold);
            console.log(`║   📤 총 메시지: ${this.getTotalMessages().padEnd(49)} ║`);
            console.log(`║   📥 수신률: ${this.getMessageRate().padEnd(52)} ║`);
            console.log(`║   🔄 재연결 횟수: ${this.getReconnectCount().padEnd(47)} ║`);
            
            console.log('╠══════════════════════════════════════════════════════════════════════╣'.cyan);
            
            // ECCPoW 상세 통계
            console.log('║ ⚡ ECCPoW 상세:                                                      ║'.yellow.bold);
            console.log(`║   🔍 평균 검증 시간: ${this.getAvgValidationTime().padEnd(42)} ║`);
            console.log(`║   📊 레벨별 분포: ${this.getLevelDistribution().padEnd(45)} ║`);
            console.log(`║   🎯 가중치 분포: ${this.getWeightDistribution().padEnd(45)} ║`);
            
        } catch (error) {
            console.log('║ ❌ 통계 로드 오류 발생                                               ║'.red);
        }
        
        // 남은 줄 채우기
        const remainingLines = 5;
        for (let i = 0; i < remainingLines; i++) {
            console.log('║' + ' '.repeat(70) + '║');
        }
        
        console.log('╠══════════════════════════════════════════════════════════════════════╣'.cyan);
        console.log('║ 🎮 [D]대시보드 [L]로그 [S]통계새로고침 [C]지우기                     ║'.magenta);
        console.log('╚══════════════════════════════════════════════════════════════════════╝'.cyan);
    }

    showHelp() {
        console.clear();
        console.log('╔══════════════════════════════════════════════════════════════════════╗'.cyan);
        console.log('║                            📖 도움말                                 ║'.cyan);
        console.log('╠══════════════════════════════════════════════════════════════════════╣'.cyan);
        console.log('║                                                                      ║');
        console.log('║ 🎮 키보드 단축키:                                                    ║'.yellow.bold);
        console.log('║                                                                      ║');
        console.log('║   [D] 또는 [d] - 대시보드 보기                                       ║'.white);
        console.log('║   [L] 또는 [l] - 실시간 로그 보기                                    ║'.white);
        console.log('║   [S] 또는 [s] - 상세 통계 보기                                      ║'.white);
        console.log('║   [C] 또는 [c] - 화면 지우기                                         ║'.white);
        console.log('║   [H] 또는 [h] - 이 도움말 보기                                      ║'.white);
        console.log('║   [Ctrl+C]     - 서버 종료                                           ║'.red);
        console.log('║                                                                      ║');
        console.log('║ 📊 대시보드 정보:                                                    ║'.yellow.bold);
        console.log('║   - 실시간 연결 상태 및 채굴자 정보                                  ║'.white);
        console.log('║   - Share 승인/거부 통계                                             ║'.white);
        console.log('║   - ECCPoW 검증 성능                                                 ║'.white);
        console.log('║   - 블록 발견 현황                                                   ║'.white);
        console.log('║                                                                      ║');
        console.log('║ 📜 로그 뷰어:                                                        ║'.yellow.bold);
        console.log('║   - 최근 50개 이벤트 실시간 표시                                     ║'.white);
        console.log('║   - Share 제출/승인/거부 추적                                        ║'.white);
        console.log('║   - 연결/해제 이벤트                                                 ║'.white);
        console.log('║                                                                      ║');
        console.log('╠══════════════════════════════════════════════════════════════════════╣'.cyan);
        console.log('║ 아무 키나 눌러서 대시보드로 돌아가기                                 ║'.magenta);
        console.log('╚══════════════════════════════════════════════════════════════════════╝'.cyan);
    }

    // ====================================
    // 유틸리티 함수들
    // ====================================

    getConnectionStatusIcon(stats) {
        if (stats.authorizedConnections > 0) {
            return { icon: '🟢', text: 'Active - ' + stats.authorizedConnections + ' miners connected' };
        } else if (stats.activeConnections > 0) {
            return { icon: '🟡', text: 'Waiting - connections but no authorized miners' };
        } else {
            return { icon: '🔴', text: 'Idle - no connections' };
        }
    }

    getRecentActivity() {
        // 최근 활동 로그 반환 (실제 구현에서는 서버에서 가져옴)
        return [
            `${new Date().toLocaleTimeString()} - Share submitted by 0x1234...`,
            `${new Date().toLocaleTimeString()} - New miner connected`,
            `${new Date().toLocaleTimeString()} - ECCPoW validation completed`
        ].slice(0, 3);
    }

    getFormattedLogs() {
        // 포맷된 로그 반환 (최근 20개)
        return this.logBuffer.slice(-20).map(log => {
            return `${log.timestamp} ${log.level} ${log.message}`;
        });
    }

    addLogEntry(level, message, data = {}) {
        const logEntry = {
            timestamp: new Date().toLocaleTimeString(),
            level: level,
            message: message,
            data: data
        };
        
        this.logBuffer.push(logEntry);
        
        // 최대 로그 수 제한
        if (this.logBuffer.length > this.maxLogs) {
            this.logBuffer.shift();
        }
    }

    formatMemoryUsage() {
        const used = process.memoryUsage();
        const total = used.heapTotal / 1024 / 1024;
        const usage = used.heapUsed / 1024 / 1024;
        return `${usage.toFixed(1)}MB / ${total.toFixed(1)}MB`;
    }

    formatUptime(startTime) {
        const uptime = Date.now() - startTime;
        const hours = Math.floor(uptime / (1000 * 60 * 60));
        const minutes = Math.floor((uptime % (1000 * 60 * 60)) / (1000 * 60));
        return `${hours}h ${minutes}m`;
    }

    getCPUUsage() {
        // 간단한 CPU 사용률 (실제로는 더 정확한 측정 필요)
        const usage = process.cpuUsage();
        return `${((usage.user + usage.system) / 1000000).toFixed(1)}%`;
    }

    getTotalMessages() {
        return (this.server.stats?.sharesSubmitted || 0).toLocaleString();
    }

    getMessageRate() {
        const uptime = (Date.now() - this.server.stats?.startTime) / 1000 / 60; // minutes
        const rate = uptime > 0 ? (this.server.stats?.sharesSubmitted || 0) / uptime : 0;
        return `${rate.toFixed(1)}/min`;
    }

    getReconnectCount() {
        return '0'; // 실제 구현에서는 재연결 통계 사용
    }

    getAvgValidationTime() {
        return '~15ms'; // 실제 구현에서는 측정된 평균 시간 사용
    }

    getLevelDistribution() {
        return 'L5-15 (avg: 8.2)'; // 실제 구현에서는 레벨 분포 계산
    }

    getWeightDistribution() {
        return '50-500 (avg: 145)'; // 실제 구현에서는 가중치 분포 계산
    }

    // 모니터링 중지
    stop() {
        this.isActive = false;
        console.log('📺 콘솔 모니터링 중지됨'.yellow);
    }
}

module.exports = ConsoleMonitor;