// lib/ldpc/decoder.js
// LDPC 디코더 (노드 코드의 LDPCDecoder.go 기반)

const crypto = require('crypto');

class LDPCDecoder {
    constructor(utils) {
        this.utils = utils;
    }

    // 최적화된 디코딩 (노드 코드의 OptimizedDecoding 기반)
    optimizedDecoding(parameters, hashVector, H, rowInCol, colInRow) {
        const outputWord = new Array(parameters.n).fill(0);
        const LRqtl = Array(parameters.n).fill(null).map(() => Array(parameters.m).fill(0));
        const LRrtl = Array(parameters.n).fill(null).map(() => Array(parameters.m).fill(0));
        const LRft = new Array(parameters.n);
        const LRpt = new Array(parameters.n);

        // 초기화
        for (let i = 0; i < parameters.n; i++) {
            LRft[i] = Math.log((1 - this.utils.crossErr) / this.utils.crossErr) * (hashVector[i] * 2 - 1);
        }

        // 반복 디코딩
        for (let ind = 1; ind <= this.utils.maxIter; ind++) {
            // Variable node update
            for (let t = 0; t < parameters.n; t++) {
                let temp3 = 0.0;

                for (let mp = 0; mp < parameters.wc; mp++) {
                    if (rowInCol[mp] && rowInCol[mp][t] !== undefined) {
                        temp3 = this.utils.infinityTest(temp3 + LRrtl[t][rowInCol[mp][t]]);
                    }
                }

                for (let m = 0; m < parameters.wc; m++) {
                    if (rowInCol[m] && rowInCol[m][t] !== undefined) {
                        const temp4 = this.utils.infinityTest(temp3 - LRrtl[t][rowInCol[m][t]]);
                        LRqtl[t][rowInCol[m][t]] = this.utils.infinityTest(LRft[t] + temp4);
                    }
                }
            }

            // Check node update
            for (let k = 0; k < parameters.wr; k++) {
                for (let l = 0; l < parameters.wr; l++) {
                    if (colInRow[l] && colInRow[l][k] !== undefined) {
                        let temp3 = 0.0;
                        let sign = 1.0;

                        for (let m = 0; m < parameters.wr; m++) {
                            if (m !== l && colInRow[m] && colInRow[m][k] !== undefined) {
                                const val = LRqtl[colInRow[m][k]][k];
                                temp3 += this.utils.funcF(Math.abs(val));
                                sign *= val > 0.0 ? 1.0 : -1.0;
                            }
                        }

                        const magnitude = this.utils.funcF(temp3);
                        LRrtl[colInRow[l][k]][k] = this.utils.infinityTest(sign * magnitude);
                    }
                }
            }

            // 사후 LLR 계산 및 하드 결정
            for (let t = 0; t < parameters.n; t++) {
                LRpt[t] = this.utils.infinityTest(LRft[t]);
                for (let k = 0; k < parameters.wc; k++) {
                    if (rowInCol[k] && rowInCol[k][t] !== undefined) {
                        LRpt[t] += LRrtl[t][rowInCol[k][t]];
                        LRpt[t] = this.utils.infinityTest(LRpt[t]);
                    }
                }
            }
        }

        // 최종 하드 결정
        for (let t = 0; t < parameters.n; t++) {
            outputWord[t] = LRpt[t] >= 0 ? 1 : 0;
        }

        return { hashVector, outputWord, LRrtl };
    }

    // Seoul 네트워크용 최적화된 디코딩 (노드 코드의 OptimizedDecodingSeoul 기반)
    optimizedDecodingSeoul(parameters, hashVector, H, rowInCol, colInRow) {
        const outputWord = new Array(parameters.n).fill(0);
        const LRqtl = Array(parameters.n).fill(null).map(() => Array(parameters.m).fill(0));
        const LRrtl = Array(parameters.n).fill(null).map(() => Array(parameters.m).fill(0));
        const LRft = new Array(parameters.n);
        const LRpt = new Array(parameters.n);

        // 초기화
        for (let i = 0; i < parameters.n; i++) {
            LRft[i] = Math.log((1 - this.utils.crossErr) / this.utils.crossErr) * (hashVector[i] * 2 - 1);
        }

        // 반복 디코딩
        for (let ind = 1; ind <= this.utils.maxIter; ind++) {
            // Variable node update
            for (let t = 0; t < parameters.n; t++) {
                let temp3 = 0.0;

                for (let mp = 0; mp < parameters.wc; mp++) {
                    if (rowInCol[mp] && rowInCol[mp][t] !== undefined) {
                        temp3 = this.utils.infinityTest(temp3 + LRrtl[t][rowInCol[mp][t]]);
                    }
                }

                for (let m = 0; m < parameters.wc; m++) {
                    if (rowInCol[m] && rowInCol[m][t] !== undefined) {
                        const temp4 = this.utils.infinityTest(temp3 - LRrtl[t][rowInCol[m][t]]);
                        LRqtl[t][rowInCol[m][t]] = this.utils.infinityTest(LRft[t] + temp4);
                    }
                }
            }

            // Check node update (Seoul 버전 - parameters.m 사용)
            for (let k = 0; k < parameters.m; k++) {
                for (let l = 0; l < parameters.wr; l++) {
                    if (colInRow[l] && colInRow[l][k] !== undefined) {
                        let temp3 = 0.0;
                        let sign = 1.0;

                        for (let m = 0; m < parameters.wr; m++) {
                            if (m !== l && colInRow[m] && colInRow[m][k] !== undefined) {
                                const val = LRqtl[colInRow[m][k]][k];
                                temp3 += this.utils.funcF(Math.abs(val));
                                sign *= val > 0.0 ? 1.0 : -1.0;
                            }
                        }

                        const magnitude = this.utils.funcF(temp3);
                        LRrtl[colInRow[l][k]][k] = this.utils.infinityTest(sign * magnitude);
                    }
                }
            }

            // 사후 LLR 계산 및 즉시 하드 결정 (Seoul 버전)
            for (let t = 0; t < parameters.n; t++) {
                LRpt[t] = this.utils.infinityTest(LRft[t]);
                for (let k = 0; k < parameters.wc; k++) {
                    if (rowInCol[k] && rowInCol[k][t] !== undefined) {
                        LRpt[t] += LRrtl[t][rowInCol[k][t]];
                        LRpt[t] = this.utils.infinityTest(LRpt[t]);
                    }
                }

                outputWord[t] = LRpt[t] >= 0 ? 1 : 0;
            }
        }

        return { hashVector, outputWord, LRrtl };
    }

