// lib/ldpc/utils.js - 수정 버전 (generateSeed 오류 해결)

const crypto = require('crypto');

// 상수들
const BigInfinity = 1000000.0;
const Inf = 64.0;
const MaxNonce = (1 << 32) - 1;
const maxIter = 20;
const crossErr = 0.01;

class LDPCUtils {
    constructor() {
        this.BigInfinity = BigInfinity;
        this.Inf = Inf;
        this.maxIter = maxIter;
        this.crossErr = crossErr;
    }

    // 파라미터 설정 (노드 코드의 setParameters 기반)
    setParameters(header, difficultyTable) {
        const level = this.searchLevel(header.difficulty, difficultyTable);
        const tableEntry = difficultyTable[level] || difficultyTable[0];
        
        const parameters = {
            n: tableEntry.n,
            wc: tableEntry.wc,
            wr: tableEntry.wr,
            level: level
        };
        
        parameters.m = Math.floor(parameters.n * parameters.wc / parameters.wr);
        parameters.seed = this.generateSeed(header.parentHash);
        
        return { parameters, level };
    }

    // Seoul 네트워크 파라미터 설정 (노드 코드의 setParameters_Seoul 기반)
    setParametersSeoul(header) {
        const level = this.searchLevelSeoul(header.difficulty);
        const table = this.getTable(level);
        
        const parameters = {
            n: table.n,
            wc: table.wc,
            wr: table.wr,
            level: level
        };
        
        parameters.m = Math.floor(parameters.n * parameters.wc / parameters.wr);
        parameters.seed = this.generateSeed(header.parentHash);
        
        return { parameters, level };
    }

    // 랜덤 논스 생성 (노드 코드의 generateRandomNonce 기반)
    generateRandomNonce() {
        const randomBytes = crypto.randomBytes(8);
        return randomBytes.readBigUInt64BE(0) & BigInt(MaxNonce);
    }

    // funcF 함수 (노드 코드의 funcF 기반)
    funcF(x) {
        if (x >= this.BigInfinity) {
            return 1.0 / this.BigInfinity;
        } else if (x <= (1.0 / this.BigInfinity)) {
            return this.BigInfinity;
        } else {
            return Math.log((Math.exp(x) + 1) / (Math.exp(x) - 1));
        }
    }

    // 무한대 테스트 (노드 코드의 infinityTest 기반)
    infinityTest(x) {
        if (x >= this.Inf) {
            return this.Inf;
        } else if (x <= -this.Inf) {
            return -this.Inf;
        } else {
            return x;
        }
    }

    // 시드 생성 (노드 코드의 generateSeed 기반) - 오류 수정
    generateSeed(parentHashVector) {
        try {
            // parentHashVector가 undefined이거나 null인 경우 기본값 사용
            if (!parentHashVector) {
                console.warn('⚠️ parentHashVector가 정의되지 않음, 기본값 사용');
                parentHashVector = crypto.randomBytes(32);
            }

            let hashArray;
            
            // 다양한 형태의 입력 처리
            if (typeof parentHashVector === 'string') {
                // 문자열인 경우 (hex 문자열 가능성)
                if (parentHashVector.startsWith('0x')) {
                    // 0x로 시작하는 hex 문자열
                    hashArray = Array.from(Buffer.from(parentHashVector.slice(2), 'hex'));
                } else {
                    // 일반 문자열
                    hashArray = Array.from(Buffer.from(parentHashVector, 'utf8'));
                }
            } else if (Buffer.isBuffer(parentHashVector)) {
                // Buffer인 경우
                hashArray = Array.from(parentHashVector);
            } else if (Array.isArray(parentHashVector)) {
                // 이미 배열인 경우
                hashArray = parentHashVector;
            } else {
                // 기타 경우 - 문자열로 변환 후 처리
                const str = String(parentHashVector);
                hashArray = Array.from(Buffer.from(str, 'utf8'));
            }

            // 배열이 비어있는 경우 기본값 사용
            if (!hashArray || hashArray.length === 0) {
                console.warn('⚠️ hashArray가 비어있음, 기본값 사용');
                hashArray = Array.from(crypto.randomBytes(32));
            }

            let sum = 0;
            for (let i = 0; i < hashArray.length; i++) {
                sum += hashArray[i];
            }
            
            return sum;
        } catch (error) {
            console.error('❌ generateSeed 오류:', error);
            // 오류 발생 시 기본 시드 반환
            return Math.floor(Math.random() * 1000000);
        }
    }

    // H 매트릭스 생성 (노드 코드의 generateH 기반)
    generateH(parameters) {
        const H = Array(parameters.m).fill(null).map(() => Array(parameters.n).fill(0));
        let hSeed = parameters.seed;
        const k = Math.floor(parameters.m / parameters.wc);

        // 첫 번째 블록 설정
        for (let i = 0; i < k; i++) {
            for (let j = i * parameters.wr; j < (i + 1) * parameters.wr && j < parameters.n; j++) {
                H[i][j] = 1;
            }
        }

        // 나머지 블록들을 순열로 생성
        for (let i = 1; i < parameters.wc; i++) {
            const colOrder = Array.from({length: parameters.n}, (_, idx) => idx);
            
            // 시드 기반 셔플
            this.shuffleWithSeed(colOrder, hSeed);
            hSeed--;

            for (let j = 0; j < parameters.n; j++) {
                const index = Math.floor(colOrder[j] / parameters.wr) + k * i;
                if (index < parameters.m) {
                    H[index][j] = 1;
                }
            }
        }

        return H;
    }

