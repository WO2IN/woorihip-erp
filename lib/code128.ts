/** Code 128. 막대·여백 너비(모듈)를 순서대로 돌려준다. 출력 가능한 ASCII만 받는다. */
const CODE128 = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
  '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
  '114131', '311141', '411131', '211412', '211214', '211232', '2331112',
]

const START_B = 104
const START_C = 105
const CODE_B = 100
const CODE_C = 99
const STOP = 106

function digitRun(text: string, index: number) {
  let count = 0
  while (index + count < text.length && text.charCodeAt(index + count) >= 48 && text.charCodeAt(index + count) <= 57) count += 1
  return count
}

export function code128Modules(text: string): number[] | null {
  if (!text || [...text].some((char) => {
    const code = char.charCodeAt(0)
    return code < 32 || code > 126
  })) return null

  const symbols: number[] = []
  let index = 0
  let codeSet: 'B' | 'C'
  const startRun = digitRun(text, 0)
  if (startRun >= 4 || (startRun === text.length && startRun >= 2 && startRun % 2 === 0)) {
    symbols.push(START_C)
    codeSet = 'C'
  } else {
    symbols.push(START_B)
    codeSet = 'B'
  }

  while (index < text.length) {
    if (codeSet === 'C') {
      if (digitRun(text, index) >= 2) {
        symbols.push(Number(text.slice(index, index + 2)))
        index += 2
        continue
      }
      symbols.push(CODE_B)
      codeSet = 'B'
      continue
    }
    if (digitRun(text, index) >= 4) {
      symbols.push(CODE_C)
      codeSet = 'C'
      continue
    }
    symbols.push(text.charCodeAt(index) - 32)
    index += 1
  }

  let checksum = symbols[0]
  for (let position = 1; position < symbols.length; position += 1) checksum += symbols[position] * position
  checksum %= 103
  symbols.push(checksum, STOP)
  return symbols.flatMap((symbol) => [...CODE128[symbol]].map(Number))
}
