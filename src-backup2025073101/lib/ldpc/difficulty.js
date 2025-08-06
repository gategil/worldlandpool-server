// lib/ldpc/difficulty.js
// LDPC 난이도 관리 (노드 코드의 LDPCDifficulty_utils.go 기반)

// 난이도 테이블 (노드 코드의 Table 배열과 동일)
const DifficultyTable = [
    {level: 0, n: 32, wc: 3, wr: 4, decisionFrom: 10, decisionTo: 22, decisionStep: 2, miningProb: 3.077970e-05},
    {level: 1, n: 32, wc: 3, wr: 4, decisionFrom: 10, decisionTo: 22, decisionStep: 2, miningProb: 3.077970e-05},
    {level: 2, n: 32, wc: 3, wr: 4, decisionFrom: 10, decisionTo: 16, decisionStep: 2, miningProb: 2.023220e-05},
    {level: 3, n: 32, wc: 3, wr: 4, decisionFrom: 16, decisionTo: 16, decisionStep: 1, miningProb: 9.684650e-06},
    {level: 4, n: 32, wc: 3, wr: 4, decisionFrom: 14, decisionTo: 14, decisionStep: 1, miningProb: 6.784080e-06},
    {level: 5, n: 36, wc: 3, wr: 4, decisionFrom: 12, decisionTo: 24, decisionStep: 2, miningProb: 4.830240e-06},
    {level: 6, n: 36, wc: 3, wr: 4, decisionFrom: 12, decisionTo: 18, decisionStep: 2, miningProb: 3.125970e-06},
    {level: 7, n: 32, wc: 3, wr: 4, decisionFrom: 12, decisionTo: 12, decisionStep: 1, miningProb: 2.862890e-06},
    {level: 8, n: 44, wc: 3, wr: 4, decisionFrom: 14, decisionTo: 30, decisionStep: 2, miningProb: 1.637790e-06},
    {level: 9, n: 36, wc: 3, wr: 4, decisionFrom: 18, decisionTo: 18, decisionStep: 1, miningProb: 1.421700e-06},
    {level: 10, n: 36, wc: 3, wr: 4, decisionFrom: 16, decisionTo: 16, decisionStep: 1, miningProb: 1.051350e-06},
    {level: 11, n: 44, wc: 3, wr: 4, decisionFrom: 14, decisionTo: 22, decisionStep: 2, miningProb: 1.029740e-06},
    {level: 12, n: 40, wc: 3, wr: 4, decisionFrom: 12, decisionTo: 28, decisionStep: 2, miningProb: 7.570880e-07},
    {level: 13, n: 36, wc: 3, wr: 4, decisionFrom: 14, decisionTo: 14, decisionStep: 1, miningProb: 4.865630e-07},
    {level: 14, n: 40, wc: 3, wr: 4, decisionFrom: 12, decisionTo: 20, decisionStep: 2, miningProb: 4.813320e-07},
    {level: 15, n: 44, wc: 3, wr: 4, decisionFrom: 22, decisionTo: 22, decisionStep: 1, miningProb: 4.216920e-07},
    {level: 16, n: 44, wc: 3, wr: 4, decisionFrom: 20, decisionTo: 20, decisionStep: 1, miningProb: 3.350070e-07},
    {level: 17, n: 48, wc: 3, wr: 4, decisionFrom: 14, decisionTo: 34, decisionStep: 2, miningProb: 2.677070e-07},
    {level: 18, n: 40, wc: 3, wr: 4, decisionFrom: 20, decisionTo: 20, decisionStep: 1, miningProb: 2.055750e-07},
    {level: 19, n: 44, wc: 3, wr: 4, decisionFrom: 18, decisionTo: 18, decisionStep: 1, miningProb: 1.788400e-07},
    {level: 20, n: 48, wc: 3, wr: 4, decisionFrom: 14, decisionTo: 24, decisionStep: 2, miningProb: 1.664080e-07},
    {level: 21, n: 40, wc: 3, wr: 4, decisionFrom: 18, decisionTo: 18, decisionStep: 1, miningProb: 1.583110e-07},
    {level: 22, n: 40, wc: 3, wr: 4, decisionFrom: 16, decisionTo: 16, decisionStep: 1, miningProb: 7.917230e-08},
    {level: 23, n: 44, wc: 3, wr: 4, decisionFrom: 16, decisionTo: 16, decisionStep: 1, miningProb: 7.103820e-08},
    {level: 24, n: 48, wc: 3, wr: 4, decisionFrom: 24, decisionTo: 24, decisionStep: 1, miningProb: 6.510890e-08},
    {level: 25, n: 48, wc: 3, wr: 4, decisionFrom: 22, decisionTo: 22, decisionStep: 1, miningProb: 5.300760e-08},
    {level: 26, n: 52, wc: 3, wr: 4, decisionFrom: 14, decisionTo: 40, decisionStep: 2, miningProb: 4.266600e-08},
    {level: 27, n: 48, wc: 3, wr: 4, decisionFrom: 20, decisionTo: 20, decisionStep: 1, miningProb: 2.990510e-08},
    {level: 28, n: 40, wc: 3, wr: 4, decisionFrom: 14, decisionTo: 14, decisionStep: 1, miningProb: 2.927380e-08},
    {level: 29, n: 52, wc: 3, wr: 4, decisionFrom: 14, decisionTo: 26, decisionStep: 2, miningProb: 2.626790e-08},
    {level: 30, n: 60, wc: 3, wr: 4, decisionFrom: 18, decisionTo: 42, decisionStep: 2, miningProb: 1.485240e-08},
    {level: 31, n: 48, wc: 3, wr: 4, decisionFrom: 18, decisionTo: 18, decisionStep: 1, miningProb: 1.267290e-08},
    {level: 32, n: 52, wc: 3, wr: 4, decisionFrom: 26, decisionTo: 26, decisionStep: 1, miningProb: 9.891110e-09},
    {level: 33, n: 60, wc: 3, wr: 4, decisionFrom: 18, decisionTo: 30, decisionStep: 2, miningProb: 9.019200e-09},
    {level: 34, n: 48, wc: 3, wr: 4, decisionFrom: 16, decisionTo: 32, decisionStep: 1, miningProb: 8.762650e-09},
    {level: 35, n: 52, wc: 3, wr: 4, decisionFrom: 24, decisionTo: 24, decisionStep: 1, miningProb: 8.213140e-09},
    {level: 36, n: 56, wc: 3, wr: 4, decisionFrom: 16, decisionTo: 42, decisionStep: 2, miningProb: 6.658250e-09},
    {level: 37, n: 52, wc: 3, wr: 4, decisionFrom: 22, decisionTo: 22, decisionStep: 1, miningProb: 4.856960e-09},
    {level: 38, n: 48, wc: 3, wr: 4, decisionFrom: 16, decisionTo: 16, decisionStep: 1, miningProb: 4.381330e-09},
    {level: 39, n: 56, wc: 3, wr: 4, decisionFrom: 16, decisionTo: 28, decisionStep: 2, miningProb: 4.068000e-09},
    {level: 40, n: 60, wc: 3, wr: 4, decisionFrom: 30, decisionTo: 30, decisionStep: 1, miningProb: 3.186040e-09},
    {level: 41, n: 60, wc: 3, wr: 4, decisionFrom: 28, decisionTo: 28, decisionStep: 1, miningProb: 2.725470e-09},
    {level: 42, n: 64, wc: 3, wr: 4, decisionFrom: 18, decisionTo: 46, decisionStep: 2, miningProb: 2.410890e-09},
    {level: 43, n: 52, wc: 3, wr: 4, decisionFrom: 20, decisionTo: 20, decisionStep: 1, miningProb: 2.181360e-09},
    {level: 44, n: 60, wc: 3, wr: 4, decisionFrom: 26, decisionTo: 26, decisionStep: 1, miningProb: 1.737940e-09},
    {level: 45, n: 52, wc: 3, wr: 4, decisionFrom: 18, decisionTo: 34, decisionStep: 1, miningProb: 1.595330e-09},
    {level: 46, n: 56, wc: 3, wr: 4, decisionFrom: 28, decisionTo: 28, decisionStep: 1, miningProb: 1.481830e-09},
    {level: 47, n: 64, wc: 3, wr: 4, decisionFrom: 18, decisionTo: 32, decisionStep: 2, miningProb: 1.454780e-09},
    {level: 48, n: 56, wc: 3, wr: 4, decisionFrom: 26, decisionTo: 26, decisionStep: 1, miningProb: 1.250550e-09},
    {level: 49, n: 60, wc: 3, wr: 4, decisionFrom: 24, decisionTo: 24, decisionStep: 1, miningProb: 8.614860e-10},
    {level: 50, n: 52, wc: 3, wr: 4, decisionFrom: 18, decisionTo: 18, decisionStep: 1, miningProb: 7.976650e-10},
    {level: 51, n: 56, wc: 3, wr: 4, decisionFrom: 24, decisionTo: 24, decisionStep: 1, miningProb: 7.700380e-10},
    {level: 52, n: 60, wc: 3, wr: 4, decisionFrom: 22, decisionTo: 38, decisionStep: 1, miningProb: 6.978800e-10},
    {level: 53, n: 52, wc: 3, wr: 4, decisionFrom: 16, decisionTo: 36, decisionStep: 1, miningProb: 5.069080e-10},
    {level: 54, n: 64, wc: 3, wr: 4, decisionFrom: 32, decisionTo: 32, decisionStep: 1, miningProb: 4.986660e-10},
    {level: 55, n: 64, wc: 3, wr: 4, decisionFrom: 30, decisionTo: 30, decisionStep: 1, miningProb: 4.315180e-10},
    {level: 56, n: 68, wc: 3, wr: 4, decisionFrom: 18, decisionTo: 50, decisionStep: 2, miningProb: 3.848530e-10},
    {level: 57, n: 56, wc: 3, wr: 4, decisionFrom: 22, decisionTo: 22, decisionStep: 1, miningProb: 3.643130e-10},
    {level: 58, n: 60, wc: 3, wr: 4, decisionFrom: 22, decisionTo: 22, decisionStep: 1, miningProb: 3.489400e-10},
    {level: 59, n: 64, wc: 3, wr: 4, decisionFrom: 28, decisionTo: 28, decisionStep: 1, miningProb: 2.836780e-10},
    {level: 60, n: 56, wc: 3, wr: 4, decisionFrom: 20, decisionTo: 36, decisionStep: 1, miningProb: 2.809120e-10},
    {level: 61, n: 52, wc: 3, wr: 4, decisionFrom: 16, decisionTo: 16, decisionStep: 1, miningProb: 2.534540e-10},
    {level: 62, n: 60, wc: 3, wr: 4, decisionFrom: 20, decisionTo: 40, decisionStep: 1, miningProb: 2.427110e-10},
    {level: 63, n: 68, wc: 3, wr: 4, decisionFrom: 18, decisionTo: 34, decisionStep: 2, miningProb: 2.309280e-10},
    {level: 64, n: 64, wc: 3, wr: 4, decisionFrom: 26, decisionTo: 26, decisionStep: 1, miningProb: 1.466250e-10},
    {level: 65, n: 56, wc: 3, wr: 4, decisionFrom: 20, decisionTo: 20, decisionStep: 1, miningProb: 1.404560e-10},
    {level: 66, n: 76, wc: 3, wr: 4, decisionFrom: 22, decisionTo: 54, decisionStep: 2, miningProb: 1.375500e-10},
    {level: 67, n: 60, wc: 3, wr: 4, decisionFrom: 20, decisionTo: 20, decisionStep: 1, miningProb: 1.213550e-10},
    {level: 68, n: 56, wc: 3, wr: 4, decisionFrom: 18, decisionTo: 38, decisionStep: 1, miningProb: 9.340240e-11},
    {level: 69, n: 76, wc: 3, wr: 4, decisionFrom: 22, decisionTo: 38, decisionStep: 2, miningProb: 8.174200e-11},
    {level: 70, n: 68, wc: 3, wr: 4, decisionFrom: 34, decisionTo: 34, decisionStep: 1, miningProb: 7.700290e-11},
    {level: 71, n: 68, wc: 3, wr: 4, decisionFrom: 32, decisionTo: 32, decisionStep: 1, miningProb: 6.729690e-11},
    {level: 72, n: 64, wc: 3, wr: 4, decisionFrom: 24, decisionTo: 24, decisionStep: 1, miningProb: 6.217280e-11},
    {level: 73, n: 72, wc: 3, wr: 4, decisionFrom: 18, decisionTo: 56, decisionStep: 2, miningProb: 6.056200e-11},
    {level: 74, n: 56, wc: 3, wr: 4, decisionFrom: 18, decisionTo: 18, decisionStep: 1, miningProb: 4.670120e-11},
    {level: 75, n: 68, wc: 3, wr: 4, decisionFrom: 30, decisionTo: 30, decisionStep: 1, miningProb: 4.543980e-11},
    {level: 76, n: 64, wc: 3, wr: 4, decisionFrom: 22, decisionTo: 42, decisionStep: 1, miningProb: 4.517330e-11},
    {level: 77, n: 72, wc: 3, wr: 4, decisionFrom: 18, decisionTo: 36, decisionStep: 2, miningProb: 3.615450e-11},
    {level: 78, n: 76, wc: 3, wr: 4, decisionFrom: 38, decisionTo: 38, decisionStep: 1, miningProb: 2.593400e-11},
    {level: 79, n: 68, wc: 3, wr: 4, decisionFrom: 28, decisionTo: 28, decisionStep: 1, miningProb: 2.438720e-11},
    {level: 80, n: 76, wc: 3, wr: 4, decisionFrom: 36, decisionTo: 36, decisionStep: 1, miningProb: 2.303460e-11},
    {level: 81, n: 64, wc: 3, wr: 4, decisionFrom: 22, decisionTo: 22, decisionStep: 1, miningProb: 2.258660e-11},
    {level: 82, n: 80, wc: 3, wr: 4, decisionFrom: 22, decisionTo: 58, decisionStep: 2, miningProb: 2.229400e-11},
    {level: 83, n: 76, wc: 3, wr: 4, decisionFrom: 34, decisionTo: 34, decisionStep: 1, miningProb: 1.626350e-11},
    {level: 84, n: 64, wc: 3, wr: 4, decisionFrom: 20, decisionTo: 40, decisionStep: 1, miningProb: 1.465310e-11},
    {level: 85, n: 80, wc: 3, wr: 4, decisionFrom: 22, decisionTo: 40, decisionStep: 2, miningProb: 1.319160e-11},
    {level: 86, n: 72, wc: 3, wr: 4, decisionFrom: 36, decisionTo: 36, decisionStep: 1, miningProb: 1.174900e-11},
    {level: 87, n: 68, wc: 3, wr: 4, decisionFrom: 26, decisionTo: 26, decisionStep: 1, miningProb: 1.078820e-11},
    {level: 88, n: 72, wc: 3, wr: 4, decisionFrom: 34, decisionTo: 34, decisionStep: 1, miningProb: 1.035690e-11},
    {level: 89, n: 76, wc: 3, wr: 4, decisionFrom: 32, decisionTo: 32, decisionStep: 1, miningProb: 9.311370e-12},
    {level: 90, n: 68, wc: 3, wr: 4, decisionFrom: 24, decisionTo: 44, decisionStep: 1, miningProb: 8.173020e-12},
    {level: 91, n: 64, wc: 3, wr: 4, decisionFrom: 20, decisionTo: 20, decisionStep: 1, miningProb: 7.326570e-12},
    {level: 92, n: 72, wc: 3, wr: 4, decisionFrom: 32, decisionTo: 32, decisionStep: 1, miningProb: 7.160350e-12},
    {level: 93, n: 76, wc: 3, wr: 4, decisionFrom: 30, decisionTo: 30, decisionStep: 1, miningProb: 4.440960e-12},
    {level: 94, n: 80, wc: 3, wr: 4, decisionFrom: 40, decisionTo: 40, decisionStep: 1, miningProb: 4.089220e-12},
    {level: 95, n: 68, wc: 3, wr: 4, decisionFrom: 24, decisionTo: 24, decisionStep: 1, miningProb: 4.086510e-12},
    {level: 96, n: 72, wc: 3, wr: 4, decisionFrom: 30, decisionTo: 30, decisionStep: 1, miningProb: 3.975570e-12},
    {level: 97, n: 80, wc: 3, wr: 4, decisionFrom: 38, decisionTo: 38, decisionStep: 1, miningProb: 3.656430e-12},
    {level: 98, n: 76, wc: 3, wr: 4, decisionFrom: 28, decisionTo: 48, decisionStep: 1, miningProb: 3.634830e-12},
    {level: 99, n: 84, wc: 3, wr: 4, decisionFrom: 22, decisionTo: 62, decisionStep: 2, miningProb: 3.566880e-12},
    {level: 100, n: 68, wc: 3, wr: 4, decisionFrom: 22, decisionTo: 46, decisionStep: 1, miningProb: 2.750600e-12},
    {level: 101, n: 80, wc: 3, wr: 4, decisionFrom: 36, decisionTo: 36, decisionStep: 1, miningProb: 2.630600e-12},
    {level: 102, n: 84, wc: 3, wr: 4, decisionFrom: 22, decisionTo: 42, decisionStep: 2, miningProb: 2.102180e-12},
    {level: 103, n: 72, wc: 3, wr: 4, decisionFrom: 28, decisionTo: 28, decisionStep: 1, miningProb: 1.828850e-12},
    {level: 104, n: 76, wc: 3, wr: 4, decisionFrom: 28, decisionTo: 28, decisionStep: 1, miningProb: 1.817420e-12},
    {level: 105, n: 80, wc: 3, wr: 4, decisionFrom: 34, decisionTo: 34, decisionStep: 1, miningProb: 1.548670e-12},
    {level: 106, n: 72, wc: 3, wr: 4, decisionFrom: 26, decisionTo: 46, decisionStep: 1, miningProb: 1.441670e-12},
    {level: 107, n: 68, wc: 3, wr: 4, decisionFrom: 22, decisionTo: 22, decisionStep: 1, miningProb: 1.375300e-12},
    {level: 108, n: 76, wc: 3, wr: 4, decisionFrom: 26, decisionTo: 50, decisionStep: 1, miningProb: 1.314800e-12},
    {level: 109, n: 92, wc: 3, wr: 4, decisionFrom: 24, decisionTo: 68, decisionStep: 2, miningProb: 1.296220e-12},
    {level: 110, n: 68, wc: 3, wr: 4, decisionFrom: 20, decisionTo: 48, decisionStep: 1, miningProb: 8.516070e-13},
    {level: 111, n: 80, wc: 3, wr: 4, decisionFrom: 32, decisionTo: 32, decisionStep: 1, miningProb: 7.636740e-13},
    {level: 112, n: 92, wc: 3, wr: 4, decisionFrom: 24, decisionTo: 46, decisionStep: 2, miningProb: 7.585130e-13},
    {level: 113, n: 72, wc: 3, wr: 4, decisionFrom: 26, decisionTo: 26, decisionStep: 1, miningProb: 7.208340e-13},
    {level: 114, n: 76, wc: 3, wr: 4, decisionFrom: 26, decisionTo: 26, decisionStep: 1, miningProb: 6.573980e-13},
    {level: 115, n: 80, wc: 3, wr: 4, decisionFrom: 30, decisionTo: 50, decisionStep: 1, miningProb: 6.475910e-13},
    {level: 116, n: 84, wc: 3, wr: 4, decisionFrom: 42, decisionTo: 42, decisionStep: 1, miningProb: 6.374900e-13},
    {level: 117, n: 84, wc: 3, wr: 4, decisionFrom: 40, decisionTo: 40, decisionStep: 1, miningProb: 5.734350e-13},
    {level: 118, n: 88, wc: 3, wr: 4, decisionFrom: 22, decisionTo: 66, decisionStep: 2, miningProb: 5.640630e-13},
    {level: 119, n: 72, wc: 3, wr: 4, decisionFrom: 24, decisionTo: 48, decisionStep: 1, miningProb: 5.032200e-13},
    {level: 120, n: 76, wc: 3, wr: 4, decisionFrom: 24, decisionTo: 52, decisionStep: 1, miningProb: 4.325430e-13},
    {level: 121, n: 68, wc: 3, wr: 4, decisionFrom: 20, decisionTo: 20, decisionStep: 1, miningProb: 4.258030e-13},
    {level: 122, n: 84, wc: 3, wr: 4, decisionFrom: 38, decisionTo: 38, decisionStep: 1, miningProb: 4.195890e-13},
    {level: 123, n: 88, wc: 3, wr: 4, decisionFrom: 22, decisionTo: 44, decisionStep: 2, miningProb: 3.312130e-13},
    {level: 124, n: 80, wc: 3, wr: 4, decisionFrom: 30, decisionTo: 30, decisionStep: 1, miningProb: 3.237950e-13},
    {level: 125, n: 84, wc: 3, wr: 4, decisionFrom: 36, decisionTo: 36, decisionStep: 1, miningProb: 2.533670e-13},
    {level: 126, n: 72, wc: 3, wr: 4, decisionFrom: 24, decisionTo: 24, decisionStep: 1, miningProb: 2.516100e-13},
    {level: 127, n: 80, wc: 3, wr: 4, decisionFrom: 28, decisionTo: 52, decisionStep: 1, miningProb: 2.424700e-13},
    {level: 128, n: 92, wc: 3, wr: 4, decisionFrom: 46, decisionTo: 46, decisionStep: 1, miningProb: 2.208090e-13},
    {level: 129, n: 76, wc: 3, wr: 4, decisionFrom: 24, decisionTo: 24, decisionStep: 1, miningProb: 2.162710e-13},
    {level: 130, n: 96, wc: 3, wr: 4, decisionFrom: 26, decisionTo: 72, decisionStep: 2, miningProb: 2.099840e-13},
    {level: 131, n: 92, wc: 3, wr: 4, decisionFrom: 44, decisionTo: 44, decisionStep: 1, miningProb: 2.006580e-13},
    {level: 132, n: 72, wc: 3, wr: 4, decisionFrom: 22, decisionTo: 50, decisionStep: 1, miningProb: 1.605310e-13},
    {level: 133, n: 92, wc: 3, wr: 4, decisionFrom: 42, decisionTo: 42, decisionStep: 1, miningProb: 1.511670e-13},
    {level: 134, n: 84, wc: 3, wr: 4, decisionFrom: 34, decisionTo: 34, decisionStep: 1, miningProb: 1.288510e-13},
    {level: 135, n: 96, wc: 3, wr: 4, decisionFrom: 26, decisionTo: 48, decisionStep: 2, miningProb: 1.224810e-13},
    {level: 136, n: 80, wc: 3, wr: 4, decisionFrom: 28, decisionTo: 28, decisionStep: 1, miningProb: 1.212350e-13},
    {level: 137, n: 88, wc: 3, wr: 4, decisionFrom: 44, decisionTo: 44, decisionStep: 1, miningProb: 9.836240e-14},
    {level: 138, n: 92, wc: 3, wr: 4, decisionFrom: 40, decisionTo: 40, decisionStep: 1, miningProb: 9.542830e-14},
    {level: 139, n: 88, wc: 3, wr: 4, decisionFrom: 42, decisionTo: 42, decisionStep: 1, miningProb: 8.895450e-14},
    {level: 140, n: 80, wc: 3, wr: 4, decisionFrom: 26, decisionTo: 54, decisionStep: 1, miningProb: 8.227740e-14},
    {level: 141, n: 72, wc: 3, wr: 4, decisionFrom: 22, decisionTo: 22, decisionStep: 1, miningProb: 8.026550e-14},
    {level: 142, n: 88, wc: 3, wr: 4, decisionFrom: 40, decisionTo: 40, decisionStep: 1, miningProb: 6.609120e-14},
    {level: 143, n: 84, wc: 3, wr: 4, decisionFrom: 32, decisionTo: 32, decisionStep: 1, miningProb: 5.648410e-14},
    {level: 144, n: 92, wc: 3, wr: 4, decisionFrom: 38, decisionTo: 38, decisionStep: 1, miningProb: 5.127400e-14},
    {level: 145, n: 72, wc: 3, wr: 4, decisionFrom: 20, decisionTo: 52, decisionStep: 1, miningProb: 4.822030e-14},
    {level: 146, n: 84, wc: 3, wr: 4, decisionFrom: 30, decisionTo: 54, decisionStep: 1, miningProb: 4.372420e-14},
    {level: 147, n: 80, wc: 3, wr: 4, decisionFrom: 26, decisionTo: 26, decisionStep: 1, miningProb: 4.113870e-14},
    {level: 148, n: 88, wc: 3, wr: 4, decisionFrom: 38, decisionTo: 38, decisionStep: 1, miningProb: 4.084490e-14},
    {level: 149, n: 96, wc: 3, wr: 4, decisionFrom: 48, decisionTo: 48, decisionStep: 1, miningProb: 3.497970e-14},
    {level: 150, n: 100, wc: 3, wr: 4, decisionFrom: 26, decisionTo: 76, decisionStep: 2, miningProb: 3.365420e-14},
    {level: 151, n: 96, wc: 3, wr: 4, decisionFrom: 46, decisionTo: 46, decisionStep: 1, miningProb: 3.192740e-14},
    {level: 152, n: 80, wc: 3, wr: 4, decisionFrom: 24, decisionTo: 56, decisionStep: 1, miningProb: 2.593890e-14},
    {level: 153, n: 96, wc: 3, wr: 4, decisionFrom: 44, decisionTo: 44, decisionStep: 1, miningProb: 2.435890e-14},
    {level: 154, n: 72, wc: 3, wr: 4, decisionFrom: 20, decisionTo: 20, decisionStep: 1, miningProb: 2.411020e-14},
    {level: 155, n: 92, wc: 3, wr: 4, decisionFrom: 36, decisionTo: 36, decisionStep: 1, miningProb: 2.388460e-14},
    {level: 156, n: 84, wc: 3, wr: 4, decisionFrom: 30, decisionTo: 30, decisionStep: 1, miningProb: 2.186210e-14},
    {level: 157, n: 88, wc: 3, wr: 4, decisionFrom: 36, decisionTo: 36, decisionStep: 1, miningProb: 2.137330e-14},
    {level: 158, n: 92, wc: 3, wr: 4, decisionFrom: 34, decisionTo: 58, decisionStep: 1, miningProb: 1.967320e-14},
    {level: 159, n: 100, wc: 3, wr: 4, decisionFrom: 26, decisionTo: 50, decisionStep: 2, miningProb: 1.957080e-14},
    {level: 160, n: 96, wc: 3, wr: 4, decisionFrom: 42, decisionTo: 42, decisionStep: 1, miningProb: 1.568040e-14},
    {level: 161, n: 84, wc: 3, wr: 4, decisionFrom: 28, decisionTo: 56, decisionStep: 1, miningProb: 1.529960e-14},
    {level: 162, n: 80, wc: 3, wr: 4, decisionFrom: 24, decisionTo: 24, decisionStep: 1, miningProb: 1.296950e-14},
    {level: 163, n: 108, wc: 3, wr: 4, decisionFrom: 28, decisionTo: 82, decisionStep: 2, miningProb: 1.237200e-14},
    {level: 164, n: 92, wc: 3, wr: 4, decisionFrom: 34, decisionTo: 34, decisionStep: 1, miningProb: 9.836600e-15},
    {level: 165, n: 88, wc: 3, wr: 4, decisionFrom: 34, decisionTo: 34, decisionStep: 1, miningProb: 9.667440e-15},
    {level: 166, n: 96, wc: 3, wr: 4, decisionFrom: 40, decisionTo: 40, decisionStep: 1, miningProb: 8.634600e-15},
    {level: 167, n: 88, wc: 3, wr: 4, decisionFrom: 32, decisionTo: 56, decisionStep: 1, miningProb: 7.725050e-15},
    {level: 168, n: 84, wc: 3, wr: 4, decisionFrom: 28, decisionTo: 28, decisionStep: 1, miningProb: 7.649800e-15},
    {level: 169, n: 92, wc: 3, wr: 4, decisionFrom: 32, decisionTo: 60, decisionStep: 1, miningProb: 7.305750e-15},
    {level: 170, n: 108, wc: 3, wr: 4, decisionFrom: 28, decisionTo: 54, decisionStep: 2, miningProb: 7.154920e-15},
    {level: 171, n: 100, wc: 3, wr: 4, decisionFrom: 50, decisionTo: 50, decisionStep: 1, miningProb: 5.487490e-15},
    {level: 172, n: 104, wc: 3, wr: 4, decisionFrom: 26, decisionTo: 78, decisionStep: 2, miningProb: 5.340690e-15},
    {level: 173, n: 100, wc: 3, wr: 4, decisionFrom: 48, decisionTo: 48, decisionStep: 1, miningProb: 5.028760e-15},
    {level: 174, n: 84, wc: 3, wr: 4, decisionFrom: 26, decisionTo: 58, decisionStep: 1, miningProb: 4.951260e-15},
    {level: 175, n: 96, wc: 3, wr: 4, decisionFrom: 38, decisionTo: 38, decisionStep: 1, miningProb: 4.134930e-15},
    {level: 176, n: 100, wc: 3, wr: 4, decisionFrom: 46, decisionTo: 46, decisionStep: 1, miningProb: 3.881360e-15},
    {level: 177, n: 88, wc: 3, wr: 4, decisionFrom: 32, decisionTo: 32, decisionStep: 1, miningProb: 3.862530e-15},
    {level: 178, n: 92, wc: 3, wr: 4, decisionFrom: 32, decisionTo: 32, decisionStep: 1, miningProb: 3.652870e-15},
    {level: 179, n: 96, wc: 3, wr: 4, decisionFrom: 36, decisionTo: 60, decisionStep: 1, miningProb: 3.505650e-15},
    {level: 180, n: 104, wc: 3, wr: 4, decisionFrom: 26, decisionTo: 52, decisionStep: 2, miningProb: 3.096920e-15},
    {level: 181, n: 88, wc: 3, wr: 4, decisionFrom: 30, decisionTo: 58, decisionStep: 1, miningProb: 2.785770e-15},
    {level: 182, n: 100, wc: 3, wr: 4, decisionFrom: 44, decisionTo: 44, decisionStep: 1, miningProb: 2.543880e-15},
    {level: 183, n: 92, wc: 3, wr: 4, decisionFrom: 30, decisionTo: 62, decisionStep: 1, miningProb: 2.493880e-15},
    {level: 184, n: 84, wc: 3, wr: 4, decisionFrom: 26, decisionTo: 26, decisionStep: 1, miningProb: 2.475630e-15},
    {level: 185, n: 112, wc: 3, wr: 4, decisionFrom: 28, decisionTo: 86, decisionStep: 2, miningProb: 2.003890e-15},
    {level: 186, n: 108, wc: 3, wr: 4, decisionFrom: 54, decisionTo: 54, decisionStep: 1, miningProb: 1.937830e-15},
    {level: 187, n: 108, wc: 3, wr: 4, decisionFrom: 52, decisionTo: 52, decisionStep: 1, miningProb: 1.788370e-15},
    {level: 188, n: 96, wc: 3, wr: 4, decisionFrom: 36, decisionTo: 36, decisionStep: 1, miningProb: 1.752820e-15},
    {level: 189, n: 84, wc: 3, wr: 4, decisionFrom: 24, decisionTo: 60, decisionStep: 1, miningProb: 1.514630e-15},
    {level: 190, n: 100, wc: 3, wr: 4, decisionFrom: 42, decisionTo: 42, decisionStep: 1, miningProb: 1.433180e-15},
    {level: 191, n: 108, wc: 3, wr: 4, decisionFrom: 50, decisionTo: 50, decisionStep: 1, miningProb: 1.408830e-15},
    {level: 192, n: 88, wc: 3, wr: 4, decisionFrom: 30, decisionTo: 30, decisionStep: 1, miningProb: 1.392880e-15},
    {level: 193, n: 96, wc: 3, wr: 4, decisionFrom: 34, decisionTo: 62, decisionStep: 1, miningProb: 1.339400e-15},
    {level: 194, n: 92, wc: 3, wr: 4, decisionFrom: 30, decisionTo: 30, decisionStep: 1, miningProb: 1.246940e-15},
    {level: 195, n: 112, wc: 3, wr: 4, decisionFrom: 28, decisionTo: 56, decisionStep: 2, miningProb: 1.155930e-15},
    {level: 196, n: 108, wc: 3, wr: 4, decisionFrom: 48, decisionTo: 48, decisionStep: 1, miningProb: 9.534230e-16},
    {level: 197, n: 88, wc: 3, wr: 4, decisionFrom: 28, decisionTo: 60, decisionStep: 1, miningProb: 9.258750e-16},
    {level: 198, n: 104, wc: 3, wr: 4, decisionFrom: 52, decisionTo: 52, decisionStep: 1, miningProb: 8.531480e-16},
    {level: 199, n: 92, wc: 3, wr: 4, decisionFrom: 28, decisionTo: 64, decisionStep: 1, miningProb: 7.972240e-16},
    {level: 200, n: 104, wc: 3, wr: 4, decisionFrom: 50, decisionTo: 50, decisionStep: 1, miningProb: 7.847010e-16},
    {level: 201, n: 84, wc: 3, wr: 4, decisionFrom: 24, decisionTo: 24, decisionStep: 1, miningProb: 7.573130e-16},
    {level: 202, n: 100, wc: 3, wr: 4, decisionFrom: 40, decisionTo: 40, decisionStep: 1, miningProb: 7.043820e-16},
    {level: 203, n: 96, wc: 3, wr: 4, decisionFrom: 34, decisionTo: 34, decisionStep: 1, miningProb: 6.696990e-16},
    {level: 204, n: 100, wc: 3, wr: 4, decisionFrom: 38, decisionTo: 62, decisionStep: 1, miningProb: 6.138180e-16},
    {level: 205, n: 104, wc: 3, wr: 4, decisionFrom: 48, decisionTo: 48, decisionStep: 1, miningProb: 6.121340e-16},
    {level: 206, n: 108, wc: 3, wr: 4, decisionFrom: 46, decisionTo: 46, decisionStep: 1, miningProb: 5.596910e-16},
    {level: 207, n: 96, wc: 3, wr: 4, decisionFrom: 32, decisionTo: 64, decisionStep: 1, miningProb: 4.694950e-16},
    {level: 208, n: 88, wc: 3, wr: 4, decisionFrom: 28, decisionTo: 28, decisionStep: 1, miningProb: 4.629380e-16},
    {level: 209, n: 104, wc: 3, wr: 4, decisionFrom: 46, decisionTo: 46, decisionStep: 1, miningProb: 4.079260e-16},
    {level: 210, n: 92, wc: 3, wr: 4, decisionFrom: 28, decisionTo: 28, decisionStep: 1, miningProb: 3.986120e-16},
    {level: 211, n: 116, wc: 3, wr: 4, decisionFrom: 30, decisionTo: 86, decisionStep: 2, miningProb: 3.215820e-16},
    {level: 212, n: 112, wc: 3, wr: 4, decisionFrom: 56, decisionTo: 56, decisionStep: 1, miningProb: 3.079780e-16},
    {level: 213, n: 100, wc: 3, wr: 4, decisionFrom: 38, decisionTo: 38, decisionStep: 1, miningProb: 3.069090e-16},
    {level: 214, n: 88, wc: 3, wr: 4, decisionFrom: 26, decisionTo: 62, decisionStep: 1, miningProb: 2.893730e-16},
    {level: 215, n: 108, wc: 3, wr: 4, decisionFrom: 44, decisionTo: 44, decisionStep: 1, miningProb: 2.884350e-16},
    {level: 216, n: 112, wc: 3, wr: 4, decisionFrom: 54, decisionTo: 54, decisionStep: 1, miningProb: 2.851100e-16},
    {level: 217, n: 92, wc: 3, wr: 4, decisionFrom: 26, decisionTo: 66, decisionStep: 1, miningProb: 2.429760e-16},
    {level: 218, n: 100, wc: 3, wr: 4, decisionFrom: 36, decisionTo: 64, decisionStep: 1, miningProb: 2.410500e-16},
    {level: 219, n: 104, wc: 3, wr: 4, decisionFrom: 44, decisionTo: 44, decisionStep: 1, miningProb: 2.347600e-16},
    {level: 220, n: 96, wc: 3, wr: 4, decisionFrom: 32, decisionTo: 32, decisionStep: 1, miningProb: 2.347480e-16},
    {level: 221, n: 112, wc: 3, wr: 4, decisionFrom: 52, decisionTo: 52, decisionStep: 1, miningProb: 2.266460e-16},
    {level: 222, n: 116, wc: 3, wr: 4, decisionFrom: 30, decisionTo: 58, decisionStep: 2, miningProb: 1.850560e-16},
    {level: 223, n: 112, wc: 3, wr: 4, decisionFrom: 50, decisionTo: 50, decisionStep: 1, miningProb: 1.555940e-16},
    {level: 224, n: 96, wc: 3, wr: 4, decisionFrom: 30, decisionTo: 66, decisionStep: 1, miningProb: 1.536060e-16},
    {level: 225, n: 88, wc: 3, wr: 4, decisionFrom: 26, decisionTo: 26, decisionStep: 1, miningProb: 1.446860e-16},
    {level: 226, n: 108, wc: 3, wr: 4, decisionFrom: 42, decisionTo: 42, decisionStep: 1, miningProb: 1.322410e-16},
    {level: 227, n: 92, wc: 3, wr: 4, decisionFrom: 26, decisionTo: 26, decisionStep: 1, miningProb: 1.214880e-16},
    {level: 228, n: 100, wc: 3, wr: 4, decisionFrom: 36, decisionTo: 36, decisionStep: 1, miningProb: 1.205250e-16},
    {level: 229, n: 124, wc: 3, wr: 4, decisionFrom: 32, decisionTo: 94, decisionStep: 2, miningProb: 1.192380e-16},
    {level: 230, n: 104, wc: 3, wr: 4, decisionFrom: 42, decisionTo: 42, decisionStep: 1, miningProb: 1.182330e-16},
    {level: 231, n: 108, wc: 3, wr: 4, decisionFrom: 40, decisionTo: 68, decisionStep: 1, miningProb: 1.093900e-16},
    {level: 232, n: 112, wc: 3, wr: 4, decisionFrom: 48, decisionTo: 48, decisionStep: 1, miningProb: 9.304980e-17},
    {level: 233, n: 100, wc: 3, wr: 4, decisionFrom: 34, decisionTo: 66, decisionStep: 1, miningProb: 8.672750e-17},
    {level: 234, n: 88, wc: 3, wr: 4, decisionFrom: 24, decisionTo: 64, decisionStep: 1, miningProb: 8.671340e-17},
    {level: 235, n: 96, wc: 3, wr: 4, decisionFrom: 30, decisionTo: 30, decisionStep: 1, miningProb: 7.680300e-17},
    {level: 236, n: 124, wc: 3, wr: 4, decisionFrom: 32, decisionTo: 62, decisionStep: 2, miningProb: 6.831000e-17},
    {level: 237, n: 108, wc: 3, wr: 4, decisionFrom: 40, decisionTo: 40, decisionStep: 1, miningProb: 5.469510e-17},
    {level: 238, n: 104, wc: 3, wr: 4, decisionFrom: 40, decisionTo: 40, decisionStep: 1, miningProb: 5.287900e-17},
    {level: 239, n: 120, wc: 3, wr: 4, decisionFrom: 30, decisionTo: 90, decisionStep: 2, miningProb: 5.116510e-17},
    {level: 240, n: 112, wc: 3, wr: 4, decisionFrom: 46, decisionTo: 46, decisionStep: 1, miningProb: 4.900210e-17},
    {level: 241, n: 116, wc: 3, wr: 4, decisionFrom: 58, decisionTo: 58, decisionStep: 1, miningProb: 4.853020e-17},
    {level: 242, n: 96, wc: 3, wr: 4, decisionFrom: 28, decisionTo: 68, decisionStep: 1, miningProb: 4.769400e-17},
    {level: 243, n: 116, wc: 3, wr: 4, decisionFrom: 56, decisionTo: 56, decisionStep: 1, miningProb: 4.505610e-17},
    {level: 244, n: 100, wc: 3, wr: 4, decisionFrom: 34, decisionTo: 34, decisionStep: 1, miningProb: 4.336370e-17},
    {level: 245, n: 88, wc: 3, wr: 4, decisionFrom: 24, decisionTo: 24, decisionStep: 1, miningProb: 4.335670e-17},
    {level: 246, n: 104, wc: 3, wr: 4, decisionFrom: 38, decisionTo: 66, decisionStep: 1, miningProb: 4.264440e-17},
    {level: 247, n: 108, wc: 3, wr: 4, decisionFrom: 38, decisionTo: 70, decisionStep: 1, miningProb: 4.139190e-17},
    {level: 248, n: 116, wc: 3, wr: 4, decisionFrom: 54, decisionTo: 54, decisionStep: 1, miningProb: 3.611940e-17},
    {level: 249, n: 120, wc: 3, wr: 4, decisionFrom: 30, decisionTo: 60, decisionStep: 2, miningProb: 2.937590e-17},
    {level: 250, n: 100, wc: 3, wr: 4, decisionFrom: 32, decisionTo: 68, decisionStep: 1, miningProb: 2.904870e-17},
    {level: 251, n: 116, wc: 3, wr: 4, decisionFrom: 52, decisionTo: 52, decisionStep: 1, miningProb: 2.512890e-17},
    {level: 252, n: 96, wc: 3, wr: 4, decisionFrom: 28, decisionTo: 28, decisionStep: 1, miningProb: 2.384700e-17},
    {level: 253, n: 112, wc: 3, wr: 4, decisionFrom: 44, decisionTo: 44, decisionStep: 1, miningProb: 2.300220e-17},
    {level: 254, n: 104, wc: 3, wr: 4, decisionFrom: 38, decisionTo: 38, decisionStep: 1, miningProb: 2.132220e-17},
    {level: 255, n: 108, wc: 3, wr: 4, decisionFrom: 38, decisionTo: 38, decisionStep: 1, miningProb: 2.069600e-17},
    {level: 256, n: 112, wc: 3, wr: 4, decisionFrom: 42, decisionTo: 70, decisionStep: 1, miningProb: 1.949710e-17},
    {level: 257, n: 128, wc: 3, wr: 4, decisionFrom: 32, decisionTo: 98, decisionStep: 2, miningProb: 1.931040e-17},
    {level: 258, n: 124, wc: 3, wr: 4, decisionFrom: 62, decisionTo: 62, decisionStep: 1, miningProb: 1.738220e-17},
    {level: 259, n: 124, wc: 3, wr: 4, decisionFrom: 60, decisionTo: 60, decisionStep: 1, miningProb: 1.622110e-17},
    {level: 260, n: 104, wc: 3, wr: 4, decisionFrom: 36, decisionTo: 68, decisionStep: 1, miningProb: 1.573970e-17},
    {level: 261, n: 116, wc: 3, wr: 4, decisionFrom: 50, decisionTo: 50, decisionStep: 1, miningProb: 1.529120e-17},
    {level: 262, n: 108, wc: 3, wr: 4, decisionFrom: 36, decisionTo: 72, decisionStep: 1, miningProb: 1.452810e-17},
    {level: 263, n: 100, wc: 3, wr: 4, decisionFrom: 32, decisionTo: 32, decisionStep: 1, miningProb: 1.452430e-17},
    {level: 264, n: 124, wc: 3, wr: 4, decisionFrom: 58, decisionTo: 58, decisionStep: 1, miningProb: 1.320160e-17},
    {level: 265, n: 128, wc: 3, wr: 4, decisionFrom: 32, decisionTo: 64, decisionStep: 2, miningProb: 1.103980e-17},
    {level: 266, n: 112, wc: 3, wr: 4, decisionFrom: 42, decisionTo: 42, decisionStep: 1, miningProb: 9.748530e-18},
    {level: 267, n: 124, wc: 3, wr: 4, decisionFrom: 56, decisionTo: 56, decisionStep: 1, miningProb: 9.408340e-18},
    {level: 268, n: 100, wc: 3, wr: 4, decisionFrom: 30, decisionTo: 70, decisionStep: 1, miningProb: 9.198900e-18},
    {level: 269, n: 116, wc: 3, wr: 4, decisionFrom: 48, decisionTo: 48, decisionStep: 1, miningProb: 8.218710e-18},
    {level: 270, n: 104, wc: 3, wr: 4, decisionFrom: 36, decisionTo: 36, decisionStep: 1, miningProb: 7.869870e-18},
    {level: 271, n: 120, wc: 3, wr: 4, decisionFrom: 60, decisionTo: 60, decisionStep: 1, miningProb: 7.586620e-18},
    {level: 272, n: 112, wc: 3, wr: 4, decisionFrom: 40, decisionTo: 72, decisionStep: 1, miningProb: 7.557840e-18},
    {level: 273, n: 108, wc: 3, wr: 4, decisionFrom: 36, decisionTo: 36, decisionStep: 1, miningProb: 7.264050e-18},
    {level: 274, n: 120, wc: 3, wr: 4, decisionFrom: 58, decisionTo: 58, decisionStep: 1, miningProb: 7.062330e-18},
    {level: 275, n: 124, wc: 3, wr: 4, decisionFrom: 54, decisionTo: 54, decisionStep: 1, miningProb: 5.908890e-18},
    {level: 276, n: 120, wc: 3, wr: 4, decisionFrom: 56, decisionTo: 56, decisionStep: 1, miningProb: 5.705970e-18},
    {level: 277, n: 104, wc: 3, wr: 4, decisionFrom: 34, decisionTo: 70, decisionStep: 1, miningProb: 5.397190e-18},
    {level: 278, n: 108, wc: 3, wr: 4, decisionFrom: 34, decisionTo: 74, decisionStep: 1, miningProb: 4.794130e-18},
    {level: 279, n: 100, wc: 3, wr: 4, decisionFrom: 30, decisionTo: 30, decisionStep: 1, miningProb: 4.599450e-18},
    {level: 280, n: 120, wc: 3, wr: 4, decisionFrom: 54, decisionTo: 54, decisionStep: 1, miningProb: 4.019430e-18},
    {level: 281, n: 116, wc: 3, wr: 4, decisionFrom: 46, decisionTo: 46, decisionStep: 1, miningProb: 3.945320e-18},
    {level: 282, n: 112, wc: 3, wr: 4, decisionFrom: 40, decisionTo: 40, decisionStep: 1, miningProb: 3.778920e-18},
    {level: 283, n: 116, wc: 3, wr: 4, decisionFrom: 44, decisionTo: 72, decisionStep: 1, miningProb: 3.423190e-18},
    {level: 284, n: 124, wc: 3, wr: 4, decisionFrom: 52, decisionTo: 52, decisionStep: 1, miningProb: 3.297090e-18},
    {level: 285, n: 100, wc: 3, wr: 4, decisionFrom: 28, decisionTo: 72, decisionStep: 1, miningProb: 2.795780e-18},
    {level: 286, n: 128, wc: 3, wr: 4, decisionFrom: 64, decisionTo: 64, decisionStep: 1, miningProb: 2.769110e-18},
    {level: 287, n: 112, wc: 3, wr: 4, decisionFrom: 38, decisionTo: 74, decisionStep: 1, miningProb: 2.714430e-18},
    {level: 288, n: 104, wc: 3, wr: 4, decisionFrom: 34, decisionTo: 34, decisionStep: 1, miningProb: 2.698600e-18},
    {level: 289, n: 128, wc: 3, wr: 4, decisionFrom: 62, decisionTo: 62, decisionStep: 1, miningProb: 2.590140e-18},
    {level: 290, n: 120, wc: 3, wr: 4, decisionFrom: 52, decisionTo: 52, decisionStep: 1, miningProb: 2.486040e-18},
    {level: 291, n: 108, wc: 3, wr: 4, decisionFrom: 34, decisionTo: 34, decisionStep: 1, miningProb: 2.397060e-18},
    {level: 292, n: 128, wc: 3, wr: 4, decisionFrom: 60, decisionTo: 60, decisionStep: 1, miningProb: 2.122380e-18},
    {level: 293, n: 104, wc: 3, wr: 4, decisionFrom: 32, decisionTo: 72, decisionStep: 1, miningProb: 1.744360e-18},
    {level: 294, n: 116, wc: 3, wr: 4, decisionFrom: 44, decisionTo: 44, decisionStep: 1, miningProb: 1.711600e-18},
    {level: 295, n: 124, wc: 3, wr: 4, decisionFrom: 50, decisionTo: 50, decisionStep: 1, miningProb: 1.649820e-18},
    {level: 296, n: 128, wc: 3, wr: 4, decisionFrom: 58, decisionTo: 58, decisionStep: 1, miningProb: 1.529130e-18},
    {level: 297, n: 108, wc: 3, wr: 4, decisionFrom: 32, decisionTo: 76, decisionStep: 1, miningProb: 1.506960e-18},
    {level: 298, n: 100, wc: 3, wr: 4, decisionFrom: 28, decisionTo: 28, decisionStep: 1, miningProb: 1.397890e-18},
    {level: 299, n: 120, wc: 3, wr: 4, decisionFrom: 50, decisionTo: 50, decisionStep: 1, miningProb: 1.362180e-18},
    {level: 300, n: 116, wc: 3, wr: 4, decisionFrom: 42, decisionTo: 74, decisionStep: 1, miningProb: 1.358390e-18},
    {level: 301, n: 112, wc: 3, wr: 4, decisionFrom: 38, decisionTo: 38, decisionStep: 1, miningProb: 1.357210e-18},
    {level: 302, n: 128, wc: 3, wr: 4, decisionFrom: 56, decisionTo: 56, decisionStep: 1, miningProb: 9.742990e-19},
    {level: 303, n: 112, wc: 3, wr: 4, decisionFrom: 36, decisionTo: 76, decisionStep: 1, miningProb: 9.147070e-19},
    {level: 304, n: 104, wc: 3, wr: 4, decisionFrom: 32, decisionTo: 32, decisionStep: 1, miningProb: 8.721800e-19},
    {level: 305, n: 108, wc: 3, wr: 4, decisionFrom: 32, decisionTo: 32, decisionStep: 1, miningProb: 7.534800e-19},
    {level: 306, n: 124, wc: 3, wr: 4, decisionFrom: 48, decisionTo: 48, decisionStep: 1, miningProb: 7.478050e-19},
    {level: 307, n: 116, wc: 3, wr: 4, decisionFrom: 42, decisionTo: 42, decisionStep: 1, miningProb: 6.791960e-19},
    {level: 308, n: 120, wc: 3, wr: 4, decisionFrom: 48, decisionTo: 48, decisionStep: 1, miningProb: 6.679650e-19},
    {level: 309, n: 124, wc: 3, wr: 4, decisionFrom: 46, decisionTo: 78, decisionStep: 1, miningProb: 6.204930e-19},
    {level: 310, n: 120, wc: 3, wr: 4, decisionFrom: 46, decisionTo: 74, decisionStep: 1, miningProb: 5.926870e-19},
    {level: 311, n: 128, wc: 3, wr: 4, decisionFrom: 54, decisionTo: 54, decisionStep: 1, miningProb: 5.530780e-19},
    {level: 312, n: 104, wc: 3, wr: 4, decisionFrom: 30, decisionTo: 74, decisionStep: 1, miningProb: 5.388680e-19},
    {level: 313, n: 116, wc: 3, wr: 4, decisionFrom: 40, decisionTo: 76, decisionStep: 1, miningProb: 4.990110e-19},
    {level: 314, n: 112, wc: 3, wr: 4, decisionFrom: 36, decisionTo: 36, decisionStep: 1, miningProb: 4.573530e-19},
    {level: 315, n: 108, wc: 3, wr: 4, decisionFrom: 30, decisionTo: 78, decisionStep: 1, miningProb: 4.570100e-19},
    {level: 316, n: 124, wc: 3, wr: 4, decisionFrom: 46, decisionTo: 46, decisionStep: 1, miningProb: 3.102460e-19},
    {level: 317, n: 120, wc: 3, wr: 4, decisionFrom: 46, decisionTo: 46, decisionStep: 1, miningProb: 2.963440e-19},
    {level: 318, n: 112, wc: 3, wr: 4, decisionFrom: 34, decisionTo: 78, decisionStep: 1, miningProb: 2.927770e-19},
    {level: 319, n: 128, wc: 3, wr: 4, decisionFrom: 52, decisionTo: 52, decisionStep: 1, miningProb: 2.821290e-19},
    {level: 320, n: 104, wc: 3, wr: 4, decisionFrom: 30, decisionTo: 30, decisionStep: 1, miningProb: 2.694340e-19},
    {level: 321, n: 116, wc: 3, wr: 4, decisionFrom: 40, decisionTo: 40, decisionStep: 1, miningProb: 2.495060e-19},
    {level: 322, n: 120, wc: 3, wr: 4, decisionFrom: 44, decisionTo: 76, decisionStep: 1, miningProb: 2.405750e-19},
    {level: 323, n: 124, wc: 3, wr: 4, decisionFrom: 44, decisionTo: 80, decisionStep: 1, miningProb: 2.381080e-19},
    {level: 324, n: 108, wc: 3, wr: 4, decisionFrom: 30, decisionTo: 30, decisionStep: 1, miningProb: 2.285050e-19},
    {level: 325, n: 116, wc: 3, wr: 4, decisionFrom: 38, decisionTo: 78, decisionStep: 1, miningProb: 1.717170e-19},
    {level: 326, n: 104, wc: 3, wr: 4, decisionFrom: 28, decisionTo: 76, decisionStep: 1, miningProb: 1.613020e-19},
    {level: 327, n: 112, wc: 3, wr: 4, decisionFrom: 34, decisionTo: 34, decisionStep: 1, miningProb: 1.463890e-19},
    {level: 328, n: 128, wc: 3, wr: 4, decisionFrom: 50, decisionTo: 50, decisionStep: 1, miningProb: 1.305320e-19},
    {level: 329, n: 120, wc: 3, wr: 4, decisionFrom: 44, decisionTo: 44, decisionStep: 1, miningProb: 1.202870e-19},
    {level: 330, n: 124, wc: 3, wr: 4, decisionFrom: 44, decisionTo: 44, decisionStep: 1, miningProb: 1.190540e-19},
    {level: 331, n: 128, wc: 3, wr: 4, decisionFrom: 48, decisionTo: 80, decisionStep: 1, miningProb: 1.106170e-19},
    {level: 332, n: 120, wc: 3, wr: 4, decisionFrom: 42, decisionTo: 78, decisionStep: 1, miningProb: 9.035000e-20},
    {level: 333, n: 112, wc: 3, wr: 4, decisionFrom: 32, decisionTo: 80, decisionStep: 1, miningProb: 9.008150e-20},
    {level: 334, n: 116, wc: 3, wr: 4, decisionFrom: 38, decisionTo: 38, decisionStep: 1, miningProb: 8.585840e-20},
    {level: 335, n: 124, wc: 3, wr: 4, decisionFrom: 42, decisionTo: 82, decisionStep: 1, miningProb: 8.539640e-20},
    {level: 336, n: 104, wc: 3, wr: 4, decisionFrom: 28, decisionTo: 28, decisionStep: 1, miningProb: 8.065090e-20},
    {level: 337, n: 116, wc: 3, wr: 4, decisionFrom: 36, decisionTo: 80, decisionStep: 1, miningProb: 5.599310e-20},
    {level: 338, n: 128, wc: 3, wr: 4, decisionFrom: 48, decisionTo: 48, decisionStep: 1, miningProb: 5.530870e-20},
    {level: 339, n: 120, wc: 3, wr: 4, decisionFrom: 42, decisionTo: 42, decisionStep: 1, miningProb: 4.517500e-20},
    {level: 340, n: 112, wc: 3, wr: 4, decisionFrom: 32, decisionTo: 32, decisionStep: 1, miningProb: 4.504080e-20},
    {level: 341, n: 128, wc: 3, wr: 4, decisionFrom: 46, decisionTo: 82, decisionStep: 1, miningProb: 4.334810e-20},
    {level: 342, n: 124, wc: 3, wr: 4, decisionFrom: 42, decisionTo: 42, decisionStep: 1, miningProb: 4.269820e-20},
    {level: 343, n: 120, wc: 3, wr: 4, decisionFrom: 40, decisionTo: 80, decisionStep: 1, miningProb: 3.174430e-20},
    {level: 344, n: 124, wc: 3, wr: 4, decisionFrom: 40, decisionTo: 84, decisionStep: 1, miningProb: 2.891760e-20},
    {level: 345, n: 116, wc: 3, wr: 4, decisionFrom: 36, decisionTo: 36, decisionStep: 1, miningProb: 2.799660e-20},
    {level: 346, n: 112, wc: 3, wr: 4, decisionFrom: 30, decisionTo: 82, decisionStep: 1, miningProb: 2.695640e-20},
    {level: 347, n: 128, wc: 3, wr: 4, decisionFrom: 46, decisionTo: 46, decisionStep: 1, miningProb: 2.167410e-20},
    {level: 348, n: 116, wc: 3, wr: 4, decisionFrom: 34, decisionTo: 82, decisionStep: 1, miningProb: 1.749650e-20},
    {level: 349, n: 120, wc: 3, wr: 4, decisionFrom: 40, decisionTo: 40, decisionStep: 1, miningProb: 1.587220e-20},
    {level: 350, n: 128, wc: 3, wr: 4, decisionFrom: 44, decisionTo: 84, decisionStep: 1, miningProb: 1.586440e-20},
    {level: 351, n: 124, wc: 3, wr: 4, decisionFrom: 40, decisionTo: 40, decisionStep: 1, miningProb: 1.445880e-20},
    {level: 352, n: 112, wc: 3, wr: 4, decisionFrom: 30, decisionTo: 30, decisionStep: 1, miningProb: 1.347820e-20},
    {level: 353, n: 120, wc: 3, wr: 4, decisionFrom: 38, decisionTo: 82, decisionStep: 1, miningProb: 1.054790e-20},
    {level: 354, n: 124, wc: 3, wr: 4, decisionFrom: 38, decisionTo: 86, decisionStep: 1, miningProb: 9.338320e-21},
    {level: 355, n: 116, wc: 3, wr: 4, decisionFrom: 34, decisionTo: 34, decisionStep: 1, miningProb: 8.748240e-21},
    {level: 356, n: 128, wc: 3, wr: 4, decisionFrom: 44, decisionTo: 44, decisionStep: 1, miningProb: 7.932220e-21},
    {level: 357, n: 128, wc: 3, wr: 4, decisionFrom: 42, decisionTo: 86, decisionStep: 1, miningProb: 5.474680e-21},
    {level: 358, n: 116, wc: 3, wr: 4, decisionFrom: 32, decisionTo: 84, decisionStep: 1, miningProb: 5.297010e-21},
    {level: 359, n: 120, wc: 3, wr: 4, decisionFrom: 38, decisionTo: 38, decisionStep: 1, miningProb: 5.273960e-21},
    {level: 360, n: 124, wc: 3, wr: 4, decisionFrom: 38, decisionTo: 38, decisionStep: 1, miningProb: 4.669160e-21},
    {level: 361, n: 120, wc: 3, wr: 4, decisionFrom: 36, decisionTo: 84, decisionStep: 1, miningProb: 3.349800e-21},
    {level: 362, n: 124, wc: 3, wr: 4, decisionFrom: 36, decisionTo: 88, decisionStep: 1, miningProb: 2.903950e-21},
    {level: 363, n: 128, wc: 3, wr: 4, decisionFrom: 42, decisionTo: 42, decisionStep: 1, miningProb: 2.737340e-21},
    {level: 364, n: 116, wc: 3, wr: 4, decisionFrom: 32, decisionTo: 32, decisionStep: 1, miningProb: 2.648510e-21},
    {level: 365, n: 128, wc: 3, wr: 4, decisionFrom: 40, decisionTo: 88, decisionStep: 1, miningProb: 1.798290e-21},
    {level: 366, n: 120, wc: 3, wr: 4, decisionFrom: 36, decisionTo: 36, decisionStep: 1, miningProb: 1.674900e-21},
    {level: 367, n: 124, wc: 3, wr: 4, decisionFrom: 36, decisionTo: 36, decisionStep: 1, miningProb: 1.451970e-21},
    {level: 368, n: 120, wc: 3, wr: 4, decisionFrom: 34, decisionTo: 86, decisionStep: 1, miningProb: 1.027330e-21},
    {level: 369, n: 128, wc: 3, wr: 4, decisionFrom: 40, decisionTo: 40, decisionStep: 1, miningProb: 8.991430e-22},
    {level: 370, n: 124, wc: 3, wr: 4, decisionFrom: 34, decisionTo: 90, decisionStep: 1, miningProb: 8.779540e-22},
    {level: 371, n: 128, wc: 3, wr: 4, decisionFrom: 38, decisionTo: 90, decisionStep: 1, miningProb: 5.674390e-22},
    {level: 372, n: 120, wc: 3, wr: 4, decisionFrom: 34, decisionTo: 34, decisionStep: 1, miningProb: 5.136640e-22},
    {level: 373, n: 124, wc: 3, wr: 4, decisionFrom: 34, decisionTo: 34, decisionStep: 1, miningProb: 4.389770e-22},
    {level: 374, n: 120, wc: 3, wr: 4, decisionFrom: 32, decisionTo: 88, decisionStep: 1, miningProb: 3.073590e-22},
    {level: 375, n: 128, wc: 3, wr: 4, decisionFrom: 38, decisionTo: 38, decisionStep: 1, miningProb: 2.837200e-22},
    {level: 376, n: 128, wc: 3, wr: 4, decisionFrom: 36, decisionTo: 92, decisionStep: 1, miningProb: 1.735640e-22},
    {level: 377, n: 120, wc: 3, wr: 4, decisionFrom: 32, decisionTo: 32, decisionStep: 1, miningProb: 1.536800e-22},
    {level: 378, n: 128, wc: 3, wr: 4, decisionFrom: 36, decisionTo: 36, decisionStep: 1, miningProb: 8.678180e-23},
    {level: 379, n: 128, wc: 3, wr: 4, decisionFrom: 34, decisionTo: 94, decisionStep: 1, miningProb: 5.192020e-23},
    {level: 380, n: 128, wc: 3, wr: 4, decisionFrom: 34, decisionTo: 34, decisionStep: 1, miningProb: 2.600000e-23}
];