    // 검증용 최적화된 디코딩 (노드 코드의 VerifyOptimizedDecoding 기반)
    verifyOptimizedDecoding(header, hash, difficultyTable) {
        const { parameters } = this.utils.setParameters(header, difficultyTable);
        const H = this.utils.generateH(parameters);
        const { colInRow, rowInCol } = this.utils.generateQ(parameters, H);

        const seed = Buffer.alloc(40);
        seed.fill(hash.slice(0, Math.min(32, hash.length)));
        seed.writeBigUInt64LE(BigInt(header.nonce), 32);
        const digest = crypto.createHash('sha512').update(seed).digest();

        const hashVector = this.utils.generateHv(parameters, digest);
        const { hashVector: hashVectorOfVerification, outputWord: outputWordOfVerification } = 
            this.optimizedDecoding(parameters, hashVector, H, rowInCol, colInRow);

        const { valid } = this.makeDecision(header, colInRow, outputWordOfVerification, difficultyTable);

        return {
            valid,
            hashVector: hashVectorOfVerification,
            outputWord: outputWordOfVerification,
            digest: digest
        };
    }

    // Seoul 네트워크용 검증 디코딩 (노드 코드의 VerifyOptimizedDecodingSeoul 기반)
    verifyOptimizedDecodingSeoul(header, hash) {
        const { parameters } = this.utils.setParametersSeoul(header);
        const H = this.utils.generateH(parameters);
        const { colInRow, rowInCol } = this.utils.generateQ(parameters, H);

        const seed = Buffer.alloc(40);
        seed.fill(hash.slice(0, Math.min(32, hash.length)));
        seed.writeBigUInt64LE(BigInt(header.nonce), 32);
        const digest = crypto.createHash('sha512').update(seed).digest();

        const hashVector = this.utils.generateHv(parameters, digest);
        const { hashVector: hashVectorOfVerification, outputWord: outputWordOfVerification } = 
            this.optimizedDecodingSeoul(parameters, hashVector, H, rowInCol, colInRow);

        const { valid } = this.makeDecisionSeoul(header, colInRow, outputWordOfVerification);

        return {
            valid,
            hashVector: hashVectorOfVerification,
            outputWord: outputWordOfVerification,
            digest: digest
        };
    }

    // 결정 함수 (노드 코드의 MakeDecision 기반)
    makeDecision(header, colInRow, outputWord, difficultyTable) {
        const { parameters, level } = this.utils.setParameters(header, difficultyTable);
        
        // 패리티 체크
        for (let i = 0; i < parameters.m; i++) {
            let sum = 0;
            for (let j = 0; j < parameters.wr; j++) {
                if (colInRow[j] && colInRow[j][i] !== undefined) {
                    sum += outputWord[colInRow[j][i]];
                }
            }
            if (sum % 2 === 1) {
                return { valid: false, weight: -1 };
            }
        }

        // 가중치 계산
        const numOfOnes = outputWord.reduce((sum, val) => sum + val, 0);
        const tableEntry = difficultyTable[level] || difficultyTable[0];

        const isValid = numOfOnes >= tableEntry.decisionFrom &&
                       numOfOnes <= tableEntry.decisionTo &&
                       numOfOnes % tableEntry.decisionStep === 0;

        return { valid: isValid, weight: numOfOnes };
    }

    // Seoul 네트워크용 결정 함수 (노드 코드의 MakeDecision_Seoul 기반)
    makeDecisionSeoul(header, colInRow, outputWord) {
        const { parameters } = this.utils.setParametersSeoul(header);
        
        // 패리티 체크
        for (let i = 0; i < parameters.m; i++) {
            let sum = 0;
            for (let j = 0; j < parameters.wr; j++) {
                if (colInRow[j] && colInRow[j][i] !== undefined) {
                    sum += outputWord[colInRow[j][i]];
                }
            }
            if (sum % 2 === 1) {
                return { valid: false, weight: -1 };
            }
        }

        // 가중치 계산
        const numOfOnes = outputWord.reduce((sum, val) => sum + val, 0);

        // Seoul 네트워크 결정 기준
        const isValid = numOfOnes >= Math.floor(parameters.n / 4) &&
                       numOfOnes <= Math.floor(parameters.n * 3 / 4);

        return { valid: isValid, weight: numOfOnes };
    }

    // 신드롬 체크
    checkSyndrome(codeword, H) {
        for (let i = 0; i < H.length; i++) {
            let sum = 0;
            for (let j = 0; j < H[i].length; j++) {
                sum ^= (H[i][j] & codeword[j]);
            }
            if (sum !== 0) return false;
        }
        return true;
    }
}

module.exports = LDPCDecoder;