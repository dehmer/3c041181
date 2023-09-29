import { approxEqual, memo, notUndefined } from "./utils"
export * from "./utils"

export const rangeExtractor = range => {
  const start = Math.max(range.startIndex - range.overscan, 0)
  const end = Math.min(range.endIndex + range.overscan, range.count - 1)

  const arr = []

  for (let i = start; i <= end; i++) {
    arr.push(i)
  }

  return arr
}

const observeElementRect = (element, cb) => {
  if (!element) return

  const handler = rect => {
    const { width, height } = rect
    cb({ width: Math.round(width), height: Math.round(height) })
  }

  handler(element.getBoundingClientRect())

  const observer = new ResizeObserver(entries => {
    const entry = entries[0]
    if (entry?.borderBoxSize) {
      const box = entry.borderBoxSize[0]
      if (box) {
        handler({ width: box.inlineSize, height: box.blockSize })
        return
      }
    }
    handler(element.getBoundingClientRect())
  })

  observer.observe(element, { box: "border-box" })

  return () => {
    observer.unobserve(element)
  }
}

const observeElementOffset = (element, cb) => {
  if (!element) return

  const handler = () => cb(element.scrollTop)
  handler()

  element.addEventListener("scroll", handler, {
    passive: true
  })

  return () => {
    element.removeEventListener("scroll", handler)
  }
}

const measureElement = (element, entry) => {
  if (entry?.borderBoxSize) {
    const box = entry.borderBoxSize[0]
    if (box) return Math.round(box.blockSize)
  }
  return Math.round(element.getBoundingClientRect().height)
}

export class Virtualizer {
  unsubs = []
  scrollElement = null
  isScrolling = false
  isScrollingTimeoutId = null
  scrollToIndexTimeoutId = null
  measurementsCache = []
  itemSizeCache = new Map()
  pendingMeasuredCacheIndexes = []
  scrollDirection = null
  scrollAdjustments = 0
  measureElementCache = new Map()

  observer = (() => {
    let _ro = null

    const get = () => {
      if (_ro) {
        return _ro
      } else if (typeof ResizeObserver !== 'undefined') {
        return (_ro = new ResizeObserver((entries) => {
          entries.forEach((entry) => {
            this._measureElement(entry.target, entry)
          })
        }))
      } else {
        return null
      }
    }

    return {
      disconnect: () => get()?.disconnect(),
      observe: target => get()?.observe(target, { box: 'border-box' }),
      unobserve: target => get()?.unobserve(target),
    }
  })()

  range = {
    startIndex: 0,
    endIndex: 0
  }

  constructor(options) {

    Object.entries(options).forEach(([key, value]) => {
      if (typeof value === "undefined") delete options[key]
    })

    this.options = {
      debug: false,
      initialOffset: 0,
      overscan: 1,
      paddingStart: 0,
      paddingEnd: 0,
      scrollPaddingStart: 0,
      scrollPaddingEnd: 0,
      onChange: () => {},
      initialRect: { width: 0, height: 0 },
      scrollMargin: 0,
      scrollingDelay: 150,
      indexAttribute: "data-index",
      initialMeasurementsCache: [],
      lanes: 1,
      ...options
    }

    this.scrollRect = this.options.initialRect
    this.scrollOffset = this.options.initialOffset
    this.measurementsCache = this.options.initialMeasurementsCache
    this.measurementsCache.forEach(item => {
      this.itemSizeCache.set(item.key, item.size)
    })

    this.maybeNotify()
  }

  notify = () => {
    this.options.onChange?.(this)
  }

  cleanup = () => {
    this.unsubs.filter(Boolean).forEach(d => d())
    this.unsubs = []
    this.scrollElement = null
  }

  _didMount = () => {
    this.measureElementCache.forEach(this.observer.observe)
    return () => {
      this.observer.disconnect()
      this.cleanup()
    }
  }

