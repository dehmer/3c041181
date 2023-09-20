export function memo(getDeps, fn, opts) {
  let deps = opts.initialDeps ?? []
  let result

  return () => {
    let depTime
    if (opts.key && opts.debug?.()) depTime = Date.now()

    const newDeps = getDeps()

    const depsChanged =
      newDeps.length !== deps.length ||
      newDeps.some((dep, index) => deps[index] !== dep)

    if (!depsChanged) {
      return result
    }

    deps = newDeps

    let resultTime
    if (opts.key && opts.debug?.()) resultTime = Date.now()

    result = fn(...newDeps)

    if (opts.key && opts.debug?.()) {
      const depEndTime = Math.round((Date.now() - depTime) * 100) / 100
      const resultEndTime = Math.round((Date.now() - resultTime) * 100) / 100
      const resultFpsPercentage = resultEndTime / 16

      const pad = (str, num) => {
        str = String(str)
        while (str.length < num) {
          str = " " + str
        }
        return str
      }

      console.info(
        `%c⏱ ${pad(resultEndTime, 5)} /${pad(depEndTime, 5)} ms`,
        `
          font-size: .6rem;
          font-weight: bold;
          color: hsl(${Math.max(
            0,
            Math.min(120 - 120 * resultFpsPercentage, 120)
          )}deg 100% 31%);`,
        opts?.key
      )
    }

    opts?.onChange?.(result)

    return result
  }
}

export function notUndefined(value, msg) {
  if (value === undefined) {
    throw new Error(`Unexpected undefined${msg ? `: ${msg}` : ""}`)
  } else {
    return value
  }
}

export const approxEqual = (a, b) => Math.abs(a - b) < 1
