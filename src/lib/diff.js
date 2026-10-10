
export function diffLines(oldText, newText) {
  const a = oldText.split('\n')
  const b = newText.split('\n')
  const n = a.length
  const m = b.length

  if (n * m > 4_000_000) {
    return null
  }

  const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1))
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      dp[i][j] =
        a[i] === b[j]
          ? dp[i + 1][j + 1] + 1
          : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }

  const result = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      result.push({ type: 'same', text: a[i] })
      i += 1
      j += 1
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      result.push({ type: 'remove', text: a[i] })
      i += 1
    } else {
      result.push({ type: 'add', text: b[j] })
      j += 1
    }
  }
  while (i < n) {
    result.push({ type: 'remove', text: a[i] })
    i += 1
  }
  while (j < m) {
    result.push({ type: 'add', text: b[j] })
    j += 1
  }

  return result
}