  _willUpdate = () => {
    const scrollElement = this.options.getScrollElement()

    if (this.scrollElement !== scrollElement) {
      this.cleanup()

      this.scrollElement = scrollElement

      this._scrollToOffset(this.scrollOffset)

      this.unsubs.push(
        observeElementRect(this.scrollElement, rect => {
          const prev = this.scrollRect
          this.scrollRect = rect
          if (rect.height !== prev.height) {
            this.maybeNotify()
          }
        })
      )

      this.unsubs.push(
        observeElementOffset(this.scrollElement, offset => {
          this.scrollAdjustments = 0

          if (this.scrollOffset === offset) {
            return
          }

          if (this.isScrollingTimeoutId !== null) {
            clearTimeout(this.isScrollingTimeoutId)
            this.isScrollingTimeoutId = null
          }

          this.isScrolling = true
          this.scrollDirection =
            this.scrollOffset < offset ? "forward" : "backward"
          this.scrollOffset = offset

          this.maybeNotify()

          this.isScrollingTimeoutId = setTimeout(() => {
            this.isScrollingTimeoutId = null
            this.isScrolling = false
            this.scrollDirection = null

            this.maybeNotify()
          }, this.options.scrollingDelay)
        })
      )
    }
  }

  getSize = () => {
    return this.scrollRect.height
  }

  memoOptions = memo(
    () => [
      this.options.count,
      this.options.paddingStart,
      this.options.scrollMargin
    ],
    (count, paddingStart, scrollMargin) => {
      this.pendingMeasuredCacheIndexes = []
      return {
        count,
        paddingStart,
        scrollMargin
      }
    },
    {
      key: false
    }
  )

  getFurthestMeasurement = (measurements, index) => {
    const furthestMeasurementsFound = new Map()
    const furthestMeasurements = new Map()
    for (let m = index - 1; m >= 0; m--) {
      const measurement = measurements[m]

      if (furthestMeasurementsFound.has(measurement.lane)) {
        continue
      }

      const previousFurthestMeasurement = furthestMeasurements.get(
        measurement.lane
      )
      if (
        previousFurthestMeasurement == null ||
        measurement.end > previousFurthestMeasurement.end
      ) {
        furthestMeasurements.set(measurement.lane, measurement)
      } else if (measurement.end < previousFurthestMeasurement.end) {
        furthestMeasurementsFound.set(measurement.lane, true)
      }

      if (furthestMeasurementsFound.size === this.options.lanes) {
        break
      }
    }

    return furthestMeasurements.size === this.options.lanes
      ? Array.from(furthestMeasurements.values()).sort(
          (a, b) => a.end - b.end
        )[0]
      : undefined
  }

  getMeasurements = memo(
    () => [this.memoOptions(), this.itemSizeCache],
    ({ count, paddingStart, scrollMargin }, itemSizeCache) => {
      const min =
        this.pendingMeasuredCacheIndexes.length > 0
          ? Math.min(...this.pendingMeasuredCacheIndexes)
          : 0
      this.pendingMeasuredCacheIndexes = []

      const measurements = this.measurementsCache.slice(0, min)

      for (let i = min; i < count; i++) {
        const furthestMeasurement =
          this.options.lanes === 1
            ? measurements[i - 1]
            : this.getFurthestMeasurement(measurements, i)

        const start = furthestMeasurement
          ? furthestMeasurement.end
          : paddingStart + scrollMargin

        const measuredSize = itemSizeCache.get(i)
        const size =
          typeof measuredSize === "number"
            ? measuredSize
            : this.options.estimateSize(i)

        const end = start + size

        const lane = furthestMeasurement
          ? furthestMeasurement.lane
          : i % this.options.lanes

        measurements[i] = {
          index: i,
          key: i,
          start,
          size,
          end,
          lane
        }
      }

      this.measurementsCache = measurements

      return measurements
    },
    {
      key: process.env.NODE_ENV !== "production" && "getMeasurements",
      debug: () => this.options.debug
    }
  )

