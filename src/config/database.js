// config/database.js
// Synology NAS MariaDB 연결 설정 (기존 서버 환경 통합)

const mysql = require('mysql2/promise');

// 환경변수 로드 확인
require('dotenv').config();

console.log('🔧 환경변수 확인:');
console.log('   - DB_HOST:', process.env.DB_HOST);
console.log('   - DB_PORT:', process.env.DB_PORT);
console.log('   - DB_NAME:', process.env.DB_NAME);
console.log('   - DB_USER:', process.env.DB_USER);

// 환경변수에서 DB 설정 로드 (기존 서버와 동일)
const dbConfig = {
    host: process.env.DB_HOST || 'www.doldari.com',
    port: parseInt(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '#Ghwns3962',
    database: process.env.DB_NAME || 'worldlandpool', // 수정: DB_PASSWORD_NAME -> DB_NAME
    charset: 'utf8mb4',
    
    // MySQL2에서 지원하는 연결 풀 설정만 사용
    connectionLimit: 50,
    queueLimit: 0,
    
    // 기존 서버와 동일한 설정
    supportBigNumbers: true,
    bigNumberStrings: true,
    
    // 타임존 설정
    timezone: '+00:00',
    
    // 연결 유지 설정
    keepAliveInitialDelay: 0,
    enableKeepAlive: true
};

console.log('🔧 DB 설정 확인:', {
    host: dbConfig.host,
    port: dbConfig.port,
    database: dbConfig.database,
    user: dbConfig.user
});

// 연결 풀 생성
const pool = mysql.createPool(dbConfig);

// 연결 테스트 함수
async function testConnection() {
    try {
        const connection = await pool.getConnection();
        console.log(`✅ MariaDB 연결 성공! (${dbConfig.host}:${dbConfig.port}/${dbConfig.database})`);
        
        // 간단한 쿼리 테스트
        const [rows] = await connection.execute('SELECT 1 as test');
        console.log('✅ 쿼리 테스트 성공:', rows[0]);
        
        // 현재 데이터베이스 확인
        const [dbRows] = await connection.execute('SELECT DATABASE() as current_db');
        console.log('✅ 현재 데이터베이스:', dbRows[0].current_db);
        
        connection.release();
        return true;
    } catch (error) {
        console.error('❌ MariaDB 연결 실패:', error.message);
        console.error('   - Host:', dbConfig.host);
        console.error('   - Port:', dbConfig.port);
        console.error('   - Database:', dbConfig.database);
        console.error('   - User:', dbConfig.user);
        console.error('   - 상세 오류:', error.code);
        return false;
    }
}

// 연결 모니터링
pool.on('connection', (connection) => {
    console.log(`🔗 새로운 DB 연결 생성: ${connection.threadId}`);
});

pool.on('error', (error) => {
    console.error('❌ DB 연결 풀 오류:', error);
    
    // 치명적 오류시 프로세스 재시작
    if (error.code === 'PROTOCOL_CONNECTION_LOST') {
        console.log('🔄 DB 연결 재시도 중...');
    }
});

// 우아한 종료를 위한 cleanup 함수
async function closePool() {
    try {
        await pool.end();
        console.log('✅ DB 연결 풀 정상 종료');
    } catch (error) {
        console.error('❌ DB 연결 풀 종료 오류:', error);
    }
}

// 프로세스 종료시 정리 작업
process.on('SIGINT', async () => {
    console.log('\n🛑 서버 종료 신호 받음...');
    await closePool();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('\n🛑 서버 종료 요청...');
    await closePool();
    process.exit(0);
});

module.exports = {
    pool,
    testConnection,
    closePool
};