class LDPCDifficulty {
    constructor() {
        this.table = DifficultyTable;
        this.SeoulDifficulty = 1023;
        this.minimumDifficulty = this.probToDifficulty(this.table[0].miningProb);
        
        // 난이도 계산 파라미터들
        this.BlockGenerationTime = 36; // 기본 네트워크용
        this.BlockGenerationTimeSeoul = 10; // Seoul 네트워크용
        this.Sensitivity = 8;
        this.SensitivityAnnapurna = 1024;
        this.threshold = 7;
    }

    // 확률을 난이도로 변환
    probToDifficulty(miningProb) {
        return Math.floor(1.0 / miningProb);
    }

    // 난이도를 확률로 변환
    difficultyToProb(difficulty) {
        return 1.0 / parseFloat(difficulty.toString());
    }

    // LDPC 난이도 계산기 생성 (노드 코드의 MakeLDPCDifficultyCalculator 기반)
    makeLDPCDifficultyCalculator() {
        return (time, parent) => {
            const bigTime = BigInt(time);
            const bigParentTime = BigInt(parent.time);
            const blockGenerationTime = BigInt(this.BlockGenerationTime);
            const sensitivity = BigInt(this.Sensitivity);
            const bigMinus99 = BigInt(-99);
            const big1 = BigInt(1);
            const big2 = BigInt(2);

            // (block_timestamp - parent_timestamp) / BlockGenerationTime
            let x = (bigTime - bigParentTime) / blockGenerationTime;

            // (2 if len(parent_uncles) else 1) - (block_timestamp - parent_timestamp) / BlockGenerationTime
            if (parent.uncleHash === '0x1dcc4de8dec75d7aab85b567b6ccd41ad312451b948a7413f0a142fd40d49347') {
                // EmptyUncleHash - no uncles
                x = big1 - x;
            } else {
                // Has uncles
                x = big2 - x;
            }

            // max(x, -99)
            if (x < bigMinus99) {
                x = bigMinus99;
            }

            // parent_diff + (parent_diff / Sensitivity * x)
            const parentDiff = BigInt(parent.difficulty.toString());
            const y = parentDiff / sensitivity;
            x = parentDiff + (y * x);

            // minimum difficulty check
            const minDiff = BigInt(this.minimumDifficulty);
            if (x < minDiff) {
                x = minDiff;
            }

            return x.toString();
        };
    }