  calculateRange = memo(
    () => [this.getMeasurements(), this.getSize(), this.scrollOffset],
    (measurements, outerSize, scrollOffset) => {
      return (this.range = calculateRange({
        measurements,
        outerSize,
        scrollOffset
      }))
    },
    {
      key: process.env.NODE_ENV !== "production" && "calculateRange",
      debug: () => this.options.debug
    }
  )

  maybeNotify = memo(
    () => {
      const range = this.calculateRange()

      return [range.startIndex, range.endIndex, this.isScrolling]
    },
    () => {
      this.notify()
    },
    {
      key: process.env.NODE_ENV !== "production" && "maybeNotify",
      debug: () => this.options.debug,
      initialDeps: [
        this.range.startIndex,
        this.range.endIndex,
        this.isScrolling
      ]
    }
  )

  getIndexes = memo(
    () => [
      this.calculateRange(),
      this.options.overscan,
      this.options.count
    ],
    (range, overscan, count) => {
      return rangeExtractor({
        ...range,
        overscan,
        count
      })
    },
    {
      key: process.env.NODE_ENV !== "production" && "getIndexes",
      debug: () => this.options.debug
    }
  )

  indexFromElement = node => {
    const attributeName = this.options.indexAttribute
    const indexStr = node.getAttribute(attributeName)

    if (!indexStr) {
      console.warn(
        `Missing attribute name '${attributeName}={index}' on measured element.`
      )
      return -1
    }

    return parseInt(indexStr, 10)
  }

  _measureElement = (node, entry) => {
    const item = this.measurementsCache[this.indexFromElement(node)]
    if (!item) {
      this.measureElementCache.forEach((cached, key) => {
        if (cached === node) {
          this.observer.unobserve(node)
          this.measureElementCache.delete(key)
        }
      })
      return
    }

    const prevNode = this.measureElementCache.get(item.key)

    if (!node.isConnected) {
      if (prevNode) {
        this.observer.unobserve(prevNode)
        this.measureElementCache.delete(item.key)
      }
      return
    }

    if (prevNode !== node) {
      if (prevNode) {
        this.observer.unobserve(prevNode)
      }
      this.observer.observe(node)
      this.measureElementCache.set(item.key, node)
    }

    const measuredItemSize = measureElement(node, entry)

    this.resizeItem(item, measuredItemSize)
  }

  resizeItem = (item, size) => {
    const itemSize = this.itemSizeCache.get(item.key) ?? item.size
    const delta = size - itemSize

    if (delta !== 0) {
      if (item.start < this.scrollOffset) {
        if (process.env.NODE_ENV !== "production" && this.options.debug) {
          console.info("correction", delta)
        }

        this._scrollToOffset(this.scrollOffset, this.scrollAdjustments += delta)
      }

      this.pendingMeasuredCacheIndexes.push(item.index)
      this.itemSizeCache = new Map(this.itemSizeCache.set(item.key, size))

      this.notify()
    }
  }

  measureElement = node => {
    if (!node) {
      return
    }

    this._measureElement(node, undefined)
  }

  getVirtualItems = memo(
    () => [this.getIndexes(), this.getMeasurements()],
    (indexes, measurements) => {
      const virtualItems = []

      for (let k = 0, len = indexes.length; k < len; k++) {
        const i = indexes[k]
        const measurement = measurements[i]

        virtualItems.push(measurement)
      }

      return virtualItems
    },
    {
      key: process.env.NODE_ENV !== "production" && "getIndexes",
      debug: () => this.options.debug
    }
  )

  getVirtualItemForOffset = offset => {
    const measurements = this.getMeasurements()

    return notUndefined(
      measurements[
        findNearestBinarySearch(
          0,
          measurements.length - 1,
          index => notUndefined(measurements[index]).start,
          offset
        )
      ]
    )
  }

