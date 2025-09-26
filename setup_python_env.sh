#!/bin/bash
# check_python_env.sh - Python 환경 점검 및 최소한의 복구

PROJECT_DIR="/home/ubuntu/projects/ai-ad-analysis-web"
VENV_DIR="$PROJECT_DIR/venv"

echo "Python 환경 점검 시작..."
cd "$PROJECT_DIR"

# 1단계: 기존 가상환경 상태 확인
check_existing_venv() {
    if [ ! -d "$VENV_DIR" ]; then
        echo "❌ 가상환경 디렉토리가 없습니다"
        return 1
    fi
    
    if [ ! -f "$VENV_DIR/bin/python" ]; then
        echo "❌ Python 실행 파일이 없습니다"
        return 1
    fi
    
    # Python 버전 확인
    if ! "$VENV_DIR/bin/python" --version &>/dev/null; then
        echo "❌ Python 실행 파일이 손상되었습니다"
        return 1
    fi
    
    echo "✅ 기존 가상환경 정상"
    return 0
}

# 2단계: 필수 패키지 확인
check_packages() {
    echo "필수 패키지 확인 중..."
    source "$VENV_DIR/bin/activate"
    
    missing_packages=()
    
    # 패키지별 확인
    if ! python -c "import requests" &>/dev/null; then
        missing_packages+=("requests")
    fi
    
    if ! python -c "import schedule" &>/dev/null; then
        missing_packages+=("schedule")
    fi
    
    # sqlite3는 내장 모듈이므로 별도 설치 불필요
    
    if [ ${#missing_packages[@]} -eq 0 ]; then
        echo "✅ 모든 필수 패키지 설치됨"
        return 0
    else
        echo "⚠️ 누락된 패키지: ${missing_packages[*]}"
        return 1
    fi
}

# 3단계: 누락된 패키지만 설치
install_missing_packages() {
    echo "누락된 패키지 설치 중..."
    source "$VENV_DIR/bin/activate"
    pip install --upgrade pip
    pip install requests schedule
    echo "✅ 패키지 설치 완료"
}

# 4단계: 새 가상환경 생성 (최후의 수단)
create_new_venv() {
    echo "새 가상환경 생성 중..."
    
    # 백업 생성 (기존 환경이 있다면)
    if [ -d "$VENV_DIR" ]; then
        backup_dir="${VENV_DIR}_backup_$(date +%Y%m%d_%H%M%S)"
        echo "기존 환경을 백업으로 이동: $backup_dir"
        mv "$VENV_DIR" "$backup_dir"
    fi
    
    python3 -m venv "$VENV_DIR"
    source "$VENV_DIR/bin/activate"
    pip install --upgrade pip
    pip install requests schedule
    echo "✅ 새 가상환경 생성 완료"
}

# 메인 실행 로직
main() {
    if check_existing_venv; then
        if check_packages; then
            echo "🎉 Python 환경이 완전히 정상입니다!"
        else
            install_missing_packages
        fi
    else
        echo "기존 가상환경에 문제가 있습니다."
        read -p "새로 생성하시겠습니까? (y/N): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            create_new_venv
        else
            echo "취소되었습니다. 수동으로 문제를 해결해주세요."
            exit 1
        fi
    fi
    
    # 최종 테스트
    echo "최종 테스트..."
    "$VENV_DIR/bin/python" --version
    "$VENV_DIR/bin/python" -c "import requests, schedule; print('모든 패키지 정상 import됨')"
    echo "✅ Python 환경 점검 완료!"
}

main