    // Seoul 네트워크용 난이도 계산기 (노드 코드의 MakeLDPCDifficultyCalculator_Seoul 기반)
    makeLDPCDifficultyCalculatorSeoul() {
        return (time, parent) => {
            const bigTime = BigInt(time);
            const bigParentTime = BigInt(parent.time);
            const blockGenerationTime = BigInt(this.BlockGenerationTimeSeoul);
            const sensitivity = BigInt(this.Sensitivity);
            const bigMinus99 = BigInt(-99);
            const big1 = BigInt(1);
            const big2 = BigInt(2);

            // (block_timestamp - parent_timestamp) / BlockGenerationTimeSeoul
            let x = (bigTime - bigParentTime) / blockGenerationTime;

            // (2 if len(parent_uncles) else 1) - (block_timestamp - parent_timestamp) / BlockGenerationTimeSeoul
            if (parent.uncleHash === '0x1dcc4de8dec75d7aab85b567b6ccd41ad312451b948a7413f0a142fd40d49347') {
                x = big1 - x;
            } else {
                x = big2 - x;
            }

            // max(x, -99)
            if (x < bigMinus99) {
                x = bigMinus99;
            }

            // parent_diff + (parent_diff / Sensitivity * x)
            const parentDiff = BigInt(parent.difficulty.toString());
            const y = parentDiff / sensitivity;
            x = parentDiff + (y * x);

            // Seoul minimum difficulty check
            const seoulMinDiff = BigInt(this.SeoulDifficulty);
            if (x < seoulMinDiff) {
                x = seoulMinDiff;
            }

            return x.toString();
        };
    }