  getOffsetForAlignment = (toOffset, align) => {
    const size = this.getSize()

    if (align === "auto") {
      if (toOffset <= this.scrollOffset) {
        align = "start"
      } else if (toOffset >= this.scrollOffset + size) {
        align = "end"
      } else {
        align = "start"
      }
    }

    if (align === "start") {
      toOffset = toOffset
    } else if (align === "end") {
      toOffset = toOffset - size
    } else if (align === "center") {
      toOffset = toOffset - size / 2
    }

    const scrollSizeProp = "scrollHeight"
    const scrollSize = this.scrollElement
      ? "document" in this.scrollElement
        ? this.scrollElement.document.documentElement[scrollSizeProp]
        : this.scrollElement[scrollSizeProp]
      : 0

    const maxOffset = scrollSize - this.getSize()
    return Math.max(Math.min(maxOffset, toOffset), 0)
  }

  getOffsetForIndex = (index, align = "auto") => {
    index = Math.max(0, Math.min(index, this.options.count - 1))

    const measurement = notUndefined(this.getMeasurements()[index])

    if (align === "auto") {
      if (
        measurement.end >=
        this.scrollOffset + this.getSize() - this.options.scrollPaddingEnd
      ) {
        align = "end"
      } else if (
        measurement.start <=
        this.scrollOffset + this.options.scrollPaddingStart
      ) {
        align = "start"
      } else {
        return [this.scrollOffset, align]
      }
    }

    const toOffset =
      align === "end"
        ? measurement.end + this.options.scrollPaddingEnd
        : measurement.start - this.options.scrollPaddingStart

    return [this.getOffsetForAlignment(toOffset, align), align]
  }

  cancelScrollToIndex = () => {
    if (this.scrollToIndexTimeoutId !== null) {
      clearTimeout(this.scrollToIndexTimeoutId)
      this.scrollToIndexTimeoutId = null
    }
  }

  scrollToOffset = (toOffset, { align = "start" } = {}) => {
    this.cancelScrollToIndex()
    this._scrollToOffset(this.getOffsetForAlignment(toOffset, align))
  }

  scrollToIndex = (index, { align: initialAlign = "auto" } = {}) => {
    index = Math.max(0, Math.min(index, this.options.count - 1))

    this.cancelScrollToIndex()

    const [toOffset, align] = this.getOffsetForIndex(index, initialAlign)

    this._scrollToOffset(toOffset)

    // We are in dynamic mode by default:
    this.scrollToIndexTimeoutId = setTimeout(() => {
      this.scrollToIndexTimeoutId = null
      const elementInDOM = this.measureElementCache.has(index)

      if (elementInDOM) {
        const [toOffset] = this.getOffsetForIndex(index, align)
        if (!approxEqual(toOffset, this.scrollOffset)) {
          this.scrollToIndex(index, { align })
        }
      } else {
        this.scrollToIndex(index, { align })
      }
    })
  }

  scrollBy = delta => {
    this.cancelScrollToIndex()
    this._scrollToOffset(this.scrollOffset + delta)
  }

  getTotalSize = () =>
    (this.getMeasurements()[this.options.count - 1]?.end ||
      this.options.paddingStart) -
    this.options.scrollMargin +
    this.options.paddingEnd

  _scrollToOffset = (offset, adjustments = 0) => {
    this.scrollElement?.scrollTo?.({ top: offset + adjustments })
  }

  measure = () => {
    this.itemSizeCache = new Map()
    this.notify()
  }
}

const findNearestBinarySearch = (low, high, getCurrentValue, value) => {
  while (low <= high) {
    const middle = ((low + high) / 2) | 0
    const currentValue = getCurrentValue(middle)

    if (currentValue < value) {
      low = middle + 1
    } else if (currentValue > value) {
      high = middle - 1
    } else {
      return middle
    }
  }

  if (low > 0) {
    return low - 1
  } else {
    return 0
  }
}

function calculateRange({ measurements, outerSize, scrollOffset }) {
  const count = measurements.length - 1
  const getOffset = index => measurements[index].start

  const startIndex = findNearestBinarySearch(0, count, getOffset, scrollOffset)
  let endIndex = startIndex

  while (
    endIndex < count &&
    measurements[endIndex].end < scrollOffset + outerSize
  ) {
    endIndex++
  }

  return { startIndex, endIndex }
}
