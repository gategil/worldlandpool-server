#!/bin/bash
# server/scripts/ssl-setup.sh
# SSL 인증서 설정 및 관리 스크립트

set -e

# 색상 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 설정
CERT_DIR="$(pwd)/certificate"
DOMAIN="doldari.com"
COUNTRY="KR"
STATE="Daejeon"
CITY="Daejeon"
ORG="WorldLand Pool"
OU="Mining Pool"

echo -e "${BLUE}🔒 WorldLand Pool SSL 인증서 설정 도구${NC}"
echo "============================================"

# 함수: 디렉토리 생성
create_cert_directory() {
    echo -e "${YELLOW}📁 인증서 디렉토리 생성 중...${NC}"
    
    if [ ! -d "$CERT_DIR" ]; then
        mkdir -p "$CERT_DIR"
        echo -e "${GREEN}✅ 디렉토리 생성: $CERT_DIR${NC}"
    else
        echo -e "${GREEN}✅ 디렉토리 존재: $CERT_DIR${NC}"
    fi
    
    chmod 700 "$CERT_DIR"
}

# 함수: 자체 서명 인증서 생성
generate_self_signed_cert() {
    echo -e "${YELLOW}🔐 자체 서명 SSL 인증서 생성 중...${NC}"
    
    # 개인키 생성
    openssl genrsa -out "$CERT_DIR/RSA-privkey.pem" 2048
    
    # CSR 생성
    openssl req -new -key "$CERT_DIR/RSA-privkey.pem" -out "$CERT_DIR/cert.csr" -subj "/C=$COUNTRY/ST=$STATE/L=$CITY/O=$ORG/OU=$OU/CN=$DOMAIN"
    
    # 인증서 생성 (1년 유효)
    openssl x509 -req -days 365 -in "$CERT_DIR/cert.csr" -signkey "$CERT_DIR/RSA-privkey.pem" -out "$CERT_DIR/RSA-cert.pem"
    
    # 풀체인 생성 (자체 서명의 경우 인증서와 동일)
    cp "$CERT_DIR/RSA-cert.pem" "$CERT_DIR/RSA-fullchain.pem"
    
    # 임시 파일 삭제
    rm "$CERT_DIR/cert.csr"
    
    # 권한 설정
    chmod 600 "$CERT_DIR"/*.pem
    
    echo -e "${GREEN}✅ 자체 서명 인증서 생성 완료${NC}"
}

# 함수: Let's Encrypt 인증서 생성
generate_letsencrypt_cert() {
    echo -e "${YELLOW}🌍 Let's Encrypt 인증서 생성 중...${NC}"
    
    if ! command -v certbot &> /dev/null; then
        echo -e "${RED}❌ certbot이 설치되지 않았습니다.${NC}"
        echo "Ubuntu/Debian: sudo apt install certbot"
        echo "CentOS/RHEL: sudo yum install certbot"
        return 1
    fi
    
    # 웹루트 디렉토리 생성
    mkdir -p /tmp/letsencrypt-webroot
    
    # certbot으로 인증서 생성
    certbot certonly \
        --webroot \
        --webroot-path=/tmp/letsencrypt-webroot \
        --email admin@$DOMAIN \
        --agree-tos \
        --no-eff-email \
        -d $DOMAIN \
        -d www.$DOMAIN
    
    # Let's Encrypt 인증서를 우리 형식으로 복사
    cp "/etc/letsencrypt/live/$DOMAIN/privkey.pem" "$CERT_DIR/RSA-privkey.pem"
    cp "/etc/letsencrypt/live/$DOMAIN/cert.pem" "$CERT_DIR/RSA-cert.pem"
    cp "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" "$CERT_DIR/RSA-fullchain.pem"
    
    # 권한 설정
    chmod 600 "$CERT_DIR"/*.pem
    
    echo -e "${GREEN}✅ Let's Encrypt 인증서 생성 완료${NC}"
}

# 함수: 기존 인증서 복사
copy_existing_cert() {
    echo -e "${YELLOW}📋 기존 인증서 복사 중...${NC}"
    
    echo "인증서 파일 경로를 입력하세요:"
    
    read -p "개인키 파일 (.key): " PRIVATE_KEY_PATH
    read -p "인증서 파일 (.crt/.pem): " CERT_PATH
    read -p "풀체인 파일 (.pem) [선택사항]: " FULLCHAIN_PATH
    
    if [ ! -f "$PRIVATE_KEY_PATH" ]; then
        echo -e "${RED}❌ 개인키 파일을 찾을 수 없습니다: $PRIVATE_KEY_PATH${NC}"
        return 1
    fi
    
    if [ ! -f "$CERT_PATH" ]; then
        echo -e "${RED}❌ 인증서 파일을 찾을 수 없습니다: $CERT_PATH${NC}"
        return 1
    fi
    
    # 파일 복사
    cp "$PRIVATE_KEY_PATH" "$CERT_DIR/RSA-privkey.pem"
    cp "$CERT_PATH" "$CERT_DIR/RSA-cert.pem"
    
    if [ -f "$FULLCHAIN_PATH" ]; then
        cp "$FULLCHAIN_PATH" "$CERT_DIR/RSA-fullchain.pem"
    else
        cp "$CERT_PATH" "$CERT_DIR/RSA-fullchain.pem"
    fi
    
    # 권한 설정
    chmod 600 "$CERT_DIR"/*.pem
    
    echo -e "${GREEN}✅ 기존 인증서 복사 완료${NC}"
}

# 함수: 인증서 정보 확인
verify_certificates() {
    echo -e "${YELLOW}🔍 인증서 검증 중...${NC}"
    
    if [ ! -f "$CERT_DIR/RSA-privkey.pem" ]; then
        echo -e "${RED}❌ 개인키가 없습니다: $CERT_DIR/RSA-privkey.pem${NC}"
        return 1
    fi
    
    if [ ! -f "$CERT_DIR/RSA-cert.pem" ]; then
        echo -e "${RED}❌ 인증서가 없습니다: $CERT_DIR/RSA-cert.pem${NC}"
        return 1
    fi
    
    echo -e "${GREEN}✅ 파일 존재 확인 완료${NC}"
    
    # 인증서 정보 출력
    echo -e "${BLUE}📋 인증서 정보:${NC}"
    openssl x509 -in "$CERT_DIR/RSA-cert.pem" -text -noout | grep -E "(Subject:|Issuer:|Not Before:|Not After :|DNS:)"
    
    # 개인키와 인증서 매칭 확인
    PRIVATE_KEY_HASH=$(openssl rsa -in "$CERT_DIR/RSA-privkey.pem" -modulus -noout | openssl md5)
    CERT_HASH=$(openssl x509 -in "$CERT_DIR/RSA-cert.pem" -modulus -noout | openssl md5)
    
    if [ "$PRIVATE_KEY_HASH" = "$CERT_HASH" ]; then
        echo -e "${GREEN}✅ 개인키와 인증서가 매칭됩니다${NC}"
    else
        echo -e "${RED}❌ 개인키와 인증서가 매칭되지 않습니다${NC}"
        return 1
    fi
    
    echo -e "${GREEN}✅ 인증서 검증 완료${NC}"
}

# 함수: 인증서 갱신 (Let's Encrypt)
renew_certificates() {
    echo -e "${YELLOW}🔄 인증서 갱신 중...${NC}"
    
    if [ ! -d "/etc/letsencrypt/live/$DOMAIN" ]; then
        echo -e "${RED}❌ Let's Encrypt 인증서를 찾을 수 없습니다${NC}"
        return 1
    fi
    
    # certbot으로 갱신
    certbot renew --quiet
    
    # 갱신된 인증서 복사
    cp "/etc/letsencrypt/live/$DOMAIN/privkey.pem" "$CERT_DIR/RSA-privkey.pem"
    cp "/etc/letsencrypt/live/$DOMAIN/cert.pem" "$CERT_DIR/RSA-cert.pem"
    cp "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" "$CERT_DIR/RSA-fullchain.pem"
    
    # 권한 설정
    chmod 600 "$CERT_DIR"/*.pem
    
    echo -e "${GREEN}✅ 인증서 갱신 완료${NC}"
    
    # 서버 재시작 (선택사항)
    read -p "풀 서버를 재시작하시겠습니까? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${YELLOW}🔄 서버 재시작 중...${NC}"
        if [ -f "pm2.json" ]; then
            pm2 restart pool-server
        elif systemctl is-active --quiet worldland-pool; then
            sudo systemctl restart worldland-pool
        else
            echo -e "${YELLOW}⚠️ 수동으로 서버를 재시작해주세요${NC}"
        fi
    fi
}

# 함수: 인증서 백업
backup_certificates() {
    echo -e "${YELLOW}💾 인증서 백업 중...${NC}"
    
    BACKUP_DIR="$CERT_DIR/backup/$(date +%Y%m%d_%H%M%S)"
    mkdir -p "$BACKUP_DIR"
    
    if [ -f "$CERT_DIR/RSA-privkey.pem" ]; then
        cp "$CERT_DIR/RSA-privkey.pem" "$BACKUP_DIR/"
        cp "$CERT_DIR/RSA-cert.pem" "$BACKUP_DIR/"
        cp "$CERT_DIR/RSA-fullchain.pem" "$BACKUP_DIR/"
        
        echo -e "${GREEN}✅ 인증서 백업 완료: $BACKUP_DIR${NC}"
    else
        echo -e "${RED}❌ 백업할 인증서가 없습니다${NC}"
        return 1
    fi
}

# 함수: SSL 테스트
test_ssl() {
    echo -e "${YELLOW}🧪 SSL 연결 테스트 중...${NC}"
    
    # Node.js 서버가 실행 중인지 확인
    if ! pgrep -f "pool-server.js" > /dev/null; then
        echo -e "${RED}❌ 풀 서버가 실행되지 않았습니다${NC}"
        return 1
    fi
    
    # SSL 연결 테스트
    if openssl s_client -connect localhost:3443 -servername $DOMAIN < /dev/null; then
        echo -e "${GREEN}✅ SSL 연결 테스트 성공${NC}"
    else
        echo -e "${RED}❌ SSL 연결 테스트 실패${NC}"
        return 1
    fi
    
    # HTTP API 테스트
    if curl -k -s "https://localhost:3443/api/pool/health" | grep -q "healthy"; then
        echo -e "${GREEN}✅ HTTPS API 테스트 성공${NC}"
    else
        echo -e "${RED}❌ HTTPS API 테스트 실패${NC}"
        return 1
    fi
}

# 메인 메뉴
show_menu() {
    echo
    echo -e "${BLUE}SSL 인증서 관리 메뉴:${NC}"
    echo "1) 자체 서명 인증서 생성"
    echo "2) Let's Encrypt 인증서 생성"
    echo "3) 기존 인증서 복사"
    echo "4) 인증서 검증"
    echo "5) 인증서 갱신 (Let's Encrypt)"
    echo "6) 인증서 백업"
    echo "7) SSL 연결 테스트"
    echo "8) 종료"
    echo
}

# 메인 로직
main() {
    create_cert_directory
    
    while true; do
        show_menu
        read -p "선택하세요 (1-8): " choice
        
        case $choice in
            1)
                generate_self_signed_cert
                verify_certificates
                ;;
            2)
                generate_letsencrypt_cert
                verify_certificates
                ;;
            3)
                copy_existing_cert
                verify_certificates
                ;;
            4)
                verify_certificates
                ;;
            5)
                renew_certificates
                verify_certificates
                ;;
            6)
                backup_certificates
                ;;
            7)
                test_ssl
                ;;
            8)
                echo -e "${GREEN}👋 SSL 설정 도구를 종료합니다${NC}"
                exit 0
                ;;
            *)
                echo -e "${RED}❌ 잘못된 선택입니다${NC}"
                ;;
        esac
        
        echo
        read -p "계속하려면 Enter를 누르세요..."
    done
}

# 스크립트 실행
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi

---

# server/scripts/ssl-monitor.sh
# SSL 인증서 모니터링 및 자동 갱신 스크립트

#!/bin/bash

CERT_DIR="$(pwd)/certificate"
DOMAIN="doldari.com"
LOG_FILE="/var/log/worldland-pool-ssl.log"
NOTIFICATION_EMAIL="admin@worldlandcafe.com"

# 색상 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# 로그 함수
log() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') - $1" | tee -a "$LOG_FILE"
}

# 인증서 만료일 확인
check_certificate_expiry() {
    local cert_file="$CERT_DIR/RSA-cert.pem"
    
    if [ ! -f "$cert_file" ]; then
        log "ERROR: 인증서 파일을 찾을 수 없습니다: $cert_file"
        return 1
    fi
    
    # 만료일 가져오기
    local expiry_date=$(openssl x509 -in "$cert_file" -noout -enddate | cut -d= -f2)
    local expiry_timestamp=$(date -d "$expiry_date" +%s)
    local current_timestamp=$(date +%s)
    local days_until_expiry=$(( (expiry_timestamp - current_timestamp) / 86400 ))
    
    log "INFO: 인증서 만료까지 $days_until_expiry 일 남음"
    
    # 30일 미만이면 경고
    if [ $days_until_expiry -lt 30 ]; then
        log "WARNING: 인증서가 30일 이내에 만료됩니다 ($days_until_expiry 일)"
        send_notification "SSL 인증서 만료 경고" "WorldLand Pool SSL 인증서가 $days_until_expiry 일 후 만료됩니다."
        
        # 7일 미만이면 자동 갱신 시도
        if [ $days_until_expiry -lt 7 ]; then
            log "WARNING: 7일 이내 만료, 자동 갱신을 시도합니다"
            auto_renew_certificate
        fi
        
        return 1
    fi
    
    return 0
}

# 자동 인증서 갱신
auto_renew_certificate() {
    log "INFO: Let's Encrypt 인증서 자동 갱신 시작"
    
    if [ ! -d "/etc/letsencrypt/live/$DOMAIN" ]; then
        log "ERROR: Let's Encrypt 인증서를 찾을 수 없습니다"
        return 1
    fi
    
    # certbot으로 갱신
    if certbot renew --quiet --deploy-hook "/opt/worldland-pool/scripts/ssl-deploy-hook.sh"; then
        log "INFO: 인증서 갱신 성공"
        
        # 갱신된 인증서 복사
        cp "/etc/letsencrypt/live/$DOMAIN/privkey.pem" "$CERT_DIR/RSA-privkey.pem"
        cp "/etc/letsencrypt/live/$DOMAIN/cert.pem" "$CERT_DIR/RSA-cert.pem"
        cp "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" "$CERT_DIR/RSA-fullchain.pem"
        
        # 권한 설정
        chmod 600 "$CERT_DIR"/*.pem
        
        # 서버 재시작
        restart_pool_server
        
        send_notification "SSL 인증서 갱신 완료" "WorldLand Pool SSL 인증서가 성공적으로 갱신되었습니다."
        
        return 0
    else
        log "ERROR: 인증서 갱신 실패"
        send_notification "SSL 인증서 갱신 실패" "WorldLand Pool SSL 인증서 갱신에 실패했습니다. 수동 확인이 필요합니다."
        return 1
    fi
}

# 서버 재시작
restart_pool_server() {
    log "INFO: 풀 서버 재시작 중"
    
    if [ -f "/opt/worldland-pool/pm2.json" ]; then
        pm2 restart pool-server
        log "INFO: PM2로 서버 재시작 완료"
    elif systemctl is-active --quiet worldland-pool; then
        sudo systemctl restart worldland-pool
        log "INFO: systemctl로 서버 재시작 완료"
    elif pgrep -f "pool-server.js" > /dev/null; then
        pkill -f "pool-server.js"
        sleep 2
        cd /opt/worldland-pool && node pool-server.js &
        log "INFO: 수동으로 서버 재시작 완료"
    else
        log "WARNING: 실행 중인 풀 서버를 찾을 수 없습니다"
    fi
}

# 알림 발송
send_notification() {
    local subject="$1"
    local message="$2"
    
    # 이메일 발송 (mail 명령어가 설치된 경우)
    if command -v mail &> /dev/null; then
        echo "$message" | mail -s "$subject" "$NOTIFICATION_EMAIL"
        log "INFO: 이메일 알림 발송: $subject"
    fi
    
    # Slack 웹훅 (설정된 경우)
    if [ -n "$SLACK_WEBHOOK_URL" ]; then
        curl -X POST -H 'Content-type: application/json' \
            --data "{\"text\":\"$subject: $message\"}" \
            "$SLACK_WEBHOOK_URL"
        log "INFO: Slack 알림 발송: $subject"
    fi
    
    # Discord 웹훅 (설정된 경우)
    if [ -n "$DISCORD_WEBHOOK_URL" ]; then
        curl -X POST -H 'Content-type: application/json' \
            --data "{\"content\":\"**$subject**\n$message\"}" \
            "$DISCORD_WEBHOOK_URL"
        log "INFO: Discord 알림 발송: $subject"
    fi
}

# SSL 연결 테스트
test_ssl_connection() {
    local port=${1:-3443}
    
    log "INFO: SSL 연결 테스트 (포트 $port)"
    
    # OpenSSL로 연결 테스트
    if timeout 10 openssl s_client -connect "localhost:$port" -servername "$DOMAIN" < /dev/null &> /dev/null; then
        log "INFO: SSL 연결 테스트 성공"
        return 0
    else
        log "ERROR: SSL 연결 테스트 실패"
        return 1
    fi
}

# API 헬스체크
check_api_health() {
    local port=${1:-3443}
    
    log "INFO: API 헬스체크 (포트 $port)"
    
    # HTTPS API 테스트
    if curl -k -s --max-time 10 "https://localhost:$port/api/pool/health" | grep -q "healthy"; then
        log "INFO: API 헬스체크 성공"
        return 0
    else
        log "ERROR: API 헬스체크 실패"
        return 1
    fi
}

# 인증서 백업
backup_certificates() {
    local backup_dir="/opt/worldland-pool/backups/ssl/$(date +%Y%m%d_%H%M%S)"
    
    log "INFO: 인증서 백업 시작"
    
    mkdir -p "$backup_dir"
    
    if [ -f "$CERT_DIR/RSA-privkey.pem" ]; then
        cp "$CERT_DIR"/*.pem "$backup_dir/"
        
        # 7일 이상 된 백업 삭제
        find /opt/worldland-pool/backups/ssl -type d -mtime +7 -exec rm -rf {} +
        
        log "INFO: 인증서 백업 완료: $backup_dir"
        return 0
    else
        log "ERROR: 백업할 인증서를 찾을 수 없습니다"
        return 1
    fi
}

# 메인 모니터링 함수
monitor_ssl() {
    log "INFO: SSL 모니터링 시작"
    
    # 1. 인증서 만료일 확인
    if ! check_certificate_expiry; then
        log "WARNING: 인증서 만료 확인에서 문제 발견"
    fi
    
    # 2. SSL 연결 테스트
    if ! test_ssl_connection; then
        log "ERROR: SSL 연결 테스트 실패"
        send_notification "SSL 연결 실패" "WorldLand Pool SSL 연결에 문제가 있습니다."
    fi
    
    # 3. API 헬스체크
    if ! check_api_health; then
        log "ERROR: API 헬스체크 실패"
        send_notification "API 서비스 실패" "WorldLand Pool API 서비스에 문제가 있습니다."
    fi
    
    # 4. 인증서 백업 (주간)
    if [ "$(date +%u)" -eq 1 ] && [ "$(date +%H)" -eq 2 ]; then
        backup_certificates
    fi
    
    log "INFO: SSL 모니터링 완료"
}

# 사용법
usage() {
    echo "사용법: $0 [옵션]"
    echo "옵션:"
    echo "  monitor     - SSL 상태 모니터링 실행"
    echo "  renew       - 인증서 강제 갱신"
    echo "  test        - SSL 연결 테스트만 실행"
    echo "  backup      - 인증서 백업"
    echo "  --daemon    - 데몬 모드로 실행 (1시간마다 모니터링)"
    echo "  --help      - 도움말 표시"
}

# 데몬 모드
daemon_mode() {
    log "INFO: SSL 모니터링 데몬 모드 시작"
    
    while true; do
        monitor_ssl
        sleep 3600  # 1시간 대기
    done
}

# 메인 로직
case "${1:-monitor}" in
    monitor)
        monitor_ssl
        ;;
    renew)
        auto_renew_certificate
        ;;
    test)
        test_ssl_connection
        check_api_health
        ;;
    backup)
        backup_certificates
        ;;
    --daemon)
        daemon_mode
        ;;
    --help|-h)
        usage
        ;;
    *)
        echo "알 수 없는 옵션: $1"
        usage
        exit 1
        ;;
esac

---

# server/scripts/ssl-deploy-hook.sh
# Let's Encrypt 인증서 배포 후 실행되는 스크립트

#!/bin/bash

CERT_DIR="/opt/worldland-pool/certificate"
DOMAIN="doldari.com"
LOG_FILE="/var/log/worldland-pool-ssl.log"

log() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') - DEPLOY-HOOK: $1" >> "$LOG_FILE"
}

log "인증서 배포 후크 실행 시작"

# 새 인증서를 풀 서버 디렉토리로 복사
if [ -d "/etc/letsencrypt/live/$DOMAIN" ]; then
    cp "/etc/letsencrypt/live/$DOMAIN/privkey.pem" "$CERT_DIR/RSA-privkey.pem"
    cp "/etc/letsencrypt/live/$DOMAIN/cert.pem" "$CERT_DIR/RSA-cert.pem"
    cp "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" "$CERT_DIR/RSA-fullchain.pem"
    
    # 권한 설정
    chmod 600 "$CERT_DIR"/*.pem
    chown pooluser:poolgroup "$CERT_DIR"/*.pem 2>/dev/null || true
    
    log "새 인증서 복사 완료"
else
    log "ERROR: Let's Encrypt 인증서 디렉토리를 찾을 수 없습니다"
    exit 1
fi

# 풀 서버 재시작
if [ -f "/opt/worldland-pool/pm2.json" ]; then
    pm2 restart pool-server
    log "PM2로 서버 재시작 완료"
elif systemctl is-active --quiet worldland-pool; then
    systemctl restart worldland-pool
    log "systemctl로 서버 재시작 완료"
else
    log "WARNING: 자동 서버 재시작 실패, 수동 재시작 필요"
fi

log "인증서 배포 후크 실행 완료"

---

# crontab 설정 예시
# SSL 인증서 자동 모니터링을 위한 cron 작업

# /etc/crontab 또는 crontab -e로 추가

# 매시간 SSL 상태 모니터링
0 * * * * /opt/worldland-pool/scripts/ssl-monitor.sh monitor

# 매일 오전 2시에 Let's Encrypt 갱신 확인
0 2 * * * /opt/worldland-pool/scripts/ssl-monitor.sh renew

# 매주 월요일 오전 3시에 인증서 백업
0 3 * * 1 /opt/worldland-pool/scripts/ssl-monitor.sh backup

# 5분마다 SSL 연결 테스트 (선택사항)
*/5 * * * * /opt/worldland-pool/scripts/ssl-monitor.sh test

---

# systemd 서비스 파일 (선택사항)
# /etc/systemd/system/worldland-pool-ssl-monitor.service

[Unit]
Description=WorldLand Pool SSL Monitor
After=network.target

[Service]
Type=simple
User=pooluser
Group=poolgroup
WorkingDirectory=/opt/worldland-pool
ExecStart=/opt/worldland-pool/scripts/ssl-monitor.sh --daemon
Restart=always
RestartSec=60
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target

# 서비스 활성화:
# sudo systemctl enable worldland-pool-ssl-monitor
# sudo systemctl start worldland-pool-ssl-monitor