    // Annapurna 네트워크용 난이도 계산기
    makeLDPCDifficultyCalculatorAnnapurna() {
        return (time, parent) => {
            const bigTime = BigInt(time);
            const bigParentTime = BigInt(parent.time);
            const threshold = BigInt(this.threshold);
            const sensitivity = BigInt(this.SensitivityAnnapurna);
            const bigMinus99 = BigInt(-99);
            const big1 = BigInt(1);
            const big2 = BigInt(2);

            // (block_timestamp - parent_timestamp) / 7
            let x = (bigTime - bigParentTime) / threshold;

            // (2 if len(parent_uncles) else 1) - (block_timestamp - parent_timestamp) / 7
            if (parent.uncleHash === '0x1dcc4de8dec75d7aab85b567b6ccd41ad312451b948a7413f0a142fd40d49347') {
                x = big1 - x;
            } else {
                x = big2 - x;
            }

            // max(x, -99)
            if (x < bigMinus99) {
                x = bigMinus99;
            }

            // parent_diff + (parent_diff / 1024 * x)
            const parentDiff = BigInt(parent.difficulty.toString());
            const y = parentDiff / sensitivity;
            x = parentDiff + (y * x);

            // Seoul minimum difficulty check (Annapurna uses same as Seoul)
            const seoulMinDiff = BigInt(this.SeoulDifficulty);
            if (x < seoulMinDiff) {
                x = seoulMinDiff;
            }

            return x.toString();
        };
    }