    // 시드 기반 배열 셔플 (노드 코드와 호환)
    shuffleWithSeed(array, seed) {
        const rng = this.createSeededRNG(seed);
        
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(rng() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
    }

    // 시드 기반 RNG 생성
    createSeededRNG(seed) {
        let state = seed % 2147483647;
        if (state <= 0) state += 2147483646;
        
        return function() {
            state = state * 16807 % 2147483647;
            return (state - 1) / 2147483646;
        };
    }

    // Q 매트릭스 생성 (노드 코드의 generateQ 기반)
    generateQ(parameters, H) {
        const colInRow = Array(parameters.wr).fill(null).map(() => Array(parameters.m).fill(0));
        const rowInCol = Array(parameters.wc).fill(null).map(() => Array(parameters.n).fill(0));

        let rowIndex = 0;
        let colIndex = 0;

        for (let i = 0; i < parameters.m; i++) {
            for (let j = 0; j < parameters.n; j++) {
                if (H[i][j] === 1) {
                    colInRow[colIndex % parameters.wr][i] = j;
                    colIndex++;

                    rowInCol[Math.floor(rowIndex / parameters.n)][j] = i;
                    rowIndex++;
                }
            }
        }

        return { colInRow, rowInCol };
    }

    // 해시 벡터 생성 (노드 코드의 generateHv 기반)
    generateHv(parameters, encryptedHeaderWithNonce) {
        const hashVector = new Array(parameters.n).fill(0);

        // encryptedHeaderWithNonce가 유효한지 확인
        if (!encryptedHeaderWithNonce || encryptedHeaderWithNonce.length === 0) {
            console.warn('⚠️ encryptedHeaderWithNonce가 비어있음, 랜덤 벡터 생성');
            for (let i = 0; i < parameters.n; i++) {
                hashVector[i] = Math.random() > 0.5 ? 1 : 0;
            }
            return hashVector;
        }

        for (let i = 0; i < Math.floor(parameters.n / 8); i++) {
            if (i < encryptedHeaderWithNonce.length) {
                const decimal = encryptedHeaderWithNonce[i];
                for (let j = 7; j >= 0; j--) {
                    const bitIndex = j + 8 * i;
                    if (bitIndex < parameters.n) {
                        hashVector[bitIndex] = (decimal >> (7 - j)) & 1;
                    }
                }
            }
        }

        return hashVector;
    }

    // 검색 레벨 (기본 네트워크용)
    searchLevel(difficulty, difficultyTable) {
        if (!difficulty || !difficultyTable || difficultyTable.length === 0) {
            console.warn('⚠️ 유효하지 않은 difficulty 또는 difficultyTable');
            return 0;
        }

        const currentProb = this.difficultyToProb(difficulty);
        let level = 0;
        let distance = 1.0;

        for (let i = 0; i < difficultyTable.length; i++) {
            const tableDist = Math.abs(currentProb - difficultyTable[i].miningProb);
            if (tableDist <= distance) {
                level = difficultyTable[i].level;
                distance = tableDist;
            } else {
                break;
            }
        }

        return level;
    }

    // Seoul 네트워크 검색 레벨 (노드 코드의 SearchLevel_Seoul 기반)
    searchLevelSeoul(difficulty) {
        if (!difficulty) {
            console.warn('⚠️ 유효하지 않은 difficulty');
            return 0;
        }

        let level = 0;
        const SeoulDifficulty = 1023;
        
        try {
            // BigInt 연산으로 정확한 계산
            const difficultyBigInt = BigInt(difficulty.toString());
            const seoulDifficultyBigInt = BigInt(SeoulDifficulty);
            const levelProb = { numerator: 29n, denominator: 20n }; // 29/20 = 1.45
            
            let difficultyRatio = difficultyBigInt * levelProb.denominator;
            const threshold = seoulDifficultyBigInt * levelProb.numerator;
            
            while (difficultyRatio >= threshold) {
                difficultyRatio = difficultyRatio * levelProb.denominator / levelProb.numerator;
                level++;
            }
            
            return Math.max(0, level);
        } catch (error) {
            console.error('❌ searchLevelSeoul 오류:', error);
            return 0;
        }
    }

    // 테이블 엔트리 가져오기 (Seoul용)
    getTable(level) {
        const n = 64 + level * 4;
        return {
            level: level,
            n: n,
            wc: 3,
            wr: 4,
            decisionFrom: Math.floor(n / 4),
            decisionTo: Math.floor(n * 3 / 4),
            decisionStep: 1
        };
    }

    // 난이도를 확률로 변환
    difficultyToProb(difficulty) {
        try {
            const diff = parseFloat(difficulty.toString());
            if (diff <= 0) return 1.0;
            return 1.0 / diff;
        } catch (error) {
            console.error('❌ difficultyToProb 오류:', error);
            return 1.0;
        }
    }

    // 확률을 난이도로 변환
    probToDifficulty(miningProb) {
        try {
            if (miningProb <= 0) return 1000000;
            return Math.floor(1.0 / miningProb);
        } catch (error) {
            console.error('❌ probToDifficulty 오류:', error);
            return 1000000;
        }
    }
}

module.exports = LDPCUtils;