    // 검색 레벨 계산 (노드 코드의 SearchLevel 기반)
    searchLevel(difficulty) {
        const currentProb = this.difficultyToProb(difficulty);
        let level = 0;
        let distance = 1.0;

        for (let i = 0; i < this.table.length; i++) {
            const tableDist = Math.abs(currentProb - this.table[i].miningProb);
            if (tableDist <= distance) {
                level = this.table[i].level;
                distance = tableDist;
            } else {
                break;
            }
        }

        return level;
    }

    // Seoul 네트워크 검색 레벨 계산 (노드 코드의 SearchLevel_Seoul 기반)
    searchLevelSeoul(difficulty) {
        let level = 0;
        const difficultyBigInt = BigInt(difficulty.toString());
        const seoulDifficultyBigInt = BigInt(this.SeoulDifficulty);
        const levelProb = { numerator: 29n, denominator: 20n }; // 29/20 = 1.45

        let difficultyRatio = difficultyBigInt * levelProb.denominator;
        const threshold = seoulDifficultyBigInt * levelProb.numerator;

        while (difficultyRatio >= threshold) {
            difficultyRatio = difficultyRatio * levelProb.denominator / levelProb.numerator;
            level++;
        }

        return Math.max(0, level);
    }

    // 난이도 변화 계산 (네트워크 타입에 따라)
    calculateDifficulty(time, parent, networkType = 'default') {
        switch (networkType) {
            case 'seoul':
                return this.makeLDPCDifficultyCalculatorSeoul()(time, parent);
            case 'annapurna':
                return this.makeLDPCDifficultyCalculatorAnnapurna()(time, parent);
            default:
                return this.makeLDPCDifficultyCalculator()(time, parent);
        }
    }

    // 테이블 엔트리 가져오기
    getTableEntry(level) {
        return this.table[level] || this.table[0];
    }

    // Seoul 네트워크용 동적 테이블 엔트리 생성
    getSeoulTableEntry(level) {
        const n = 64 + level * 4;
        return {
            level: level,
            n: n,
            wc: 3,
            wr: 4,
            decisionFrom: Math.floor(n / 4),
            decisionTo: Math.floor(n * 3 / 4),
            decisionStep: 1,
            miningProb: 0 // Seoul에서는 사용하지 않음
        };
    }

    // 난이도 테이블 전체 가져오기
    getDifficultyTable() {
        return this.table;
    }

    // 최소/최대 난이도 가져오기
    getMinimumDifficulty() {
        return this.minimumDifficulty;
    }

    getSeoulDifficulty() {
        return this.SeoulDifficulty;
    }

    // 난이도 유효성 검사
    isValidDifficulty(difficulty, networkType = 'default') {
        const diff = BigInt(difficulty.toString());
        
        if (networkType === 'seoul') {
            return diff >= BigInt(this.SeoulDifficulty);
        } else {
            return diff >= BigInt(this.minimumDifficulty);
        }
    }

    // 다음 난이도 예측
    predictNextDifficulty(currentBlock, targetTime, networkType = 'default') {
        const estimatedTime = Math.floor(Date.now() / 1000);
        const mockParent = {
            time: currentBlock.timestamp,
            difficulty: currentBlock.difficulty,
            uncleHash: currentBlock.uncleHash || '0x1dcc4de8dec75d7aab85b567b6ccd41ad312451b948a7413f0a142fd40d49347'
        };

        return this.calculateDifficulty(estimatedTime + targetTime, mockParent, networkType);
    }
}

module.exports = { LDPCDifficulty, DifficultyTable };